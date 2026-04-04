// Duo (2-player) mode — Firebase real-time room state for 2-player competition
// Extracted from legacyRuntime.ts

import { gs, type LevelData, type DuoRoomData } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { getPlayerIdentity } from '../firebase/client';
import { showFeedback } from '../ui/feedback';
import { t } from '../i18n/t';
import { getEquippedTitleDisplay } from './titles';
import type { FirestoreDoc, FirestoreTransaction } from '../firebase/types';
import type { SudokuWindow } from '../facade/windowTypes';

declare const firebase: {
  firestore: {
    FieldValue: { serverTimestamp(): unknown };
    Timestamp: { fromMillis(ms: number): unknown };
  };
};

interface DuoRecords {
  wins: Record<string, number>;
  streak: number;
  streakHolder: string;
}

export interface DuoRoomSummary {
  roomId: string;
  levelId: number;
  status: DuoRoomData['status'];
  hostId: string;
  hostAlias: string;
  guestAlias: string | null;
  updatedAtMs: number;
  levelLocked: boolean;
}

// ── Module-level guard flags ─────────────────────────────────────────
let _countdownLaunched = false;
let _duoFinishSubmitted = false;
let _snapshotRetryCount = 0;
let _lastSeenLevelId: number | null = null;
const MAX_SNAPSHOT_RETRIES = 5;
const DUO_ROOMS_COLLECTION = 'duo_rooms';
const ACTIVE_ROOM_ID_KEY = 'sudoku_duo_active_room_id';
const DUO_METRICS_KEY = 'sudoku_duo_metrics_v1';
const WAITING_ROOMS_CACHE_MS = 5000;
const WAITING_ROOMS_MIN_FETCH_GAP_MS = 1200;
const DUO_HEARTBEAT_MS = 15_000;
const DUO_STALE_HEARTBEAT_MS = 45_000;
const DUO_ROOM_WAITING_TTL_MS = 15 * 60_000;
const DUO_ROOM_FINISHED_RETENTION_MS = 6 * 60 * 60_000;
const DUO_CLEANUP_INTERVAL_MS = 5 * 60_000;
let _activeRoomId: string | null = localStorage.getItem(ACTIVE_ROOM_ID_KEY);
let _waitingRoomsCache: { rows: DuoRoomSummary[]; ts: number; limit: number } | null = null;
let _waitingRoomsInFlight: Promise<DuoRoomSummary[]> | null = null;
let _lastWaitingRoomsFetchMs = 0;
let _duoHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _lastStaleGuestPruneMs = 0;
let _lastDuoCleanupMs = 0;

type DuoMetricKey =
  | 'lobbyFetches'
  | 'lobbyFetchHits'
  | 'lobbyFetchThrottled'
  | 'roomReadOps'
  | 'roomWriteOps'
  | 'snapshotEvents'
  | 'reconnects'
  | 'heartbeatWrites'
  | 'staleGuestReleases'
  | 'staleRoomCleanups';
type DuoMetrics = Record<DuoMetricKey, number> & { lastUpdatedAtMs: number };

