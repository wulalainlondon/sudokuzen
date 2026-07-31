// Duo WebSocket 房間的大廳「麵包屑」——讓 Cloudflare DO 房間能被現有大廳發現。
//
// DO 才是遊戲狀態的權威來源；這裡只在 Firestore 的 duo_ws_rooms 寫一筆輕量
// discovery 記錄，由 host 端自行維護：建房寫入、等待中定期 touch 保鮮、
// 有人加入或離開即刪除。舊 Firebase 客戶端查的是 duo_rooms，完全不受影響。

import { gs, type DuoRoomData } from '../../game/state';
import { getPlayerIdentity } from '../../firebase/client';
import { firebaseServerTimestamp, getAuthUid } from '../../firebase/runtime';
import type { FirestoreDoc, FirestoreSnap } from '../../firebase/types';
import type { DuoRoomSummary } from './duoRoom';
import { publicPlayerAlias } from '../../platform/publicAlias';

const WS_LOBBY_COLLECTION = 'duo_ws_rooms';
// 15s touch：搭配 duoLobby 的 ROOM_FRESHNESS_MS=45s，健康 host 的 heartbeat 最舊只 ~15s，
// 既不會被誤隱藏，又讓死房的麵包屑更快過了 45s 顯示門檻而隱藏。
const WS_LOBBY_TOUCH_MS = 15_000;
// 不可逆刪除的門檻——與「顯示過期」（ROOM_FRESHNESS_MS 45s）刻意脫鉤：
// 顯示過期只是大廳隱藏（host 一旦恢復 touch 就會重新出現），真正 delete 留給確定
// 死亡的殘檔（>3 分鐘無 touch），避免短暫網路抖動造成房間被誤刪後再也回不來。
const WS_LOBBY_DEAD_MS = 180_000;

let _publishedRoomId: string | null = null;
let _touchTimer: ReturnType<typeof setInterval> | null = null;
let _pagehideBound = false;
let _desiredVisible = false;
let _visibilityEpoch = 0;
let _hostRoomConfig: { roomId: string; tierId: string; modeId: string } | null = null;
let _mutationChain: Promise<unknown> = Promise.resolve();
let _publishRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _publishRetryAttempts = 0;

export function getWsLobbyMirrorDebugState(): { desiredVisible: boolean; roomId: string | null } {
  return {
    desiredVisible: _desiredVisible,
    roomId: _hostRoomConfig?.roomId ?? null,
  };
}

