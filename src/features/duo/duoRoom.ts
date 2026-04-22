// Duo room CRUD — Firebase room management extracted from duo.ts
// All room creation, joining, subscribing, cleanup, and heartbeat logic lives here.

import { gs, type DuoRoomData } from '../../game/state';
import { getPlayerIdentity } from '../../firebase/client';
import { firebaseServerTimestamp, firebaseTimestampFromMillis, getAuthUid, callDuoFunction } from '../../firebase/runtime';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { getEquippedTitleDisplay } from '../titles';
import type { FirestoreDoc, FirestoreSnap } from '../../firebase/types';
import { bumpDuoMetric } from './duoMetrics';
import { SK } from '../../storage/keys';
import { loadDuoProfile } from './duoProfile';

export function getFirebaseFieldValue() {
  return { serverTimestamp: firebaseServerTimestamp };
}
export function getFirebaseTimestamp() {
  return { fromMillis: firebaseTimestampFromMillis };
}

export interface DuoRoomSummary {
  roomId: string;
  tierId: string;
  modeId: string;
  status: DuoRoomData['status'];
  hostId: string;
  hostAlias: string;
  guestAlias: string | null;
  updatedAtMs: number;
  hostHeartbeatAtMs: number;
}

// ── Constants ────────────────────────────────────────────────────────

const DUO_ROOMS_COLLECTION = 'duo_rooms';
const WAITING_ROOMS_CACHE_MS = 5000;
const WAITING_ROOMS_MIN_FETCH_GAP_MS = 1200;
const DUO_HEARTBEAT_MS = 15_000;
export const DUO_STALE_HEARTBEAT_MS = 60_000;
const DUO_ROOM_COUNTDOWN_STALE_MS = 3 * 60_000;
const DUO_ROOM_WAITING_TTL_MS = 15 * 60_000;
const DUO_ROOM_FINISHED_RETENTION_MS = 6 * 60 * 60_000;
const DUO_CLEANUP_INTERVAL_MS = 5 * 60_000;
const MAX_SNAPSHOT_RETRIES = 5;

// ── Module state ─────────────────────────────────────────────────────

let _activeRoomId: string | null = (() => {
  try {
    return localStorage.getItem(SK.DUO_ACTIVE_ROOM_ID);
  } catch {
    return null;
  }
})();
let _waitingRoomsCache: { rows: DuoRoomSummary[]; ts: number; limit: number } | null = null;
let _waitingRoomsInFlight: Promise<DuoRoomSummary[]> | null = null;
let _lastWaitingRoomsFetchMs = 0;
let _duoHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _lastStaleGuestPruneMs = 0;
let _lastDuoCleanupMs = 0;
let _snapshotRetryCount = 0;
let _snapshotRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let _heartbeatConsecFailures = 0;
let _heartbeatRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let _visibilityHandler: (() => void) | null = null;

// Snapshot handler — set by duoGame.ts to break circular dependency
let _snapshotHandler: ((d: DuoRoomData) => void) | null = null;
export function setSnapshotHandler(fn: (d: DuoRoomData) => void): void {
  _snapshotHandler = fn;
}

// Reset callback — set by duoGame.ts
let _resetHandler: (() => void) | null = null;
export function setResetHandler(fn: () => void): void {
  _resetHandler = fn;
}

// ── Helpers ──────────────────────────────────────────────────────────

function setActiveRoomId(roomId: string | null): void {
  _activeRoomId = roomId;
  if (roomId) localStorage.setItem(SK.DUO_ACTIVE_ROOM_ID, roomId);
  else localStorage.removeItem(SK.DUO_ACTIVE_ROOM_ID);
}

export function getActiveDuoRoomId(): string | null {
  return _activeRoomId;
}

