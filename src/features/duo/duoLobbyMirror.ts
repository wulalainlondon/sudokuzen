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

const WS_LOBBY_COLLECTION = 'duo_ws_rooms';
const WS_LOBBY_TOUCH_MS = 30_000;
// 不可逆刪除的門檻——與「顯示過期」（duoLobby 的 ROOM_FRESHNESS_MS ~90s）刻意脫鉤：
// 顯示過期只是大廳隱藏（host 一旦恢復 touch 就會重新出現），真正 delete 留給確定
// 死亡的殘檔（>3 分鐘無 touch），避免短暫網路抖動造成房間被誤刪後再也回不來。
const WS_LOBBY_DEAD_MS = 180_000;

let _publishedRoomId: string | null = null;
let _touchTimer: ReturnType<typeof setInterval> | null = null;
let _pagehideBound = false;

function wsLobbyDoc(roomId: string) {
  return gs.db!.collection(WS_LOBBY_COLLECTION).doc(roomId);
}

// host 建立 WS 房後寫一筆大廳記錄並開始保鮮。
export async function publishWsLobbyRoom(roomId: string, tierId: string, modeId: string): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  const { playerId, alias } = getPlayerIdentity();
  // 先停掉任何前一房殘留的 timer，確保 timer 與 _publishedRoomId 強一致（連續建房）。
  stopTouch();
  _publishedRoomId = roomId;
  bindPagehide();
  try {
    await wsLobbyDoc(roomId).set({
      roomId,
      hostId: playerId,
      hostOwnerUid: getAuthUid() || '',
      hostAlias: alias || 'Player',
      tierId,
      modeId,
      status: 'waiting',
      transport: 'ws',
      hostHeartbeatAtMs: Date.now(),
      updatedAt: firebaseServerTimestamp(),
    });
  } catch (e) {
    console.warn('[duoWsLobby] publish failed:', e);
  }
  startTouch();
}

function startTouch(): void {
  if (_touchTimer) return;
  _touchTimer = setInterval(() => {
    if (!_publishedRoomId || !gs.firebaseReady) return;
    wsLobbyDoc(_publishedRoomId)
      .update({ hostHeartbeatAtMs: Date.now(), updatedAt: firebaseServerTimestamp() })
      .catch(() => {});
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
export function unpublishWsLobbyRoom(): void {
  stopTouch();
  const roomId = _publishedRoomId;
  _publishedRoomId = null;
  if (!roomId || !gs.firebaseReady || !gs.db) return;
  wsLobbyDoc(roomId)
    .delete()
    .catch(() => {});
}

// host 從每次 snapshot 觀察房況：有 guest 進來或離開 waiting → 下架。
export function syncWsLobbyRoom(d: DuoRoomData): void {
  if (!_publishedRoomId) return;
  if (d.guestId || d.status !== 'waiting') unpublishWsLobbyRoom();
}

// 大廳列出等待中的 WS 房（取代 WS 模式下對 duo_rooms 的查詢）。
// 回傳全部（顯示過期由 renderRoomList 的 freshness 過濾負責），只順手刪除
// 確定死亡（>3 分鐘無 touch）的殘檔，自癒且不誤刪短暫抖動的活房。
export async function listWaitingWsRooms(limit = 20): Promise<DuoRoomSummary[]> {
  if (!gs.firebaseReady || !gs.db) return [];
  try {
    const snap: FirestoreSnap = await gs.db
      .collection(WS_LOBBY_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
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
        hostAlias: typeof d.hostAlias === 'string' ? d.hostAlias : '--',
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
