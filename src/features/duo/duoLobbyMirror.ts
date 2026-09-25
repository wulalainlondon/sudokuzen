// Duo WebSocket 房間的大廳「麵包屑」——讓 Cloudflare DO 房間能被現有大廳發現。
//
// DO 才是遊戲狀態的權威來源；這裡只在 Firestore 的 duo_ws_rooms 寫一筆輕量
// discovery 記錄，由 host 端自行維護：建房寫入、等待中定期 touch 保鮮、
// 有人加入或離開即刪除。舊 Firebase 客戶端查的是 duo_rooms，完全不受影響。

import { gs, type DuoRoomData } from '../../game/state';
import { getPlayerIdentity } from '../../firebase/client';
import { firebaseServerTimestamp, getAuthUid, getFirebaseIdToken } from '../../firebase/runtime';
import type { FirestoreDoc, FirestoreSnap, FirestoreDocRef } from '../../firebase/types';
import type { DuoRoomSummary } from './duoRoom';
import { publicPlayerAlias } from '../../platform/publicAlias';
import type { SudokuWindow } from '../../facade/windowTypes';
import { getDuoWsHost } from './duoTransport';
import { t } from '../../i18n/t';

const WS_LOBBY_COLLECTION = 'duo_ws_rooms';
// 15s touch：搭配 duoLobby 的 ROOM_FRESHNESS_MS=45s，健康 host 的 heartbeat 最舊只 ~15s，
// 既不會被誤隱藏，又讓死房的麵包屑更快過了 45s 顯示門檻而隱藏。
const WS_LOBBY_TOUCH_MS = 15_000;
const WS_LOBBY_DISPLAY_FRESH_MS = 45_000;
// 不可逆刪除的門檻——與「顯示過期」（ROOM_FRESHNESS_MS 45s）刻意脫鉤：
// 顯示過期只是大廳隱藏（host 一旦恢復 touch 就會重新出現），真正 delete 留給確定
// 死亡的殘檔（>3 分鐘無 touch），避免短暫網路抖動造成房間被誤刪後再也回不來。
const WS_LOBBY_DEAD_MS = 180_000;
const WS_LOBBY_REST_TIMEOUT_MS = 8_000;
const WS_LOBBY_SDK_TIMEOUT_MS = 3_000;
const WS_LOBBY_WRITE_TIMEOUT_MS = 4_000;
const WS_LOBBY_WORKER_TIMEOUT_MS = 2_000;

let _publishedRoomId: string | null = null;
let _touchTimer: ReturnType<typeof setInterval> | null = null;
let _pagehideBound = false;
let _desiredVisible = false;
let _visibilityEpoch = 0;
type RoomConfig = { roomId: string; tierId: string; modeId: string };
let _hostRoomConfig: RoomConfig | null = null;
let _publishInFlight: { roomId: string; epoch: number; promise: Promise<void> } | null = null;
let _needsRepublish = false;
const _mutationChains = new Map<string, Promise<void>>();
const _removals = new Map<string, Promise<void>>();
const _removalRetries = new Map<string, ReturnType<typeof setTimeout>>();
let _publishRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _publishRetryAttempts = 0;

export function getWsLobbyMirrorDebugState(): {
  desiredVisible: boolean;
  roomId: string | null;
  publicationState: 'hidden' | 'publishing' | 'retrying' | 'published';
} {
  return {
    desiredVisible: _desiredVisible,
    roomId: _hostRoomConfig?.roomId ?? null,
    publicationState: !_desiredVisible
      ? 'hidden'
      : _publishedRoomId
        ? 'published'
        : _publishRetryTimer
          ? 'retrying'
          : 'publishing',
  };
}

function renderPublicationState(): void {
  const element = document.getElementById('duo-room-publication-state');
  if (!element) return;
  const state = getWsLobbyMirrorDebugState().publicationState;
  const visible = state === 'publishing' || state === 'retrying';
  element.classList.toggle('hidden', !visible);
  element.textContent = visible ? t(state === 'retrying' ? 'duo.roomPublishRetrying' : 'duo.roomPublishing') : '';
}