function makeRoomId(): string {
  return `r_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function duoRoomRef(roomId?: string) {
  const id = roomId || _activeRoomId;
  if (!id) throw new Error('duoRoomRef: no room id');
  return gs.db!.collection(DUO_ROOMS_COLLECTION).doc(id);
}

function docToSummary(roomId: string, d: DuoRoomData): DuoRoomSummary {
  const updatedAtMs = d.updatedAt?.toDate?.()?.getTime?.() ?? 0;
  return {
    roomId,
    tierId: d.tierId || '',
    modeId: d.modeId || '',
    status: d.status,
    hostId: d.hostId,
    hostAlias: d.hostAlias || '--',
    guestAlias: d.guestAlias || null,
    updatedAtMs,
    hostHeartbeatAtMs: d.hostHeartbeatAtMs ?? 0,
  };
}

// ── List rooms ───────────────────────────────────────────────────────

export async function listWaitingDuoRooms(limit = 20, opts: { force?: boolean } = {}): Promise<DuoRoomSummary[]> {
  if (!gs.firebaseReady || !gs.db) return [];
  const db = gs.db;
  const force = !!opts.force;
  const now = Date.now();
  if (
    !force &&
    _waitingRoomsCache &&
    now - _waitingRoomsCache.ts <= WAITING_ROOMS_CACHE_MS &&
    limit <= _waitingRoomsCache.limit
  ) {
    bumpDuoMetric('lobbyFetchHits');
    return _waitingRoomsCache.rows.slice(0, limit);
  }
  if (!force && _waitingRoomsInFlight) {
    bumpDuoMetric('lobbyFetchHits');
    return _waitingRoomsInFlight;
  }
  if (!force && _waitingRoomsCache && now - _lastWaitingRoomsFetchMs < WAITING_ROOMS_MIN_FETCH_GAP_MS) {
    bumpDuoMetric('lobbyFetchThrottled');
    return _waitingRoomsCache.rows.slice(0, limit);
  }
  const normalize = (snap: FirestoreSnap): DuoRoomSummary[] => {
    const rows: DuoRoomSummary[] = [];
    snap.forEach((doc: FirestoreDoc) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      if (!d || !d.hostId) return;
      rows.push(docToSummary(doc.id, d));
    });
    return rows.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, Math.max(1, limit));
  };
  const fetchPromise = (async (): Promise<DuoRoomSummary[]> => {
    bumpDuoMetric('lobbyFetches');
    _lastWaitingRoomsFetchMs = Date.now();
    try {
      bumpDuoMetric('roomReadOps');
      const orderedSnap = await db
        .collection(DUO_ROOMS_COLLECTION)
        .where('status', '==', 'waiting')
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get();
      const rows = normalize(orderedSnap);
      _waitingRoomsCache = { rows, ts: Date.now(), limit };
      return rows;
    } catch {
      try {
        bumpDuoMetric('roomReadOps');
        const fallbackSnap = await db
          .collection(DUO_ROOMS_COLLECTION)
          .where('status', '==', 'waiting')
          .limit(limit * 2)
          .get();
        const rows = normalize(fallbackSnap);
        _waitingRoomsCache = { rows, ts: Date.now(), limit };
        return rows;
      } catch (e2) {
        console.warn('listWaitingDuoRooms failed:', e2);
        return [];
      }
    }
  })();
  _waitingRoomsInFlight = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    _waitingRoomsInFlight = null;
  }
}

export function invalidateWaitingRoomsCache(): void {
  _waitingRoomsCache = null;
}

// ── Heartbeat ────────────────────────────────────────────────────────

function startDuoRoomHeartbeat(): void {
  if (_duoHeartbeatTimer) return;
  const tick = async () => {
    if (!gs.firebaseReady || !_activeRoomId || !gs.duoRole) return;
    const hbField = gs.duoRole === 'host' ? 'hostHeartbeatAtMs' : 'guestHeartbeatAtMs';
    const onlineField = gs.duoRole === 'host' ? 'hostOnline' : 'guestOnline';
    try {
      bumpDuoMetric('heartbeatWrites');
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().update({
        [hbField]: Date.now(),
        [onlineField]: true,
      });
      _heartbeatConsecFailures = 0;
    } catch {
      _heartbeatConsecFailures++;
      // Retry once quickly on transient failure (≤2 consecutive) so opponent
      // doesn't see a stale heartbeat during a brief network blip.
      if (_heartbeatConsecFailures <= 2) {
        _heartbeatRetryTimeout = setTimeout(() => {
          _heartbeatRetryTimeout = null;
          void tick();
        }, 3_000);
      } else {
        // More than 2 consecutive failures — schedule a recovery attempt in 30s
        if (_heartbeatRetryTimeout) {
          clearTimeout(_heartbeatRetryTimeout);
        }
        _heartbeatRetryTimeout = setTimeout(() => {
          _heartbeatRetryTimeout = null;
          void tick();
        }, 30_000);
      }
    }
  };
  void tick();
  _duoHeartbeatTimer = setInterval(() => {
    void tick();
  }, DUO_HEARTBEAT_MS);
}

export function stopDuoRoomHeartbeat(): void {
  if (_duoHeartbeatTimer) {
    clearInterval(_duoHeartbeatTimer);
    _duoHeartbeatTimer = null;
  }
  if (_heartbeatRetryTimeout) {
    clearTimeout(_heartbeatRetryTimeout);
    _heartbeatRetryTimeout = null;
  }
  _heartbeatConsecFailures = 0;
  detachVisibilityHandler();
}

// ── Cleanup stale rooms ──────────────────────────────────────────────

export async function cleanupStaleDuoRooms(force = false): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  const db = gs.db;
  const now = Date.now();
  if (!force && now - _lastDuoCleanupMs < DUO_CLEANUP_INTERVAL_MS) return;
  // Cross-tab debounce via localStorage
  const LS_CLEANUP_KEY = 'sudoku_duo_last_cleanup_ms';
  if (!force) {
    const lastGlobal = Number(localStorage.getItem(LS_CLEANUP_KEY) || '0');
    if (now - lastGlobal < DUO_CLEANUP_INTERVAL_MS) return;
  }
  _lastDuoCleanupMs = now;
  localStorage.setItem(LS_CLEANUP_KEY, String(now));
  try {
    bumpDuoMetric('roomReadOps');
    const countdownSnap = await db
      .collection(DUO_ROOMS_COLLECTION)
      .where('status', '==', 'countdown')
      .orderBy('updatedAt', 'asc')
      .limit(30)
      .get();
    const countdownWrites: Promise<unknown>[] = [];
    countdownSnap.forEach((doc: FirestoreDoc) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      const updatedAtMs = d?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (!d || !updatedAtMs || now - updatedAtMs < DUO_ROOM_COUNTDOWN_STALE_MS) return;
      bumpDuoMetric('staleRoomCleanups');
      bumpDuoMetric('roomWriteOps');
      countdownWrites.push(
        doc.ref.update({
          status: 'waiting',
          startAt: null,
          countdownStartedAt: null,
          hostReady: false,
          guestReady: false,
          updatedAt: firebaseServerTimestamp(),
        }),
      );
    });
    if (countdownWrites.length) await Promise.allSettled(countdownWrites);

    bumpDuoMetric('roomReadOps');
    const orderedSnap = await db
      .collection(DUO_ROOMS_COLLECTION)
      .where('status', '==', 'waiting')
      .orderBy('updatedAt', 'asc')
      .limit(30)
      .get();
    const writes: Promise<unknown>[] = [];
    orderedSnap.forEach((doc: FirestoreDoc) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      const updatedAtMs = d?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (!d || !updatedAtMs || now - updatedAtMs < DUO_ROOM_WAITING_TTL_MS) return;
      bumpDuoMetric('staleRoomCleanups');
      bumpDuoMetric('roomWriteOps');
      writes.push(
        doc.ref.update({
          status: 'idle',
          guestId: null,
          guestAlias: null,
          guestTitle: null,
          guestReady: false,
          guestProgress: 0,
          guestFinishTime: null,
          guestStars: null,
          guestDuoWins: null,
          guestHeartbeatAtMs: null,
          guestOnline: false,
          updatedAt: firebaseServerTimestamp(),
        }),
      );
    });
    if (writes.length) await Promise.allSettled(writes);

    bumpDuoMetric('roomReadOps');
    const finishedSnap = await db
      .collection(DUO_ROOMS_COLLECTION)
      .where('status', '==', 'finished')
      .orderBy('updatedAt', 'asc')
      .limit(30)
      .get();
    const deleteOps: Promise<unknown>[] = [];
    finishedSnap.forEach((doc: FirestoreDoc) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      const updatedAtMs = d?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (!updatedAtMs || now - updatedAtMs < DUO_ROOM_FINISHED_RETENTION_MS) return;
      bumpDuoMetric('staleRoomCleanups');
      deleteOps.push(doc.ref.delete());
    });
    if (deleteOps.length) {
      bumpDuoMetric('roomWriteOps', deleteOps.length);
      await Promise.allSettled(deleteOps);
    }
    invalidateWaitingRoomsCache();
  } catch (e) {
    console.warn('cleanupStaleDuoRooms failed:', e);
  }
}

// ── Create room ──────────────────────────────────────────────────────

function buildHostRoom(
  tierId: string,
  modeId: string,
  puzzleSeed: number,
  playerId: string,
  alias: string,
): Record<string, unknown> {
  const profile = loadDuoProfile();
  const now = Date.now();
  return {
    tierId,
    modeId,
    puzzleSeed,
    levelId: 0, // legacy compat — actual puzzle chosen by seed
    status: 'waiting',
    hostId: playerId,
    hostAlias: alias,
    hostTitle: getEquippedTitleDisplay(),
    hostReady: false,
    hostProgress: 0,
    hostFinishTime: null,
    hostStars: null,
    hostDuoWins: profile.wins,
    guestId: null,
    guestAlias: null,
    guestTitle: null,
    guestReady: false,
    guestProgress: 0,
    guestFinishTime: null,
    guestStars: null,
    guestDuoWins: null,
    startAt: null,
    levelLocked: false,
    hostHeartbeatAtMs: now,
    guestHeartbeatAtMs: null,
    hostOnline: true,
    guestOnline: false,
    updatedAt: firebaseServerTimestamp(),
  };
}

export async function createDuoRoom(tierId: string, modeId: string): Promise<string | null> {
  if (!gs.firebaseReady) return null;
  const { alias } = getPlayerIdentity();
  if (!alias) return null;
  try {
    const result = await callDuoFunction<{ roomId: string }>('duoCreateRoom', {
      tierId,
      modeId,
      alias,
      wins: loadDuoProfile().wins,
      titleDisplay: getEquippedTitleDisplay(),
    });
    const { roomId } = result;
    bumpDuoMetric('roomWriteOps');
    setActiveRoomId(roomId);
    gs.duoRole = 'host';
    gs.duoMyReady = false;
    subscribeDuoRoom();
    return roomId;
  } catch (e) {
    console.warn('createDuoRoom failed:', e);
    return null;
  }
}

// ── Join room ────────────────────────────────────────────────────────

export async function joinDuoRoom(roomId: string): Promise<boolean> {
  if (!gs.firebaseReady || !roomId) return false;
  const { alias } = getPlayerIdentity();
  try {
    const result = await callDuoFunction<{ role: 'host' | 'guest'; hostReady: boolean }>('duoJoinRoom', {
      roomId,
      alias,
      wins: loadDuoProfile().wins,
      titleDisplay: getEquippedTitleDisplay(),
    });
    gs.duoRole = result.role;
    gs.duoMyReady = result.role === 'host' ? result.hostReady : false;
    setActiveRoomId(roomId);
    subscribeDuoRoom();
    return true;
  } catch (e) {
    console.warn('joinDuoRoom failed:', e);
    return false;
  }
}

// ── Subscribe ────────────────────────────────────────────────────────

export function subscribeDuoRoom(): void {
  if (!_activeRoomId) return;
  if (_snapshotRetryTimeout !== null) {
    clearTimeout(_snapshotRetryTimeout);
    _snapshotRetryTimeout = null;
  }
  if (gs.duoUnsubscribe) gs.duoUnsubscribe();
  _snapshotRetryCount = 0;
  _attachSnapshotListener();
  startDuoRoomHeartbeat();
  attachVisibilityHandler();
}

function _attachSnapshotListener(): void {
  gs.duoUnsubscribe = duoRoomRef().onSnapshot(
    (snap: FirestoreDoc) => {
      bumpDuoMetric('snapshotEvents');
      _snapshotRetryCount = 0;
      if (!snap.exists) {
        if (_resetHandler) _resetHandler();
        return;
      }
      gs.duoRoomData = (snap.data() ?? null) as DuoRoomData | null;
      if (gs.duoRoomData && _snapshotHandler) _snapshotHandler(gs.duoRoomData);
    },
    (err: unknown) => {
      console.warn('duo snapshot error:', err);
      _snapshotRetryCount++;
      bumpDuoMetric('reconnects');
      import('./duoLobby').then((m) => m.setDuoLobbyConnectionState('reconnecting')).catch((e) => console.warn('[duo] setConnState reconnecting failed:', e));
      if (_snapshotRetryCount <= MAX_SNAPSHOT_RETRIES) {
        showFeedback(t('duoRuntime.connectionRetry'), 'neutral');
        _snapshotRetryTimeout = setTimeout(
          () => {
            _snapshotRetryTimeout = null;
            _attachSnapshotListener();
          },
          2000 * Math.pow(1.5, _snapshotRetryCount),
        );
      } else {
        showFeedback(t('duoRuntime.connectionFailed'), 'error');
        import('./duoLobby').then((m) => m.setDuoLobbyConnectionState('failed')).catch((e) => console.warn('[duo] setConnState failed failed:', e));
        if (_resetHandler) _resetHandler();
      }
    },
  );
}

// ── Foreground recovery (PWA / mobile background) ───────────────────

async function recoverDuoOnForeground(): Promise<void> {
  if (!_activeRoomId || !gs.duoRole || !gs.firebaseReady) return;

  // Re-attach snapshot listener (old one may be silently dead after backgrounding).
  // Stop heartbeat first — startDuoRoomHeartbeat() no-ops if the timer ref is still set,
  // even though the actual setInterval may have been killed by the OS.
  stopDuoRoomHeartbeat();
  subscribeDuoRoom();

  // One-shot poll to catch updates missed while backgrounded
  try {
    const doc = await duoRoomRef().get();
    if (!doc.exists) return;
    const d = (doc.data() ?? null) as DuoRoomData | null;
    if (!d) return;
    gs.duoRoomData = d;
    if (_snapshotHandler) _snapshotHandler(d);
  } catch {
    // Snapshot listener is already re-attached; poll failure is non-fatal
  }
}

function attachVisibilityHandler(): void {
  if (_visibilityHandler || typeof document === 'undefined') return;
  _visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    if (!_activeRoomId || !gs.duoRole) return;
    void recoverDuoOnForeground();
  };
  document.addEventListener('visibilitychange', _visibilityHandler);
}

function detachVisibilityHandler(): void {
  if (!_visibilityHandler) return;
  document.removeEventListener('visibilitychange', _visibilityHandler);
  _visibilityHandler = null;
}

// ── Resume ───────────────────────────────────────────────────────────

export async function resumeDuoRoomIfAny(): Promise<boolean> {
  if (!gs.firebaseReady || !_activeRoomId) return false;
  const authUid = getAuthUid();
  if (!authUid) return false;
  try {
    const doc = await duoRoomRef(_activeRoomId).get();
    if (!doc.exists) {
      setActiveRoomId(null);
      return false;
    }
    const d = doc.data() as unknown as DuoRoomData;
    if (!d) {
      setActiveRoomId(null);
      return false;
    }
    if (d.status === 'finished' || d.status === 'idle') {
      setActiveRoomId(null);
      return false;
    }
    // If app was killed after both finished but before result was dismissed,
    // the room is still 'playing' with both finish times set — treat as finished.
    if (d.status === 'playing' && d.hostFinishTime != null && d.guestFinishTime != null) {
      setActiveRoomId(null);
      return false;
    }
    if (d.hostId === authUid) {
      gs.duoRole = 'host';
      gs.duoMyReady = !!d.hostReady;
    } else if (d.guestId === authUid) {
      gs.duoRole = 'guest';
      gs.duoMyReady = !!d.guestReady;
    } else {
      setActiveRoomId(null);
      return false;
    }
    // If we've already submitted our finish in a still-playing game, don't
    // resume — prevents experienced players from being trapped in old rooms
    // where one side finished but the room was never fully cleaned up.
    if (d.status === 'playing') {
      const myFinishTime = gs.duoRole === 'host' ? d.hostFinishTime : d.guestFinishTime;
      if (myFinishTime != null) {
        setActiveRoomId(null);
        gs.duoRole = null;
        return false;
      }
    }
    subscribeDuoRoom();
    return true;
  } catch {
    return false;
  }
}

// ── Leave / cleanup ──────────────────────────────────────────────────

export async function leaveDuoRoom(): Promise<void> {
  const roomId = _activeRoomId;
  if (!gs.firebaseReady || !gs.duoRole || !roomId) {
    if (_resetHandler) _resetHandler();
    return;
  }
  await callDuoFunction('duoLeaveRoom', { roomId }).catch(() => {});
  if (_resetHandler) _resetHandler();
}

export function clearActiveRoomId(): void {
  setActiveRoomId(null);
}

export { _activeRoomId as __activeRoomId, _lastStaleGuestPruneMs };

export function setLastStaleGuestPruneMs(ms: number): void {
  _lastStaleGuestPruneMs = ms;
}

export function getLastStaleGuestPruneMs(): number {
  return _lastStaleGuestPruneMs;
}