function loadDuoMetrics(): DuoMetrics {
  try {
    const raw = localStorage.getItem(DUO_METRICS_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<DuoMetrics>;
    return {
      lobbyFetches: Number(parsed.lobbyFetches || 0),
      lobbyFetchHits: Number(parsed.lobbyFetchHits || 0),
      lobbyFetchThrottled: Number(parsed.lobbyFetchThrottled || 0),
      roomReadOps: Number(parsed.roomReadOps || 0),
      roomWriteOps: Number(parsed.roomWriteOps || 0),
      snapshotEvents: Number(parsed.snapshotEvents || 0),
      reconnects: Number(parsed.reconnects || 0),
      heartbeatWrites: Number(parsed.heartbeatWrites || 0),
      staleGuestReleases: Number(parsed.staleGuestReleases || 0),
      staleRoomCleanups: Number(parsed.staleRoomCleanups || 0),
      lastUpdatedAtMs: Number(parsed.lastUpdatedAtMs || 0),
    };
  } catch {
    return {
      lobbyFetches: 0,
      lobbyFetchHits: 0,
      lobbyFetchThrottled: 0,
      roomReadOps: 0,
      roomWriteOps: 0,
      snapshotEvents: 0,
      reconnects: 0,
      heartbeatWrites: 0,
      staleGuestReleases: 0,
      staleRoomCleanups: 0,
      lastUpdatedAtMs: 0,
    };
  }
}

let _duoMetrics = loadDuoMetrics();
function saveDuoMetrics(): void {
  _duoMetrics.lastUpdatedAtMs = Date.now();
  localStorage.setItem(DUO_METRICS_KEY, JSON.stringify(_duoMetrics));
}
function bumpDuoMetric(key: DuoMetricKey, amount = 1): void {
  _duoMetrics[key] = Number(_duoMetrics[key] || 0) + amount;
  saveDuoMetrics();
}
export function getDuoMetrics(): DuoMetrics {
  return { ..._duoMetrics };
}
export function resetDuoMetrics(): void {
  _duoMetrics = loadDuoMetrics();
  (Object.keys(_duoMetrics) as Array<keyof DuoMetrics>).forEach((k) => {
    (_duoMetrics[k] as number) = 0;
  });
  saveDuoMetrics();
}

function setActiveRoomId(roomId: string | null): void {
  _activeRoomId = roomId;
  if (roomId) localStorage.setItem(ACTIVE_ROOM_ID_KEY, roomId);
  else localStorage.removeItem(ACTIVE_ROOM_ID_KEY);
}

function makeRoomId(): string {
  return `r_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// ── Room Reference ───────────────────────────────────────────────────

export function duoRoomRef(roomId?: string) {
  const id = roomId || _activeRoomId || 'public';
  return gs.db.collection(DUO_ROOMS_COLLECTION).doc(id);
}

// ── Enter / Subscribe ────────────────────────────────────────────────

function buildHostRoom(levelId: number, playerId: string, alias: string): Record<string, unknown> {
  const hostRec = loadDuoRecords();
  const hostTotalWins = Object.values(hostRec.wins).reduce((s, v) => s + v, 0);
  const now = Date.now();
  return {
    levelId,
    status: 'waiting',
    hostId: playerId,
    hostAlias: alias,
    hostTitle: getEquippedTitleDisplay(),
    hostReady: false,
    hostProgress: 0,
    hostFinishTime: null,
    hostStars: null,
    hostDuoWins: hostTotalWins,
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
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

function docToSummary(roomId: string, d: DuoRoomData): DuoRoomSummary {
  const updatedAtMs = d.updatedAt?.toDate?.()?.getTime?.() ?? 0;
  return {
    roomId,
    levelId: d.levelId,
    status: d.status,
    hostId: d.hostId,
    hostAlias: d.hostAlias || '--',
    guestAlias: d.guestAlias || null,
    updatedAtMs,
    levelLocked: !!(d as any).levelLocked,
  };
}

export async function listWaitingDuoRooms(limit = 20, opts: { force?: boolean } = {}): Promise<DuoRoomSummary[]> {
  if (!gs.firebaseReady) return [];
  const force = !!opts.force;
  const now = Date.now();
  if (!force && _waitingRoomsCache && now - _waitingRoomsCache.ts <= WAITING_ROOMS_CACHE_MS && limit <= _waitingRoomsCache.limit) {
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
  const normalize = (snap: any): DuoRoomSummary[] => {
    const rows: DuoRoomSummary[] = [];
    snap.forEach((doc: any) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      if (!d || !d.levelId || !d.hostId) return;
      rows.push(docToSummary(doc.id, d));
    });
    return rows.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, Math.max(1, limit));
  };
  const fetchPromise = (async (): Promise<DuoRoomSummary[]> => {
    bumpDuoMetric('lobbyFetches');
    _lastWaitingRoomsFetchMs = Date.now();
    try {
      bumpDuoMetric('roomReadOps');
      const orderedSnap = await gs.db
        .collection(DUO_ROOMS_COLLECTION)
        .where('status', '==', 'waiting')
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get();
      const rows = normalize(orderedSnap);
      _waitingRoomsCache = { rows, ts: Date.now(), limit };
      return rows;
    } catch (e) {
      // Fallback for environments missing composite index for where+orderBy.
      try {
        bumpDuoMetric('roomReadOps');
        const fallbackSnap = await gs.db.collection(DUO_ROOMS_COLLECTION).where('status', '==', 'waiting').limit(limit * 2).get();
        const rows = normalize(fallbackSnap);
        _waitingRoomsCache = { rows, ts: Date.now(), limit };
        return rows;
      } catch (e2) {
        console.warn('listWaitingDuoRooms failed:', e, e2);
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

function invalidateWaitingRoomsCache(): void {
  _waitingRoomsCache = null;
}

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
    } catch {
      // noop
    }
  };
  void tick();
  _duoHeartbeatTimer = setInterval(() => {
    void tick();
  }, DUO_HEARTBEAT_MS);
}

function stopDuoRoomHeartbeat(): void {
  if (_duoHeartbeatTimer) {
    clearInterval(_duoHeartbeatTimer);
    _duoHeartbeatTimer = null;
  }
}

export async function cleanupStaleDuoRooms(force = false): Promise<void> {
  if (!gs.firebaseReady) return;
  const now = Date.now();
  if (!force && now - _lastDuoCleanupMs < DUO_CLEANUP_INTERVAL_MS) return;
  _lastDuoCleanupMs = now;
  try {
    bumpDuoMetric('roomReadOps');
    const orderedSnap = await gs.db
      .collection(DUO_ROOMS_COLLECTION)
      .where('status', '==', 'waiting')
      .orderBy('updatedAt', 'asc')
      .limit(30)
      .get();
    const writes: Promise<unknown>[] = [];
    orderedSnap.forEach((doc: any) => {
      const d = (doc.data() ?? null) as DuoRoomData | null;
      const updatedAtMs = d?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (!d || !updatedAtMs || now - updatedAtMs < DUO_ROOM_WAITING_TTL_MS) return;
      bumpDuoMetric('staleRoomCleanups');
      bumpDuoMetric('roomWriteOps');
      writes.push(doc.ref.update({
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
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }));
    });
    if (writes.length) await Promise.allSettled(writes);

    bumpDuoMetric('roomReadOps');
    const finishedSnap = await gs.db
      .collection(DUO_ROOMS_COLLECTION)
      .where('status', '==', 'finished')
      .orderBy('updatedAt', 'asc')
      .limit(30)
      .get();
    const deleteOps: Promise<unknown>[] = [];
    finishedSnap.forEach((doc: any) => {
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

export async function createDuoRoom(levelId: number): Promise<string | null> {
  if (!gs.firebaseReady) return null;
  const { playerId, alias } = getPlayerIdentity();
  const roomId = makeRoomId();
  try {
    await duoRoomRef(roomId).set(buildHostRoom(levelId, playerId, alias));
    bumpDuoMetric('roomWriteOps');
    setActiveRoomId(roomId);
    gs.duoRole = 'host';
    gs.duoMyReady = false;
    _lastSeenLevelId = levelId;
    subscribeDuoRoom();
    return roomId;
  } catch (e) {
    console.warn('createDuoRoom failed:', e);
    return null;
  }
}

export async function joinDuoRoom(roomId: string): Promise<boolean> {
  if (!gs.firebaseReady || !roomId) return false;
  const { playerId, alias } = getPlayerIdentity();
  try {
    await gs.db.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef(roomId));
      if (!doc.exists) throw new Error('room_not_found');
      const d = doc.data() as unknown as DuoRoomData;
      if (d.status !== 'waiting') throw new Error('room_not_waiting');
      if (d.hostId === playerId) {
        gs.duoRole = 'host';
        gs.duoMyReady = !!d.hostReady;
        return;
      }
      if (d.guestId && d.guestId !== playerId) throw new Error('room_full');

      const guestRec = loadDuoRecords();
      const guestTotalWins = Object.values(guestRec.wins).reduce((s, v) => s + v, 0);
      tx.update(duoRoomRef(roomId), {
        guestId: playerId,
        guestAlias: alias,
        guestTitle: getEquippedTitleDisplay(),
        guestReady: false,
        guestProgress: 0,
        guestFinishTime: null,
        guestStars: null,
        guestDuoWins: guestTotalWins,
        guestHeartbeatAtMs: Date.now(),
        guestOnline: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      gs.duoRole = 'guest';
      gs.duoMyReady = false;
    });

    setActiveRoomId(roomId);
    subscribeDuoRoom();
    return true;
  } catch (e) {
    console.warn('joinDuoRoom failed:', e);
    return false;
  }
}

export async function enterDuoRoom(levelId: number): Promise<void> {
  // Backward-compatible helper: try joining latest waiting room of this level, else create one.
  if (!gs.firebaseReady) return;
  const { playerId } = getPlayerIdentity();
  try {
    const rows = await listWaitingDuoRooms(20);
    const candidate = rows.find((r) => r.levelId === levelId && r.hostId !== playerId);
    if (candidate) {
      const joined = await joinDuoRoom(candidate.roomId);
      if (joined) {
        _lastSeenLevelId = levelId;
        return;
      }
    }
    const roomId = await createDuoRoom(levelId);
    if (!roomId) gs.duoRole = null;
  } catch (e) {
    console.warn('enterDuoRoom failed:', e);
    gs.duoRole = null;
  }
  // If the first waiting room belongs to me, keep host role.
  if (gs.duoRole === 'guest' || gs.duoRole === 'host') return;
  if (_activeRoomId) {
    const d = await duoRoomRef(_activeRoomId).get();
    if (d.exists) {
      const data = d.data() as DuoRoomData;
      if (data.hostId === playerId) gs.duoRole = 'host';
    }
  }
}

export function subscribeDuoRoom(): void {
  if (!_activeRoomId) return;
  if (gs.duoUnsubscribe) gs.duoUnsubscribe();
  _snapshotRetryCount = 0;
  _attachSnapshotListener();
  startDuoRoomHeartbeat();
}

function _attachSnapshotListener(): void {
  gs.duoUnsubscribe = duoRoomRef().onSnapshot(
    (snap: FirestoreDoc) => {
      bumpDuoMetric('snapshotEvents');
      _snapshotRetryCount = 0; // reset on success
      if (!snap.exists) {
        resetDuoState();
        return;
      }
      gs.duoRoomData = (snap.data() ?? null) as DuoRoomData | null;
      if (gs.duoRoomData) handleDuoSnapshot(gs.duoRoomData);
    },
    (err: unknown) => {
      console.warn('duo snapshot error:', err);
      _snapshotRetryCount++;
      bumpDuoMetric('reconnects');
      import('./duoLobby').then((m) => m.setDuoLobbyConnectionState('reconnecting')).catch(() => {});
      if (_snapshotRetryCount <= MAX_SNAPSHOT_RETRIES) {
        showFeedback(t('duoRuntime.connectionRetry'), 'neutral');
        setTimeout(() => {
          _attachSnapshotListener();
        }, 2000 * Math.pow(1.5, _snapshotRetryCount));
      } else {
        showFeedback(t('duoRuntime.connectionFailed'), 'error');
        import('./duoLobby').then((m) => m.setDuoLobbyConnectionState('failed')).catch(() => {});
        resetDuoState();
      }
    },
  );
}

export async function resumeDuoRoomIfAny(): Promise<boolean> {
  if (!gs.firebaseReady || !_activeRoomId) return false;
  const { playerId } = getPlayerIdentity();
  try {
    const doc = await duoRoomRef(_activeRoomId).get();
    if (!doc.exists) {
      setActiveRoomId(null);
      return false;
    }
    const d = doc.data() as DuoRoomData;
    if (!d) {
      setActiveRoomId(null);
      return false;
    }
    if (d.hostId === playerId) {
      gs.duoRole = 'host';
      gs.duoMyReady = !!d.hostReady;
    } else if (d.guestId === playerId) {
      gs.duoRole = 'guest';
      gs.duoMyReady = !!d.guestReady;
    } else {
      setActiveRoomId(null);
      return false;
    }
    _lastSeenLevelId = d.levelId ?? null;
    subscribeDuoRoom();
    return true;
  } catch {
    return false;
  }
}

export async function updateDuoRoomLevel(levelId: number): Promise<boolean> {
  if (!gs.firebaseReady || gs.duoRole !== 'host' || !_activeRoomId) return false;
  try {
    await gs.db.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data() as unknown as DuoRoomData;
      if ((d as any).levelLocked) return;
      tx.update(duoRoomRef(), {
        levelId,
        hostReady: false,
        guestReady: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    _lastSeenLevelId = levelId;
    gs.duoMyReady = false;
    return true;
  } catch {
    return false;
  }
}

export async function toggleDuoLevelLock(): Promise<boolean> {
  if (!gs.firebaseReady || gs.duoRole !== 'host' || !_activeRoomId) return false;
  try {
    await gs.db.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data() as unknown as DuoRoomData;
      const next = !(d as any).levelLocked;
      tx.update(duoRoomRef(), {
        levelLocked: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    return true;
  } catch {
    return false;
  }
}

export function getActiveDuoRoomId(): string | null {
  return _activeRoomId;
}

// ── Snapshot Handler ─────────────────────────────────────────────────

export function handleDuoSnapshot(d: DuoRoomData): void {
  if (!d || !gs.duoRole) return;
  import('./duoLobby').then((m) => {
    m.setDuoLobbyConnectionState('connected');
    m.refreshDuoLobbyRoom();
    m.syncDuoLobbyRoomState(d, _activeRoomId);
  }).catch(() => {});

  if (d.status === 'waiting' || d.status === 'countdown') {
    // Only update pre-level UI if player is on the level screen, not mid-game
    const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
    const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
    if (!isInGame) {
      updateDuoPreLevelUI(d);
    }
  }

  if (d.status === 'waiting') {
    gs.duoRoundLaunched = false;
    gs.duoCountdownStartMs = null;
    _countdownLaunched = false;

    // Host changed level while waiting: clear local ready latch.
    if (d.levelId && _lastSeenLevelId !== null && d.levelId !== _lastSeenLevelId) gs.duoMyReady = false;
    _lastSeenLevelId = d.levelId;

    // Host: if both players are ready but status is still 'waiting',
    // trigger countdown now (handles case where guest readied after host)
    if (gs.duoRole === 'host' && d.hostReady && d.guestReady && d.guestId && !_countdownLaunched) {
      duoRoomRef().update({
        status: 'countdown',
        startAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 4000),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      bumpDuoMetric('roomWriteOps');
    }

    // Host can auto-release stale guest seats in waiting room.
    const guestHb = Number(d.guestHeartbeatAtMs || 0);
    if (
      gs.duoRole === 'host' &&
      d.guestId &&
      guestHb > 0 &&
      Date.now() - guestHb > DUO_STALE_HEARTBEAT_MS &&
      Date.now() - _lastStaleGuestPruneMs > 10_000
    ) {
      _lastStaleGuestPruneMs = Date.now();
      duoRoomRef().update({
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
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      bumpDuoMetric('staleGuestReleases');
      bumpDuoMetric('roomWriteOps');
    }
  }

  if (d.status === 'countdown' && d.startAt) {
    // Don't start countdown if player is mid-game (solo/world)
    const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
    const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
    if (!isInGame) {
      startDuoCountdown(d.startAt);
    }
  }

  if (d.status === 'playing') {
    gs.duoRoundLaunched = true;
    // Update opponent progress bar
    const oppProgress = gs.duoRole === 'host' ? d.guestProgress : d.hostProgress;
    const oppAlias = gs.duoRole === 'host' ? d.guestAlias || t('duoRuntime.opponent') : d.hostAlias || t('duoRuntime.opponent');
    updateDuoProgressUI(oppAlias, oppProgress || 0);

    // Handle emoji reactions
    handleDuoEmoji(d);

    // Check if opponent finished
    const oppFinish = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
    const oppStars = gs.duoRole === 'host' ? d.guestStars : d.hostStars;
    if (oppFinish !== null && oppFinish !== undefined) {
      showDuoOpponentFinished(oppAlias, oppFinish, oppStars);
    }

    // Check if both finished
    if (
      d.hostFinishTime !== null &&
      d.hostFinishTime !== undefined &&
      d.guestFinishTime !== null &&
      d.guestFinishTime !== undefined
    ) {
      showDuoResult(d);
    }
  }

  if (d.status === 'finished') {
    showDuoResult(d);
  }
}

// ── Pre-Level UI ─────────────────────────────────────────────────────

export function updateDuoPreLevelUI(d: DuoRoomData): void {
  const zone = document.getElementById('duo-ready-zone');
  const readyBtn = document.getElementById('duo-ready-btn');
  const countdownArea = document.getElementById('duo-countdown-area');
  if (!zone) return;

  zone.classList.remove('hidden');

  // Host slot
  const hostAliasEl = document.getElementById('duo-host-alias');
  if (hostAliasEl) hostAliasEl.textContent = d.hostAlias || '--';
  const hostTitleEl = document.getElementById('duo-host-title');
  if (hostTitleEl) {
    hostTitleEl.textContent = d.hostTitle || '';
    hostTitleEl.style.display = d.hostTitle ? '' : 'none';
  }
  const hostSlot = document.getElementById('duo-slot-host');
  const hostStatus = document.getElementById('duo-host-status');
  if (hostSlot) hostSlot.classList.toggle('ready', !!d.hostReady);
  if (hostStatus) {
    hostStatus.textContent = d.hostReady ? t('duoRuntime.statusReady') : t('duoRuntime.statusWaiting');
    hostStatus.classList.toggle('is-ready', !!d.hostReady);
  }

  // Guest slot
  const guestSlot = document.getElementById('duo-slot-guest');
  const guestAlias = document.getElementById('duo-guest-alias');
  const guestStatus = document.getElementById('duo-guest-status');
  if (d.guestId) {
    if (guestSlot) {
      guestSlot.classList.remove('empty');
      guestSlot.classList.toggle('ready', !!d.guestReady);
    }
    if (guestAlias) guestAlias.textContent = d.guestAlias || '--';
    const guestTitleEl = document.getElementById('duo-guest-title');
    if (guestTitleEl) {
      guestTitleEl.textContent = d.guestTitle || '';
      guestTitleEl.style.display = d.guestTitle ? '' : 'none';
    }
    if (guestStatus) {
      guestStatus.textContent = d.guestReady ? t('duoRuntime.statusReady') : t('duoRuntime.statusWaiting');
      guestStatus.classList.toggle('is-ready', !!d.guestReady);
    }
  } else {
    if (guestSlot) guestSlot.classList.add('empty');
    if (guestAlias) guestAlias.textContent = t('duoRuntime.waitingJoin');
    const guestTitleEl = document.getElementById('duo-guest-title');
    if (guestTitleEl) guestTitleEl.style.display = 'none';
    if (guestStatus) {
      guestStatus.textContent = '';
      guestStatus.classList.remove('is-ready');
    }
  }

  // Show streak and synced duo wins
  const preStreak = document.getElementById('duo-pre-streak');
  if (preStreak && d.guestId) {
    preStreak.textContent = '';
    const rec = loadDuoRecords();
    if (rec.streak >= 2 && rec.streakHolder) {
      const badge = document.createElement('div');
      badge.className = 'duo-streak-badge';
      badge.textContent = t('duoRuntime.streakBadge', { holder: rec.streakHolder, count: String(rec.streak) });
      preStreak.appendChild(badge);
    }
    // Show both players' total duo wins from Firebase room data
    if (d.hostDuoWins != null && d.guestDuoWins != null) {
      const winsDiv = document.createElement('div');
      winsDiv.style.cssText = 'font-size:0.72rem;color:var(--text-light);margin-bottom:6px;';
      winsDiv.textContent = t('duoRuntime.winsVs', {
        a: d.hostAlias || '--',
        aWins: String(d.hostDuoWins),
        b: d.guestAlias || '--',
        bWins: String(d.guestDuoWins),
      });
      preStreak.appendChild(winsDiv);
    } else if (!(rec.streak >= 2 && rec.streakHolder)) {
      // Fallback to local wins if Firebase data not yet available
      const wins = rec.wins || {};
      const names = Object.keys(wins);
      if (names.length >= 2) {
        const sorted = names.sort((a, b) => wins[b] - wins[a]);
        const fallbackDiv = document.createElement('div');
        fallbackDiv.style.cssText = 'font-size:0.72rem;color:var(--text-light);margin-bottom:6px;';
        fallbackDiv.textContent = t('duoRuntime.winsVs', { a: sorted[0], aWins: String(wins[sorted[0]]), b: sorted[1], bWins: String(wins[sorted[1]]) });
        preStreak.appendChild(fallbackDiv);
      }
    }
  } else if (preStreak) {
    preStreak.textContent = '';
  }

  // Ready button state — driven solely by snapshot data
  const myReady = gs.duoRole === 'host' ? d.hostReady : d.guestReady;
  const startBtn = document.getElementById('pre-level-start-btn');
  const ghostBtn = document.getElementById('pre-level-ghost-btn');
  const backBtn = document.getElementById('pre-level-back-btn');
  if (d.status === 'countdown') {
    if (readyBtn) readyBtn.style.display = 'none';
    if (countdownArea) countdownArea.style.display = 'block';
    if (startBtn) startBtn.style.display = 'none';
    if (ghostBtn) ghostBtn.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
  } else {
    if (readyBtn) {
      readyBtn.style.display = d.guestId ? 'inline-block' : 'none';
      readyBtn.textContent = myReady ? t('duoRuntime.readyConfirm') : t('duoRuntime.readyPrompt');
      readyBtn.classList.toggle('is-ready', myReady);
    }
    if (countdownArea) countdownArea.style.display = 'none';
    if (startBtn) startBtn.style.display = '';
    if (backBtn) backBtn.style.display = '';
  }
}

// ── Ready Toggle ─────────────────────────────────────────────────────

export async function toggleDuoReady(): Promise<void> {
  if (!gs.firebaseReady || !gs.duoRole) return;
  const field = gs.duoRole === 'host' ? 'hostReady' : 'guestReady';
  const newReady = !gs.duoMyReady;

  try {
    await gs.db.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data() as unknown as DuoRoomData;
      const update: Record<string, unknown> = { [field]: newReady, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

      // Only the HOST can set status='countdown' to prevent race condition
      if (gs.duoRole === 'host') {
        const hostReady = newReady;
        const guestReady = d.guestReady;
        if (hostReady && guestReady && d.guestId) {
          update.status = 'countdown';
          update.startAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 4000);
        }
      }
      tx.update(duoRoomRef(), update);
    });
    // Update local state AFTER transaction succeeds
    gs.duoMyReady = newReady;
  } catch (e) {
    console.warn('toggleDuoReady failed:', e);
    // Don't update local state — it was never changed
  }
}

// ── Countdown Audio ──────────────────────────────────────────────────

function playCountdownBeep(final = false): void {
  try {
    const win = window as unknown as SudokuWindow;
    const AudioCtx = win.AudioContext || win.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = final ? 880 : 440;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + (final ? 0.3 : 0.15));
  } catch {}
}

// ── Countdown ────────────────────────────────────────────────────────

export function startDuoCountdown(startAtTs: { toMillis?: () => number; seconds?: number }): void {
  if (gs.duoRoundLaunched || _countdownLaunched) return;
  const area = document.getElementById('duo-countdown-area');
  if (!area) return;

  const targetMs = startAtTs.toMillis ? startAtTs.toMillis() : (startAtTs.seconds ?? 0) * 1000;
  if (gs.duoCountdownTimer && gs.duoCountdownStartMs === targetMs) return; // same countdown instance
  if (gs.duoCountdownTimer && gs.duoCountdownStartMs !== targetMs) {
    clearTimeout(gs.duoCountdownTimer as ReturnType<typeof setTimeout>);
    gs.duoCountdownTimer = null;
  }
  gs.duoCountdownStartMs = targetMs;
  _countdownLaunched = true;

  // Animate countdown UI using requestAnimationFrame
  let lastShown: number | null = null;
  function updateCountdownUI() {
    const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
    if (remaining > 0) {
      if (remaining !== lastShown) {
        area!.innerHTML = `<div class="duo-countdown-display">${remaining}</div>`;
        lastShown = remaining;
        playCountdownBeep();
      }
      requestAnimationFrame(updateCountdownUI);
    }
    // When remaining hits 0, the setTimeout below handles launch
  }
  updateCountdownUI();

  // Launch at exact server-defined target time
  const now = Date.now();
  const delay = Math.max(0, targetMs - now);
  gs.duoCountdownTimer = setTimeout(() => {
    gs.duoCountdownTimer = null;
    if (gs.duoRoundLaunched) return;
    gs.duoRoundLaunched = true;
    area!.innerHTML = `<div class="duo-countdown-display">GO!</div>`;
    playCountdownBeep(true);
    setTimeout(() => launchDuoGame(), 600);
  }, delay) as unknown as ReturnType<typeof setInterval>;
}

// ── Launch Game ──────────────────────────────────────────────────────

export async function launchDuoGame(): Promise<void> {
  if (!gs.duoRoomData) return;
  gs.isDuoMode = true;
  // Reset continuous fill mode for fair play
  gs.continuousFillDigit = null;
  // Reset progress throttle so first progress update is immediate
  gs.duoProgressThrottle = 0;

  // Calculate total cells to fill — check normal levels first, then practice
  const { getAllLevels, getPracticeLevels } = await import('../data/dataRegistry');
  const levels = getAllLevels();
  let level = levels.find((l) => l.id === gs.duoRoomData!.levelId);
  let overrideData: LevelData | undefined = undefined;
  if (!level) {
    // Try practice levels (async)
    const practiceLevels = await getPracticeLevels();
    level = practiceLevels.find((l) => l.id === gs.duoRoomData!.levelId);
    if (level) overrideData = level;
  }
  if (level) {
    gs.duoTotalToFill = level.puzzle.filter((v: number) => v === 0).length;
  }

  // Hide pre-level modal, start game
  const { hidePreLevelModal } = await import('../features/levels');
  hidePreLevelModal();
  import('./duoLobby').then((m) => m.closeDuoLobby()).catch(() => {});
  const levelScreen = document.getElementById('level-screen');
  if (levelScreen) levelScreen.style.display = 'none';
  const { initGame } = await import('../game/core');
  initGame(gs.duoRoomData.levelId, true, false, null, overrideData);

  // Show duo progress bar and emoji bar
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'flex';
  const emojiBar = document.getElementById('duo-emoji-bar');
  if (emojiBar) emojiBar.style.display = 'flex';

  // Both host and guest update status to 'playing' via merge write
  // Whoever writes first wins; second write is a no-op (same value)
  const statusUpdate: Record<string, unknown> = {
    status: 'playing',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (gs.duoRole === 'host') {
    statusUpdate.hostProgress = 0;
    statusUpdate.guestProgress = 0;
    statusUpdate.hostFinishTime = null;
    statusUpdate.guestFinishTime = null;
  }

  try {
    bumpDuoMetric('roomWriteOps');
    await duoRoomRef().set(statusUpdate, { merge: true });
  } catch (e) {
    console.warn('launchDuoGame status update failed, retrying:', e);
    try {
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().set(statusUpdate, { merge: true });
    } catch (e2) {
      console.error('launchDuoGame status update retry failed:', e2);
      showFeedback(t('duoRuntime.connectionError'), 'error');
    }
  }
}

// ── Progress ─────────────────────────────────────────────────────────

export function updateDuoProgress(): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoProgressThrottle < 1000) return; // throttle to every 1s
  gs.duoProgressThrottle = now;
  const filled = gs.cellsData.filter((c) => !c.fixed && c.value !== 0).length;
  const field = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  duoRoomRef()
    .update({
      [field]: filled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .catch(() => {});
  bumpDuoMetric('roomWriteOps');
}

export function updateDuoProgressUI(oppAlias: string, oppProgress: number): void {
  const el = document.getElementById('duo-progress-text');
  const fill = document.getElementById('duo-progress-fill');
  if (!el || !fill) return;
  const pct = gs.duoTotalToFill > 0 ? Math.min(100, Math.round((oppProgress / gs.duoTotalToFill) * 100)) : 0;
  el.textContent = `\u{1F495} ${oppAlias}: ${oppProgress}/${gs.duoTotalToFill}`;
  fill.style.width = `${pct}%`;
}

// ── Opponent Finished Notification ───────────────────────────────────

export function showDuoOpponentFinished(alias: string, timeSec: number, stars: number | null): void {
  if (gs.duoOpponentNotified) return;
  gs.duoOpponentNotified = true;
  const starsStr = stars ? ' ' + '\u2605'.repeat(stars) : '';
  showFeedback(t('duoRuntime.opponentFinished', { alias, time: formatSeconds(timeSec), stars: starsStr }), 'error');
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50]);

  // Add forfeit button
  const existing = document.getElementById('duo-forfeit-btn');
  if (!existing) {
    const btn = document.createElement('button');
    btn.id = 'duo-forfeit-btn';
    btn.className = 'duo-forfeit-btn';
    btn.textContent = t('duoRuntime.forfeit');
    btn.onclick = async () => {
      btn.remove();
      await submitDuoFinish(9999, 0);
    };
    const emojiBar = document.getElementById('duo-emoji-bar');
    if (emojiBar) emojiBar.insertAdjacentElement('afterend', btn);
  }
}

// ── Submit Finish ────────────────────────────────────────────────────

export async function submitDuoFinish(timeSec: number, stars: number): Promise<void> {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  if (_duoFinishSubmitted) return;
  _duoFinishSubmitted = true;
  const timeField = gs.duoRole === 'host' ? 'hostFinishTime' : 'guestFinishTime';
  const starsField = gs.duoRole === 'host' ? 'hostStars' : 'guestStars';
  const progressField = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  try {
    bumpDuoMetric('roomWriteOps');
    await duoRoomRef().update({
      [timeField]: timeSec,
      [starsField]: stars,
      [progressField]: gs.duoTotalToFill,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('submitDuoFinish failed:', e);
  }
}

// ── Result Modal ─────────────────────────────────────────────────────

let duoResultShown = false;
export function showDuoResult(d: DuoRoomData): void {
  if (duoResultShown) return;
  duoResultShown = true;

  const hTime = d.hostFinishTime;
  const gTime = d.guestFinishTime;
  if (hTime === null || hTime === undefined || gTime === null || gTime === undefined) return;

  const hWin = hTime < gTime;
  const gWin = gTime < hTime;
  const isDraw = hTime === gTime;
  const diff = Math.abs(hTime - gTime);

  // Record win/draw
  let rec: DuoRecords;
  if (isDraw) {
    rec = recordDuoDraw();
  } else {
    const winner = hWin ? d.hostAlias : (d.guestAlias || '');
    const loser = hWin ? (d.guestAlias || '') : d.hostAlias;
    rec = recordDuoWin(winner, loser);
  }

  // Build content HTML for React bridge
  let contentHtml = '';

  // Streak badge
  if (rec.streak >= 2 && rec.streakHolder) {
    contentHtml += `<div id="duo-result-streak"><div class="duo-streak-badge">${t('duoRuntime.streakBadgeExcl', { holder: rec.streakHolder, count: String(rec.streak) })}</div></div>`;
  }

  function makeCard(alias: string, time: number, stars: number | null, isWinner: boolean): string {
    const resultLabel = isWinner ? `<div class="duo-result-label win">${t('duoRuntime.resultWin')}</div>` : (isDraw ? '' : `<div class="duo-result-label lose">${t('duoRuntime.resultLose')}</div>`);
    return `<div class="duo-result-card ${isWinner ? 'winner' : ''}">
                    ${resultLabel}
                    <div class="duo-result-crown">${isWinner ? '\u{1F451}' : ''}</div>
                    <div class="duo-result-alias">${alias || '--'}</div>
                    <div class="duo-result-time">${formatSeconds(time)}</div>
                    <div class="duo-result-stars">${stars ? '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars) : ''}</div>
                </div>`;
  }

  contentHtml += `<div class="duo-result-cards" id="duo-result-cards">${makeCard(d.hostAlias, hTime, d.hostStars, hWin)}${makeCard(d.guestAlias || '', gTime, d.guestStars, gWin)}</div>`;

  if (isDraw) {
    contentHtml += `<div class="duo-result-diff" id="duo-result-diff">${t('duoRuntime.resultDraw')}</div>`;
  } else {
    const winnerAlias = hWin ? d.hostAlias : (d.guestAlias || '');
    contentHtml += `<div class="duo-result-diff" id="duo-result-diff">${t('duoRuntime.resultFaster', { winner: winnerAlias, diff: formatSeconds(diff) })}</div>`;
  }

  // Lifetime record
  const wins = rec.wins || {};
  const names = Object.keys(wins);
  if (names.length >= 2) {
    const sorted = names.sort((a: string, b: string) => wins[b] - wins[a]);
    contentHtml += `<div class="duo-result-record" id="duo-result-record">${t('duoRuntime.historyRecord')}<span>${t('duoRuntime.winsRecord', { name: sorted[0], wins: String(wins[sorted[0]]) })}</span> — <span>${t('duoRuntime.winsRecord', { name: sorted[1], wins: String(wins[sorted[1]]) })}</span></div>`;
  } else if (names.length === 1) {
    contentHtml += `<div class="duo-result-record" id="duo-result-record">${t('duoRuntime.historyRecordSingle', { name: names[0], wins: String(wins[names[0]]) })}</div>`;
  }

  // Hide emoji bar
  const emojiBarEl = document.getElementById('duo-emoji-bar');
  if (emojiBarEl) emojiBarEl.style.display = 'none';

  // Remove forfeit button if present
  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();

  // Determine win/draw for confetti + vibration
  const myTime = gs.duoRole === 'host' ? hTime : gTime;
  const oppTime = gs.duoRole === 'host' ? gTime : hTime;
  const iWon = myTime < oppTime;

  if (iWon) {
    if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25, 70, 50]);
  } else if (isDraw) {
    if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25]);
  }

  // Open via React bridge
  import('../react/duoresult/duoResultBridge').then(({ bridgeOpenDuoResult }) => {
    bridgeOpenDuoResult({ contentHtml, iWon, isDraw, levelId: d.levelId ?? null });
  });
}

// ── Duo Records & Streaks ────────────────────────────────────────────

export function loadDuoRecords(): DuoRecords {
  return readJson<DuoRecords>(SK.DUO_RECORDS, { wins: {}, streak: 0, streakHolder: '' });
}

export function saveDuoRecords(data: DuoRecords): void {
  writeJson(SK.DUO_RECORDS, data);
}

export function recordDuoWin(winnerAlias: string, loserAlias: string): DuoRecords {
  const rec = loadDuoRecords();
  if (!rec.wins) rec.wins = {};
  rec.wins[winnerAlias] = (rec.wins[winnerAlias] || 0) + 1;
  if (!rec.wins[loserAlias]) rec.wins[loserAlias] = 0;
  // Update streak
  if (rec.streakHolder === winnerAlias) {
    rec.streak = (rec.streak || 0) + 1;
  } else {
    rec.streakHolder = winnerAlias;
    rec.streak = 1;
  }
  saveDuoRecords(rec);
  return rec;
}

export function recordDuoDraw(): DuoRecords {
  const rec = loadDuoRecords();
  rec.streak = 0;
  rec.streakHolder = '';
  saveDuoRecords(rec);
  return rec;
}

// ── Duo Emoji Reactions ──────────────────────────────────────────────

export function sendDuoEmoji(emoji: string): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoEmojiCooldown < 1500) return; // cooldown 1.5s
  gs.duoEmojiCooldown = now;
  const field = gs.duoRole === 'host' ? 'hostEmoji' : 'guestEmoji';
  const tsField = gs.duoRole === 'host' ? 'hostEmojiTs' : 'guestEmojiTs';
  duoRoomRef()
    .update({
      [field]: emoji,
      [tsField]: Date.now(),
    })
    .catch(() => {});
  // Show own emoji as confirmation
  spawnEmojiFloat(emoji, true);
}

export function handleDuoEmoji(d: DuoRoomData): void {
  if (!gs.isDuoMode) return;
  const emojiField = gs.duoRole === 'host' ? 'guestEmoji' : 'hostEmoji';
  const tsField = gs.duoRole === 'host' ? 'guestEmojiTs' : 'hostEmojiTs';
  const emoji = d[emojiField];
  const ts = d[tsField];
  if (!emoji || !ts) return;
  const key = `${ts}`;
  if (key === gs.duoLastEmojiSeen) return;
  gs.duoLastEmojiSeen = key;
  spawnEmojiFloat(emoji, false);
}

export function spawnEmojiFloat(emoji: string, isSelf: boolean): void {
  const el = document.createElement('div');
  el.className = 'duo-emoji-float';
  el.textContent = emoji;
  // Self: rises from bottom-center, opponent: rises from top-center
  const x = 50 + (Math.random() - 0.5) * 30;
  if (isSelf) {
    el.style.bottom = '120px';
    el.style.left = `${x}%`;
  } else {
    el.style.top = '80px';
    el.style.left = `${x}%`;
    if (navigator.vibrate) navigator.vibrate(15);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ── Surrender ────────────────────────────────────────────────────────

export async function surrenderDuo(): Promise<void> {
  if (!gs.isDuoMode) return;
  await submitDuoFinish(9999, 0);
  showFeedback(t('duo.surrender'), 'success');
}

// ── Close / Leave / Reset ────────────────────────────────────────────

export async function closeDuoResult(): Promise<void> {
  import('../react/duoresult/duoResultBridge').then(({ bridgeCloseDuoResult }) => bridgeCloseDuoResult());
  // Mark room finished — await to ensure Firebase update completes before state reset
  if (gs.firebaseReady && _activeRoomId) {
    try {
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().update({ status: 'finished', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch { /* ignore */ }
  }
  resetDuoState();
  const { showLevelScreen } = await import('../features/levels');
  showLevelScreen(true);
}

export async function leaveDuoRoom(): Promise<void> {
  if (!gs.firebaseReady || !gs.duoRole || !_activeRoomId) {
    resetDuoState();
    return;
  }
  try {
    if (gs.duoRole === 'host') {
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().update({ status: 'idle' });
    } else {
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().update({
        guestId: null,
        guestAlias: null,
        guestReady: false,
        guestProgress: 0,
        guestFinishTime: null,
        guestStars: null,
        guestOnline: false,
        guestHeartbeatAtMs: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch {
    /* ignore */
  }
  resetDuoState();
}

export function resetDuoState(): void {
  duoResultShown = false;
  _countdownLaunched = false;
  _duoFinishSubmitted = false;
  _snapshotRetryCount = 0;
  _lastSeenLevelId = null;
  gs.duoPenaltySeconds = 0;
  gs.duoCooldownUntil = 0;
  gs.duoLastErrorCell = -1;
  gs.duoLastErrorTime = 0;
  gs.duoSameCellStreak = 0;
  if (gs.duoCooldownTimer) {
    clearInterval(gs.duoCooldownTimer);
    gs.duoCooldownTimer = null;
  }
  gs.isDuoMode = false;
  gs.duoRole = null;
  gs.duoRoomData = null;
  gs.duoMyReady = false;
  gs.duoRoundLaunched = false;
  gs.duoCountdownStartMs = null;
  gs.duoOpponentNotified = false;
  gs.duoProgressThrottle = 0;
  if (gs.duoCountdownTimer) {
    clearTimeout(gs.duoCountdownTimer as unknown as ReturnType<typeof setTimeout>);
    gs.duoCountdownTimer = null;
  }
  if (gs.duoUnsubscribe) {
    gs.duoUnsubscribe();
    gs.duoUnsubscribe = null;
  }
  stopDuoRoomHeartbeat();
  if (gs.duoGlowUnsubscribe) {
    gs.duoGlowUnsubscribe();
    gs.duoGlowUnsubscribe = null;
    document.querySelectorAll('.level-item.duo-glow').forEach((el) => el.classList.remove('duo-glow'));
    document.querySelectorAll('.stage-node.duo-waiting').forEach((el) => el.classList.remove('duo-waiting'));
  }
  // Clean up emoji fields in room document
  if (gs.firebaseReady && _activeRoomId) {
    duoRoomRef()
      .update({
        hostEmoji: null,
        hostEmojiTs: null,
        guestEmoji: null,
        guestEmojiTs: null,
      })
      .catch(() => {});
  }
  const readyZone = document.getElementById('duo-ready-zone');
  if (readyZone) readyZone.classList.add('hidden');
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
  const emojiBar = document.getElementById('duo-emoji-bar');
  if (emojiBar) emojiBar.style.display = 'none';
  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();
  gs.duoLastEmojiSeen = '';
  setActiveRoomId(null);
  invalidateWaitingRoomsCache();
  import('./duoLobby').then((m) => m.refreshDuoLobbyRoom()).catch(() => {});
}

// ── Passive Glow Listener ────────────────────────────────────────────

export function startDuoGlowListener(): void {
  if (!gs.firebaseReady) return;
  if (gs.duoGlowUnsubscribe) gs.duoGlowUnsubscribe();
  gs.duoGlowUnsubscribe = gs.db.collection(DUO_ROOMS_COLLECTION).where('status', '==', 'waiting').onSnapshot(
    async (snap: any) => {
      // Remove old glow
      document.querySelectorAll('.level-item.duo-glow').forEach((el) => el.classList.remove('duo-glow'));
      document.querySelectorAll('.stage-node.duo-waiting').forEach((el) => el.classList.remove('duo-waiting'));
      if (!snap || (snap as any).empty) return;
      const { playerId } = getPlayerIdentity();
      const waitingRows: DuoRoomData[] = [];
      (snap as any).forEach((doc: any) => {
        const d = (doc.data() ?? null) as DuoRoomData | null;
        if (!d || d.hostId === playerId || d.status !== 'waiting' || !d.levelId) return;
        waitingRows.push(d);
      });
      if (!waitingRows.length) return;

      const { getAllLevels } = await import('../data/dataRegistry');
      const levels = getAllLevels();
      const { getDifficultyTiers, getFilteredLevels } = await import('../features/levels');
      const waitingLevelIds = new Set(waitingRows.map((r) => r.levelId));

      const stageNodes = document.querySelectorAll('.stage-node');
      const tiers = getDifficultyTiers();
      tiers.forEach((tierName: string, i: number) => {
        const hasWaiting = waitingRows.some((r) => levels.find((l) => l.id === r.levelId)?.difficultyName === tierName);
        if (hasWaiting && stageNodes[i]) stageNodes[i].classList.add('duo-waiting');
      });

      const items = document.querySelectorAll('#level-list .level-item');
      const filtered = getFilteredLevels().filter((l: { hidden?: boolean }) => !l.hidden);
      filtered.forEach((l: { id: number }, i: number) => {
        if (waitingLevelIds.has(l.id) && items[i]) items[i].classList.add('duo-glow');
      });
    },
    () => {},
  );
}

export function stopDuoGlowListener(): void {
  if (gs.duoGlowUnsubscribe) {
    gs.duoGlowUnsubscribe();
    gs.duoGlowUnsubscribe = null;
  }
  document.querySelectorAll('.level-item.duo-glow').forEach((el) => el.classList.remove('duo-glow'));
  document.querySelectorAll('.stage-node.duo-waiting').forEach((el) => el.classList.remove('duo-waiting'));
}