function wsLobbyDoc(roomId: string) {
  return gs.db!.collection(WS_LOBBY_COLLECTION).doc(roomId);
}

function wantsRoom(roomId: string): boolean {
  return _desiredVisible && _hostRoomConfig?.roomId === roomId;
}

// Use the Worker to write through Firestore REST, independently of the SDK's
// persistent write stream (which can stall in an iOS standalone PWA).
async function mutateViaWorker(
  method: 'PUT' | 'PATCH' | 'DELETE',
  roomId: string,
  body: Record<string, string> | null,
  shouldProceed: () => boolean,
  onLateSuccess: () => void,
): Promise<void> {
  const controller = new AbortController();
  let expired = false;
  const operation = (async (): Promise<boolean> => {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('Lobby auth unavailable');
    if (expired || !shouldProceed()) return false;
    const response = await fetch(`https://${getDuoWsHost()}/lobby/${encodeURIComponent(roomId)}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Lobby Worker ${response.status}`);
    return true;
  })();
  void operation.then(
    (wrote) => {
      if (expired && wrote) onLateSuccess();
    },
    () => {},
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          controller.abort();
          reject(new Error('Lobby Worker timed out'));
        }, WS_LOBBY_WORKER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function mutateWithSdkFallback(
  method: 'PUT' | 'PATCH' | 'DELETE',
  roomId: string,
  body: Record<string, string> | null,
  sdkOperation: () => Promise<void>,
  shouldProceed: () => boolean,
  onLateSuccess: () => void,
): Promise<void> {
  try {
    await mutateViaWorker(method, roomId, body, shouldProceed, onLateSuccess);
  } catch {
    if (shouldProceed()) await sdkOperation();
  }
}

// A Firestore write cannot be cancelled. Release the per-room queue on a
// deadline, but keep observing the original operation to reconcile late writes.
function enqueueMutation(roomId: string, operation: () => Promise<void>, onLateSuccess?: () => void): Promise<void> {
  const previous = _mutationChains.get(roomId) ?? Promise.resolve();
  const next = previous.then(
    () =>
      new Promise<void>((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => {
          expired = true;
          reject(new Error('Lobby write timed out'));
        }, WS_LOBBY_WRITE_TIMEOUT_MS);
        Promise.resolve()
          .then(operation)
          .then(
            () => {
              clearTimeout(timer);
              if (!expired) resolve();
              else {
                try {
                  onLateSuccess?.();
                } catch (error) {
                  console.warn('[duoWsLobby] late reconciliation failed:', error);
                }
              }
            },
            (error) => {
              clearTimeout(timer);
              if (!expired) reject(error);
            },
          );
      }),
  );
  const settled = next.then(
    () => {},
    () => {},
  );
  _mutationChains.set(roomId, settled);
  void settled.then(() => {
    if (_mutationChains.get(roomId) === settled) _mutationChains.delete(roomId);
  });
  return next;
}

function reconcileLateWrite(roomId: string, ref: FirestoreDocRef): void {
  if (!wantsRoom(roomId)) {
    removeRoom(roomId, ref);
    return;
  }
  // Never delete a room that has since been republished. Refresh the latest
  // intended metadata and heartbeat after any currently running publish.
  _publishedRoomId = null;
  stopTouch();
  _needsRepublish = true;
  renderPublicationState();
  if (!_publishInFlight) void showWsLobbyRoom();
}

function removeRoom(roomId: string, ref: FirestoreDocRef, attempt = 0): void {
  if (_removals.has(roomId)) return;
  const retry = _removalRetries.get(roomId);
  if (retry) {
    clearTimeout(retry);
    _removalRetries.delete(roomId);
  }
  const pending = enqueueMutation(
    roomId,
    () =>
      mutateWithSdkFallback(
        'DELETE',
        roomId,
        null,
        () => ref.delete(),
        () => !wantsRoom(roomId),
        () => {
          if (wantsRoom(roomId)) reconcileLateWrite(roomId, ref);
        },
      ),
    () => {
      if (wantsRoom(roomId)) reconcileLateWrite(roomId, ref);
    },
  );
  _removals.set(roomId, pending);
  void pending
    .catch(() => {
      if (attempt >= 2 || wantsRoom(roomId)) return;
      const timer = setTimeout(
        () => {
          _removalRetries.delete(roomId);
          if (!wantsRoom(roomId)) removeRoom(roomId, ref, attempt + 1);
        },
        1000 * 2 ** attempt,
      );
      _removalRetries.set(roomId, timer);
    })
    .finally(() => {
      if (_removals.get(roomId) === pending) _removals.delete(roomId);
    });
}