function wsLobbyDoc(roomId: string) {
  return gs.db!.collection(WS_LOBBY_COLLECTION).doc(roomId);
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const next = _mutationChain.then(operation, operation);
  _mutationChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// host 建立 WS 房後寫一筆大廳記錄並開始保鮮。
export async function publishWsLobbyRoom(roomId: string, tierId: string, modeId: string): Promise<void> {
  _hostRoomConfig = { roomId, tierId, modeId };
  _desiredVisible = true;
  await showWsLobbyRoom();
}

async function showWsLobbyRoom(): Promise<void> {
  const config = _hostRoomConfig;
  const ownerUid = getAuthUid();
  if (!config || !_desiredVisible) return;
  if (!gs.firebaseReady || !gs.db || !ownerUid) {
    schedulePublishRetry();
    return;
  }
  const { playerId, alias } = getPlayerIdentity();
  stopTouch();
  _desiredVisible = true;
  const epoch = ++_visibilityEpoch;
  _publishedRoomId = config.roomId;
  bindPagehide();
  try {
    await enqueueMutation(() =>
      wsLobbyDoc(config.roomId).set({
        roomId: config.roomId,
        hostId: playerId,
        hostOwnerUid: ownerUid,
        hostAlias: alias || 'Player',
        tierId: config.tierId,
        modeId: config.modeId,
        status: 'waiting',
        transport: 'ws',
        hostHeartbeatAtMs: Date.now(),
        updatedAt: firebaseServerTimestamp(),
      }),
    );
  } catch (e) {
    console.warn('[duoWsLobby] publish failed:', e);
    if (epoch === _visibilityEpoch) _publishedRoomId = null;
    schedulePublishRetry();
    return;
  }
  // A guest may have joined while the async Firestore set was in flight.
  // Reconcile the final desired state so the completed set cannot resurrect
  // a room that should already be hidden.
  if (epoch !== _visibilityEpoch || !_desiredVisible) {
    await enqueueMutation(() => wsLobbyDoc(config.roomId).delete()).catch(() => {});
    return;
  }
  _publishRetryAttempts = 0;
  clearPublishRetry();
  startTouch();
}

function schedulePublishRetry(): void {
  if (!_desiredVisible || !_hostRoomConfig || _publishRetryTimer) return;
  const delay = Math.min(10_000, 1000 * Math.pow(2, Math.min(_publishRetryAttempts, 3)));
  _publishRetryAttempts++;
  _publishRetryTimer = setTimeout(() => {
    _publishRetryTimer = null;
    void showWsLobbyRoom();
  }, delay);
}

function clearPublishRetry(): void {
  if (_publishRetryTimer) {
    clearTimeout(_publishRetryTimer);
    _publishRetryTimer = null;
  }
}

function startTouch(): void {
  if (_touchTimer) return;
  _touchTimer = setInterval(() => {
    if (!_publishedRoomId || !gs.firebaseReady) return;
    wsLobbyDoc(_publishedRoomId)
      .update({ hostHeartbeatAtMs: Date.now(), updatedAt: firebaseServerTimestamp() })
      .catch(() => {
        _publishedRoomId = null;
        schedulePublishRetry();
      });
  }, WS_LOBBY_TOUCH_MS);
}

function stopTouch(): void {
  if (_touchTimer) {
    clearInterval(_touchTimer);
    _touchTimer = null;
  }
}

// 分頁關閉時 best-effort 清掉自己的麵包屑（不保證送達，真正的安全網是 list 時的死亡清理）。
function bindPagehide(): void {
  if (_pagehideBound || typeof window === 'undefined') return;
  _pagehideBound = true;
  window.addEventListener('pagehide', () => {
    if (_publishedRoomId) unpublishWsLobbyRoom();
  });
}

// 從大廳移除（有人加入、離開、結束）。idempotent。
function hideWsLobbyRoom(clearConfig: boolean): void {
  _desiredVisible = false;
  _visibilityEpoch++;
  clearPublishRetry();
  _publishRetryAttempts = 0;
  stopTouch();
  const roomId = _publishedRoomId || _hostRoomConfig?.roomId || null;
  _publishedRoomId = null;
  if (clearConfig) _hostRoomConfig = null;
  if (!roomId || !gs.firebaseReady || !gs.db) return;
  void enqueueMutation(() => wsLobbyDoc(roomId).delete()).catch(() => {});
}

export function unpublishWsLobbyRoom(): void {
  hideWsLobbyRoom(true);
}

// host 從每次 snapshot 觀察房況：有 guest 或已開局時暫時下架；guest
// 在倒數前斷線、房間回到 waiting 時重新發布。roomId 參數也讓整頁重載後
// 能重建遺失的 module-level breadcrumb 狀態。
export function syncWsLobbyRoom(d: DuoRoomData, roomId: string | null): void {
  if (d.status === 'waiting' && !d.guestId && roomId) {
    const configChanged =
      !_hostRoomConfig ||
      _hostRoomConfig.roomId !== roomId ||
      _hostRoomConfig.tierId !== d.tierId ||
      _hostRoomConfig.modeId !== d.modeId;
    if (configChanged || !_desiredVisible) {
      void publishWsLobbyRoom(roomId, d.tierId, d.modeId);
    } else if (_publishedRoomId !== roomId) {
      void showWsLobbyRoom();
    }
    return;
  }
  hideWsLobbyRoom(false);
}

// 大廳列出等待中的 WS 房（取代 WS 模式下對 duo_rooms 的查詢）。
// 回傳全部（顯示過期由 renderRoomList 的 freshness 過濾負責），只順手刪除
// 確定死亡（>3 分鐘無 touch）的殘檔，自癒且不誤刪短暫抖動的活房。
export async function listWaitingWsRooms(limit = 20, opts: { force?: boolean } = {}): Promise<DuoRoomSummary[]> {
  if (!gs.firebaseReady || !gs.db) return [];
  try {
    const query = gs.db.collection(WS_LOBBY_COLLECTION).orderBy('updatedAt', 'desc').limit(limit);
    // iOS standalone PWA can keep a stale Firestore query snapshot after a
    // background/offline transition. A player-triggered refresh must bypass
    // that cache, otherwise a healthy room can disappear until the SDK
    // eventually reconnects.
    const snap: FirestoreSnap = await query.get(opts.force ? { source: 'server' } : undefined);
    const now = Date.now();
    const rows: DuoRoomSummary[] = [];
    const deadDeletes: Promise<unknown>[] = [];
    snap.forEach((doc: FirestoreDoc) => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const hb = typeof d.hostHeartbeatAtMs === 'number' ? d.hostHeartbeatAtMs : 0;
      if (hb > 0 && now - hb > WS_LOBBY_DEAD_MS) {
        deadDeletes.push(doc.ref.delete().catch(() => {}));
        return;
      }
      if (typeof d.hostId !== 'string' || !d.hostId) return;
      const ts = d.updatedAt as { toDate?: () => Date } | undefined;
      rows.push({
        roomId: doc.id,
        tierId: typeof d.tierId === 'string' ? d.tierId : '',
        modeId: typeof d.modeId === 'string' ? d.modeId : '',
        status: 'waiting',
        hostId: d.hostId,
        hostAlias: publicPlayerAlias(d.hostId, typeof d.hostAlias === 'string' ? d.hostAlias : '--'),
        guestAlias: null,
        updatedAtMs: ts?.toDate?.()?.getTime?.() ?? hb,
        hostHeartbeatAtMs: hb,
      });
    });
    if (deadDeletes.length) void Promise.allSettled(deadDeletes);
    return rows;
  } catch (e) {
    console.warn('[duoWsLobby] list failed:', e);
    return [];
  }
}