export async function publishWsLobbyRoom(roomId: string, tierId: string, modeId: string): Promise<void> {
  const old = _hostRoomConfig;
  if (!_desiredVisible || old?.roomId !== roomId || old.tierId !== tierId || old.modeId !== modeId) {
    _visibilityEpoch++;
    _publishedRoomId = null;
    _needsRepublish = false;
    clearPublishRetry();
    stopTouch();
    _publishRetryAttempts = 0;
    _hostRoomConfig = { roomId, tierId, modeId };
    _desiredVisible = true;
    if (old && old.roomId !== roomId && gs.db) removeRoom(old.roomId, wsLobbyDoc(old.roomId));
  }
  bindPagehide();
  renderPublicationState();
  await showWsLobbyRoom();
}

function showWsLobbyRoom(): Promise<void> {
  const config = _hostRoomConfig;
  const ownerUid = getAuthUid();
  if (!config || !_desiredVisible) return Promise.resolve();
  const epoch = _visibilityEpoch;
  if (_publishInFlight?.roomId === config.roomId && _publishInFlight.epoch === epoch) return _publishInFlight.promise;
  if (!gs.firebaseReady || !gs.db || !ownerUid) {
    schedulePublishRetry();
    return Promise.resolve();
  }
  const ref = wsLobbyDoc(config.roomId);
  const { playerId, alias } = getPlayerIdentity();
  _needsRepublish = false;
  stopTouch();
  const publishing = (async () => {
    try {
      await enqueueMutation(
        config.roomId,
        () => {
          if (!wantsRoom(config.roomId) || epoch !== _visibilityEpoch) return Promise.resolve();
          const data = {
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
          };
          return mutateWithSdkFallback(
            'PUT',
            config.roomId,
            { hostId: playerId, hostAlias: alias || 'Player', tierId: config.tierId, modeId: config.modeId },
            () => ref.set(data),
            () => wantsRoom(config.roomId) && epoch === _visibilityEpoch,
            () => reconcileLateWrite(config.roomId, ref),
          );
        },
        () => reconcileLateWrite(config.roomId, ref),
      );
      if (!wantsRoom(config.roomId) || epoch !== _visibilityEpoch) {
        reconcileLateWrite(config.roomId, ref);
        return;
      }
      _publishedRoomId = config.roomId;
      _publishRetryAttempts = 0;
      clearPublishRetry();
      renderPublicationState();
      startTouch();
    } catch (error) {
      console.warn('[duoWsLobby] publish failed:', error);
      if (wantsRoom(config.roomId) && epoch === _visibilityEpoch) {
        _publishedRoomId = null;
        schedulePublishRetry();
      }
    } finally {
      if (_publishInFlight?.roomId === config.roomId && _publishInFlight.epoch === epoch) {
        _publishInFlight = null;
        if (_needsRepublish && _desiredVisible) void showWsLobbyRoom();
      }
    }
  })();
  _publishInFlight = { roomId: config.roomId, epoch, promise: publishing };
  return publishing;
}

function schedulePublishRetry(): void {
  if (!_desiredVisible || !_hostRoomConfig || _publishRetryTimer) return;
  const delay = Math.min(10_000, 1000 * 2 ** Math.min(_publishRetryAttempts, 3));
  _publishRetryAttempts++;
  _publishRetryTimer = setTimeout(() => {
    _publishRetryTimer = null;
    void showWsLobbyRoom();
  }, delay);
  renderPublicationState();
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
    const roomId = _publishedRoomId;
    if (!roomId || !gs.firebaseReady || !gs.db) return;
    const epoch = _visibilityEpoch;
    const ref = wsLobbyDoc(roomId);
    void enqueueMutation(
      roomId,
      () => {
        if (!wantsRoom(roomId) || epoch !== _visibilityEpoch) return Promise.resolve();
        return mutateWithSdkFallback(
          'PATCH',
          roomId,
          null,
          () => ref.update({ hostHeartbeatAtMs: Date.now(), updatedAt: firebaseServerTimestamp() }),
          () => wantsRoom(roomId) && epoch === _visibilityEpoch,
          () => reconcileLateWrite(roomId, ref),
        );
      },
      () => reconcileLateWrite(roomId, ref),
    ).catch(() => {
      if (!wantsRoom(roomId) || epoch !== _visibilityEpoch) return;
      _publishedRoomId = null;
      stopTouch();
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

function bindPagehide(): void {
  if (_pagehideBound || typeof window === 'undefined') return;
  _pagehideBound = true;
  window.addEventListener('pagehide', () => {
    if (_hostRoomConfig) unpublishWsLobbyRoom();
  });
  const recover = () => {
    if (!_desiredVisible || document.visibilityState !== 'visible') return;
    clearPublishRetry();
    void showWsLobbyRoom();
  };
  window.addEventListener('online', recover);
  document.addEventListener('visibilitychange', recover);
}

function hideWsLobbyRoom(clearConfig: boolean): void {
  const wasVisible = _desiredVisible || _publishedRoomId !== null;
  _desiredVisible = false;
  _visibilityEpoch++;
  _needsRepublish = false;
  clearPublishRetry();
  _publishRetryAttempts = 0;
  stopTouch();
  const roomId = _publishedRoomId || _hostRoomConfig?.roomId || null;
  _publishedRoomId = null;
  if (clearConfig) _hostRoomConfig = null;
  renderPublicationState();
  if (wasVisible && roomId && gs.firebaseReady && gs.db) removeRoom(roomId, wsLobbyDoc(roomId));
}

export function unpublishWsLobbyRoom(): void {
  hideWsLobbyRoom(true);
}

export function syncWsLobbyRoom(d: DuoRoomData, roomId: string | null): void {
  if (d.status === 'waiting' && !d.guestId && roomId) {
    const changed =
      !_hostRoomConfig ||
      _hostRoomConfig.roomId !== roomId ||
      _hostRoomConfig.tierId !== d.tierId ||
      _hostRoomConfig.modeId !== d.modeId;
    if (changed || !_desiredVisible) void publishWsLobbyRoom(roomId, d.tierId, d.modeId);
    else if (_publishedRoomId !== roomId && !_publishRetryTimer) void showWsLobbyRoom();
    return;
  }
  hideWsLobbyRoom(false);
}

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  timestampValue?: string;
}

interface FirestoreRestDocument {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
}

export function parseWsLobbyRestDocuments(documents: FirestoreRestDocument[], now = Date.now()): DuoRoomSummary[] {
  const rows: DuoRoomSummary[] = [];
  for (const doc of documents) {
    const fields = doc.fields ?? {};
    const hostId = fields.hostId?.stringValue ?? '';
    const roomId = doc.name?.split('/').pop() ?? '';
    const hb = Number(fields.hostHeartbeatAtMs?.integerValue ?? 0);
    if (!roomId || !hostId || (hb > 0 && now - hb > WS_LOBBY_DEAD_MS)) continue;
    const updatedAtMs = Date.parse(fields.updatedAt?.timestampValue ?? '');
    rows.push({
      roomId,
      tierId: fields.tierId?.stringValue ?? '',
      modeId: fields.modeId?.stringValue ?? '',
      status: 'waiting',
      hostId,
      hostAlias: publicPlayerAlias(hostId, fields.hostAlias?.stringValue ?? '--'),
      guestAlias: null,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : hb,
      hostHeartbeatAtMs: hb,
    });
  }
  return rows;
}

// WebKit standalone PWAs have occasionally returned an empty server-source
// snapshot while the same live document is visible through Firestore REST.
// Forced reads start REST alongside the SDK so SDK reconnect delays cannot
// prevent discovery through the independent Worker path.
async function listWaitingWsRoomsViaRest(limit: number): Promise<DuoRoomSummary[]> {
  const config = (window as SudokuWindow).SUDOKU_FIREBASE_CONFIG;
  const projectId = config?.projectId;
  if (!projectId || typeof fetch !== 'function') return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WS_LOBBY_REST_TIMEOUT_MS);
  try {
    // Prefer the existing Duo Worker as a bounded proxy. This avoids the
    // cross-origin Firestore REST failure observed in iOS standalone PWAs.
    const workerEndpoint = `https://${getDuoWsHost()}/lobby?limit=${Math.max(1, limit)}`;
    let response = await fetch(workerEndpoint, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      const params = new URLSearchParams({
        pageSize: String(Math.max(1, limit)),
        orderBy: 'updatedAt desc',
      });
      if (config.apiKey) params.set('key', config.apiKey);
      const firestoreEndpoint =
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
        `/databases/(default)/documents/${WS_LOBBY_COLLECTION}?${params}`;
      response = await fetch(firestoreEndpoint, { cache: 'no-store', signal: controller.signal });
    }
    if (!response.ok) throw new Error(`Lobby REST ${response.status}`);
    const payload = (await response.json()) as { documents?: FirestoreRestDocument[] };
    return parseWsLobbyRestDocuments(payload.documents ?? []);
  } catch (error) {
    console.warn('[duoWsLobby] REST fallback failed:', error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// 大廳列出等待中的 WS 房（取代 WS 模式下對 duo_rooms 的查詢）。
// 回傳全部（顯示過期由 renderRoomList 的 freshness 過濾負責），只順手刪除
// 確定死亡（>3 分鐘無 touch）的殘檔，自癒且不誤刪短暫抖動的活房。
export async function listWaitingWsRooms(limit = 20, opts: { force?: boolean } = {}): Promise<DuoRoomSummary[]> {
  if (!gs.firebaseReady || !gs.db) return [];
  const restRead = opts.force ? listWaitingWsRoomsViaRest(limit) : null;
  let sdkTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = gs.db.collection(WS_LOBBY_COLLECTION).orderBy('updatedAt', 'desc').limit(limit);
    // iOS standalone PWA can keep a stale Firestore query snapshot after a
    // background/offline transition. A player-triggered refresh must bypass
    // that cache, otherwise a healthy room can disappear until the SDK
    // eventually reconnects.
    const sdkRead = query.get(opts.force ? { source: 'server' } : undefined);
    const snap: FirestoreSnap = await Promise.race([
      sdkRead,
      new Promise<never>((_, reject) => {
        sdkTimer = setTimeout(() => reject(new Error('Lobby SDK read timed out')), WS_LOBBY_SDK_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(sdkTimer);
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
    if (opts.force) {
      // A server-source SDK query can be partially stale on iOS standalone
      // PWAs: it may contain one healthy cached room while omitting a newer
      // room. Always reconcile manual refreshes with the Worker snapshot,
      // rather than using REST only when the SDK list is completely empty.
      const restRows = (await restRead) ?? [];
      const merged = new Map<string, DuoRoomSummary>();
      for (const room of rows) merged.set(room.roomId, room);
      for (const room of restRows) {
        const existing = merged.get(room.roomId);
        if (!existing || room.updatedAtMs >= existing.updatedAtMs) merged.set(room.roomId, room);
      }
      return [...merged.values()]
        .filter((room) => {
          const heartbeat = room.hostHeartbeatAtMs || room.updatedAtMs;
          return heartbeat > 0 && Date.now() - heartbeat < WS_LOBBY_DISPLAY_FRESH_MS;
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        .slice(0, Math.max(1, limit));
    }
    return rows;
  } catch (e) {
    console.warn('[duoWsLobby] list failed:', e);
    if (restRead) return restRead;
    return [];
  } finally {
    clearTimeout(sdkTimer);
  }
}
