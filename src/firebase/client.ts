// Firebase initialisation, leaderboard, and player identity

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds, normalizeAlias, ALIAS_MIN_LEN } from '../game/utils';
import { showFeedback } from '../ui/feedback';
import { getAllLevels } from '../data/dataRegistry';
import { t } from '../i18n/t';
import { getEquippedTitleDisplay } from '../features/titles';
import type { FirestoreDoc, FirestoreTransaction } from './types';
import type { SudokuWindow } from '../facade/windowTypes';
import {
  callDuoFunction,
  ensureFirebaseRuntime,
  firebaseServerTimestamp,
  getAuthUid,
  initAnonymousAuth,
} from './runtime';
import { escapeHtml } from '../shared/html/escape';
import { sanitizeReplayHistory } from '../shared/records/levelRecords';
import { publicPlayerAlias } from '../platform/publicAlias';

let _firebaseInitPromise: Promise<boolean> | null = null;

type AchievementMap = Record<string, { date: string }>;

interface ClassicRecord {
  time: number;
  stars: number;
  replayHistory: unknown[];
}
interface SpeedRecord {
  time: number;
  submissions: number;
  replayHistory: unknown[];
}
type GenericRecordMap = Record<string, ClassicRecord | SpeedRecord>;

interface LeaderboardRow {
  playerId: string;
  alias: string;
  title?: string;
  firstTimeSec: number;
  firstStars: number;
}
const SAVE_KEY_PATTERN = /^sudoku_(speed_)?save_(\d+)$/;
const PROFILE_SAVE_SUBCOLLECTION = 'game_saves';
const PROGRESS_SYNC_DEBOUNCE_MS = 1200;
const SAVE_SYNC_DEBOUNCE_MS = 800;
const PROFILE_SYNC_KEYS: Set<string> = new Set([
  SK.RECORDS,
  SK.SPEED_RECORDS,
  SK.PRACTICE_RECORDS,
  SK.TEACH_READ,
  SK.PRACTICE_DONE,
  SK.TECHNIQUES_USED,
  SK.WILD_PROFILE,
  SK.DUO_RECORDS,
  SK.ACHIEVEMENTS,
  SK.LAST_LEVEL,
  SK.SPEEDRUN,
  SK.SKILL_MODE,
  SK.THEME,
  SK.PLAYER_TITLE,
]);
let _progressSyncTimer: ReturnType<typeof setTimeout> | null = null;
const pendingSaveSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
let _bridgeInstalled = false;
let _hydrateComplete = false;

function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeAchievementMap(raw: unknown): AchievementMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: AchievementMap = {};
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (!meta || typeof meta !== 'object') continue;
    const date = (meta as Record<string, unknown>).date;
    if (!isIsoDay(date)) continue;
    out[id] = { date };
  }
  return out;
}

function mergeAchievementMaps(local: AchievementMap, remote: AchievementMap): AchievementMap {
  const merged: AchievementMap = { ...remote };
  for (const [id, meta] of Object.entries(local)) {
    const r = merged[id];
    if (!r) {
      merged[id] = { date: meta.date };
      continue;
    }
    // Keep the earlier unlock date for timeline consistency.
    merged[id] = { date: meta.date < r.date ? meta.date : r.date };
  }
  return merged;
}

function sameAchievementMaps(a: AchievementMap, b: AchievementMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!b[key] || b[key].date !== a[key].date) return false;
  }
  return true;
}

function normalizeLeaderboardRow(raw: unknown): LeaderboardRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const playerId = typeof obj.playerId === 'string' ? obj.playerId : '';
  const alias = publicPlayerAlias(playerId, normalizeAlias(obj.alias));
  if (!alias) return null;
  const firstTimeSec = Math.max(0, toInt(obj.firstTimeSec));
  const firstStars = Math.min(3, Math.max(0, toInt(obj.firstStars)));
  const title = typeof obj.title === 'string' ? normalizeAlias(obj.title) : undefined;
  return { playerId, alias, title, firstTimeSec, firstStars };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeClassicRecord(raw: unknown): ClassicRecord | null {
  if (typeof raw === 'number') {
    return { time: Math.max(0, toInt(raw)), stars: 1, replayHistory: [] };
  }
  if (!isPlainObject(raw)) return null;
  const time = Math.max(0, toInt(raw.time));
  const stars = Math.min(3, Math.max(1, toInt(raw.stars, 1)));
  const replayHistory = sanitizeReplayHistory(raw.replayHistory);
  return { time, stars, replayHistory };
}

function normalizeSpeedRecord(raw: unknown): SpeedRecord | null {
  if (!isPlainObject(raw)) return null;
  const time = Math.max(0, toInt(raw.time));
  const submissions = Math.max(1, toInt(raw.submissions, 1));
  const replayHistory = sanitizeReplayHistory(raw.replayHistory);
  return { time, submissions, replayHistory };
}

function normalizeRecordMap(raw: unknown, mode: 'classic' | 'speed'): GenericRecordMap {
  if (!isPlainObject(raw)) return {};
  const out: GenericRecordMap = {};
  for (const [levelId, rec] of Object.entries(raw)) {
    const normalized = mode === 'classic' ? normalizeClassicRecord(rec) : normalizeSpeedRecord(rec);
    if (normalized) out[levelId] = normalized;
  }
  return out;
}

function pickBetterClassic(a: unknown, b: unknown): ClassicRecord | null {
  const ra = normalizeClassicRecord(a);
  const rb = normalizeClassicRecord(b);
  if (!ra) return rb;
  if (!rb) return ra;
  if (ra.stars !== rb.stars) return ra.stars > rb.stars ? ra : rb;
  return ra.time <= rb.time ? ra : rb;
}

function pickBetterSpeed(a: unknown, b: unknown): SpeedRecord | null {
  const ra = normalizeSpeedRecord(a);
  const rb = normalizeSpeedRecord(b);
  if (!ra) return rb;
  if (!rb) return ra;
  if (ra.submissions !== rb.submissions) return ra.submissions < rb.submissions ? ra : rb;
  return ra.time <= rb.time ? ra : rb;
}

function mergeRecordMaps(
  localMap: GenericRecordMap,
  remoteMap: GenericRecordMap,
  mode: 'classic' | 'speed',
): GenericRecordMap {
  const out: GenericRecordMap = { ...remoteMap };
  for (const [levelId, localRec] of Object.entries(localMap)) {
    const better =
      mode === 'classic' ? pickBetterClassic(localRec, out[levelId]) : pickBetterSpeed(localRec, out[levelId]);
    if (better) out[levelId] = better;
  }
  return out;
}

function readLocalSettings(): {
  speedrun: boolean | null;
  skillMode: boolean | null;
  theme: string | null;
  lastLevel: number | null;
} {
  const speedrunRaw = localStorage.getItem(SK.SPEEDRUN);
  const skillRaw = localStorage.getItem(SK.SKILL_MODE);
  const themeRaw = localStorage.getItem(SK.THEME);
  const lastLevelRaw = localStorage.getItem(SK.LAST_LEVEL);
  const lastLevel = lastLevelRaw === null ? null : Math.max(1, toInt(lastLevelRaw, 1));
  return {
    speedrun: speedrunRaw === null ? null : speedrunRaw === 'true',
    skillMode: skillRaw === null ? null : skillRaw === 'true',
    theme: themeRaw && themeRaw.trim() ? themeRaw.trim() : null,
    lastLevel,
  };
}

function applyRemoteSettingsIfMissing(remote: unknown): void {
  if (!isPlainObject(remote)) return;
  if (localStorage.getItem(SK.SPEEDRUN) === null && typeof remote.speedrun === 'boolean') {
    localStorage.setItem(SK.SPEEDRUN, String(remote.speedrun));
  }
  if (localStorage.getItem(SK.SKILL_MODE) === null && typeof remote.skillMode === 'boolean') {
    localStorage.setItem(SK.SKILL_MODE, String(remote.skillMode));
  }
  if (localStorage.getItem(SK.THEME) === null && typeof remote.theme === 'string' && remote.theme.trim()) {
    localStorage.setItem(SK.THEME, remote.theme.trim());
  }
  if (localStorage.getItem(SK.LAST_LEVEL) === null && Number.isFinite(Number(remote.lastLevel))) {
    localStorage.setItem(SK.LAST_LEVEL, String(Math.max(1, toInt(remote.lastLevel, 1))));
  }
}

function getLocalSavePayload(saveKey: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isProfileSyncKey(key: string): boolean {
  return PROFILE_SYNC_KEYS.has(key);
}

// ── Presence ────────────────────────────────────────────────────────

const PRESENCE_COLLECTION = 'presence';
const PRESENCE_HEARTBEAT_MS = 60_000;
const PRESENCE_TTL_MS = 5 * 60_000; // 5 minutes — wider margin over 60s heartbeat to avoid false offline

let _presenceDocId: string | null = null;
let _presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

async function _setPresenceDoc(): Promise<void> {
  if (!gs.firebaseReady || !gs.db || !_presenceDocId) return;
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  try {
    await gs.db!.collection(PRESENCE_COLLECTION).doc(_presenceDocId).set({
      playerId: _presenceDocId,
      ownerUid,
      timestamp: firebaseServerTimestamp(),
    });
  } catch (e) {
    console.warn('presence set failed:', e);
  }
}

export async function initPresence(): Promise<void> {
  if (!gs.firebaseReady || !gs.db) {
    const ok = await initFirebase();
    if (!ok || !gs.db) return;
  }
  const { playerId } = getPlayerIdentity();
  _presenceDocId = playerId;

  // Initial heartbeat
  void _setPresenceDoc();

  // Periodic heartbeat
  if (_presenceHeartbeatTimer) clearInterval(_presenceHeartbeatTimer);
  _presenceHeartbeatTimer = setInterval(() => void _setPresenceDoc(), PRESENCE_HEARTBEAT_MS);

  // On unload: stop heartbeat only; doc deletion is unreliable here — TTL handles cleanup
  window.addEventListener('beforeunload', () => {
    if (_presenceHeartbeatTimer) {
      clearInterval(_presenceHeartbeatTimer);
      _presenceHeartbeatTimer = null;
    }
  });

  // On hidden: pause heartbeat but keep doc so count stays stable while tab is backgrounded
  // On visible: refresh doc and resume heartbeat
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (_presenceHeartbeatTimer) {
        clearInterval(_presenceHeartbeatTimer);
        _presenceHeartbeatTimer = null;
      }
    } else {
      void _setPresenceDoc();
      if (!_presenceHeartbeatTimer) {
        _presenceHeartbeatTimer = setInterval(() => void _setPresenceDoc(), PRESENCE_HEARTBEAT_MS);
      }
    }
  });
}

// Subscribe to live online count via Firestore onSnapshot.
// Filters client-side by TTL so stale docs are excluded on each heartbeat event.
// Returns an unsubscribe function.
// NOTE: If player count grows large (hundreds+), consider switching back to 30s polling
// (getOnlineCount with ONLINE_COUNT_CACHE_MS) to avoid N² read amplification.
export function subscribeOnlineCount(callback: (count: number) => void): () => void {
  if (!gs.firebaseReady || !gs.db) return () => {};
  const unsub = gs.db.collection(PRESENCE_COLLECTION).onSnapshot(
    (snap) => {
      const cutoff = Date.now() - PRESENCE_TTL_MS;
      const count = snap.docs.filter((doc) => {
        const ts = (doc.data()?.timestamp as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return ts > cutoff;
      }).length;
      callback(count);
    },
    (e) => {
      console.warn('subscribeOnlineCount failed:', e);
    },
  );
  return unsub;
}

// ── Init ────────────────────────────────────────────────────────────

export async function initFirebase(): Promise<boolean> {
  if (gs.firebaseReady && gs.db) return true;
  if (_firebaseInitPromise) return _firebaseInitPromise;

  _firebaseInitPromise = (async () => {
    try {
      const win = window as unknown as SudokuWindow;
      const firebase = await ensureFirebaseRuntime();
      if (!firebase) return false;
      if (!win.SUDOKU_FIREBASE_CONFIG) return false;
      if (!firebase.apps.length) firebase.initializeApp(win.SUDOKU_FIREBASE_CONFIG);
      gs.db = firebase.firestore();
      gs.firebaseReady = true;
      const ownerUid = await initAnonymousAuth();
      if (!ownerUid) return false;
      bindPlayerIdentityToAuth(ownerUid);
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
  })();

  return _firebaseInitPromise;
}

/**
 * Move pre-UID PWA identities onto the authenticated document namespace.
 *
 * Keeping LEGACY_PLAYER_ID is intentional: besides account deletion cleanup,
 * it is the durable upgrade marker used to grandfather players who had access
 * to every mode before the journey gates were introduced. A brand-new install
 * has no existing player ID and therefore does not receive this marker.
 */
export function bindPlayerIdentityToAuth(ownerUid: string): string {
  const playerId = `p_${ownerUid}`;
  const existingPlayerId = localStorage.getItem(SK.PLAYER_ID);
  if (existingPlayerId && existingPlayerId !== playerId) {
    localStorage.setItem(SK.LEGACY_PLAYER_ID, existingPlayerId);
  }
  localStorage.setItem(SK.PLAYER_ID, playerId);
  return playerId;
}

export function whenFirebaseReady(): Promise<boolean> {
  if (gs.firebaseReady && gs.db) return Promise.resolve(true);
  return initFirebase();
}

// ── Player identity ─────────────────────────────────────────────────

export function getPlayerIdentity(): { playerId: string; alias: string } {
  let playerId = localStorage.getItem(SK.PLAYER_ID);
  const ownerUid = getAuthUid();
  if (ownerUid && import.meta.env.MODE !== 'test') {
    playerId = `p_${ownerUid}`;
    localStorage.setItem(SK.PLAYER_ID, playerId);
  }
  if (!playerId) {
    playerId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SK.PLAYER_ID, playerId);
  }
  let alias = localStorage.getItem(SK.PLAYER_ALIAS);
  if (!alias) {
    alias = t('miscRuntime.defaultAlias', { code: String(Math.floor(Math.random() * 9000) + 1000) });
    localStorage.setItem(SK.PLAYER_ALIAS, alias);
  }
  alias = normalizeAlias(alias);
  if (alias.length < ALIAS_MIN_LEN)
    alias = t('miscRuntime.defaultAlias', { code: String(Math.floor(Math.random() * 9000) + 1000) });
  alias = publicPlayerAlias(playerId, alias);
  localStorage.setItem(SK.PLAYER_ALIAS, alias);
  return { playerId, alias };
}

export function loadAliasToInput(): void {
  if (!gs.aliasInputEl) return;
  gs.aliasInputEl.value = localStorage.getItem(SK.PLAYER_ALIAS) || '';
}

export function saveAlias(): void {
  const alias = normalizeAlias(gs.aliasInputEl ? gs.aliasInputEl.value : '');
  if (alias.length < ALIAS_MIN_LEN) {
    showFeedback(t('alias.tooShort'));
    return;
  }
  localStorage.setItem(SK.PLAYER_ALIAS, alias);
  if (gs.aliasInputEl) gs.aliasInputEl.value = alias;
  showFeedback(t('alias.updated', { alias }));
  scheduleProgressSync(50);
}

export async function mergeCloudAchievements(localAchievements: AchievementMap): Promise<AchievementMap | null> {
  if (!gs.firebaseReady || !gs.db) return null;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return null;
  const docRef = gs.db!.collection('player_profiles').doc(playerId);

  try {
    const doc = await docRef.get();
    const remoteAchievements = sanitizeAchievementMap(doc.exists ? doc.data()?.achievements : null);
    const merged = mergeAchievementMaps(localAchievements, remoteAchievements);
    if (!sameAchievementMaps(merged, remoteAchievements)) {
      await docRef.set(
        {
          playerId,
          ownerUid,
          alias,
          achievements: merged,
          achievementsUpdatedAt: firebaseServerTimestamp(),
        },
        { merge: true },
      );
    }
    return merged;
  } catch (e) {
    console.warn('merge cloud achievements failed:', e);
    return null;
  }
}

export async function syncAchievementsToCloud(achievements: AchievementMap): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  const sanitized = sanitizeAchievementMap(achievements);
  const docRef = gs.db!.collection('player_profiles').doc(playerId);
  try {
    await docRef.set(
      {
        playerId,
        ownerUid,
        alias,
        achievements: sanitized,
        achievementsUpdatedAt: firebaseServerTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('sync achievements failed:', e);
  }
}

export async function syncPlayerProgressToCloud(): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  if (localStorage.getItem('sudoku_e2e_mode') === '1') return;
  // Block sync until hydrate finishes, to prevent overwriting cloud data with empty localStorage
  if (!_hydrateComplete) return;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  const records = normalizeRecordMap(readJson<Record<string, unknown>>(SK.RECORDS, {}), 'classic');
  const speedRecords = normalizeRecordMap(readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {}), 'speed');
  const practiceRecords = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const achievements = sanitizeAchievementMap(readJson<AchievementMap>(SK.ACHIEVEMENTS, {}));
  const journey = {
    teachRead: readJson<Record<string, boolean>>(SK.TEACH_READ, {}),
    practiceDone: readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {}),
    techniquesUsed: readJson<string[]>(SK.TECHNIQUES_USED, []),
    wildProfile: readJson<Record<string, unknown>>(SK.WILD_PROFILE, {}),
    duoRecords: readJson<Record<string, unknown>>(SK.DUO_RECORDS, {}),
    duoProfile: readJson<Record<string, unknown>>('sudoku_duo_profile_v2', {}),
  };
  const settings = readLocalSettings();
  try {
    await gs.db!.collection('player_profiles').doc(playerId).set(
      {
        playerId,
        ownerUid,
        alias,
        records,
        speedRecords,
        practiceRecords,
        achievements,
        journey,
        settings,
        progressUpdatedAt: firebaseServerTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('sync player progress failed:', e);
  }
}

export function scheduleProgressSync(delayMs = PROGRESS_SYNC_DEBOUNCE_MS): void {
  if (!gs.firebaseReady || !gs.db) return;
  if (_progressSyncTimer) clearTimeout(_progressSyncTimer);
  _progressSyncTimer = setTimeout(() => {
    _progressSyncTimer = null;
    void syncPlayerProgressToCloud();
  }, delayMs);
}

export function installPlayerCloudSyncBridge(): void {
  if (_bridgeInstalled) return;
  if (typeof window === 'undefined' || !window.localStorage) return;
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  if (!proto || typeof proto.setItem !== 'function' || typeof proto.removeItem !== 'function') return;

  const rawSetItem = proto.setItem;
  const rawRemoveItem = proto.removeItem;

  proto.setItem = function setItemPatched(this: Storage, key: string, value: string): void {
    rawSetItem.call(this, key, value);
    if (this !== window.localStorage) return;
    if (SAVE_KEY_PATTERN.test(key)) {
      const payload = getLocalSavePayload(key);
      if (payload) scheduleSaveSync(key, payload);
      scheduleProgressSync();
      return;
    }
    if (isProfileSyncKey(key)) scheduleProgressSync();
  };

  proto.removeItem = function removeItemPatched(this: Storage, key: string): void {
    rawRemoveItem.call(this, key);
    if (this !== window.localStorage) return;
    if (SAVE_KEY_PATTERN.test(key)) {
      void deleteSaveFromCloud(key);
      scheduleProgressSync();
      return;
    }
    if (isProfileSyncKey(key)) scheduleProgressSync();
  };

  _bridgeInstalled = true;
}

export async function syncSaveToCloud(saveKey: string, payload: Record<string, unknown>): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  if (localStorage.getItem('sudoku_e2e_mode') === '1') return;
  if (!SAVE_KEY_PATTERN.test(saveKey) || !isPlainObject(payload)) return;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  try {
    await gs.db!.collection('player_profiles').doc(playerId).collection(PROFILE_SAVE_SUBCOLLECTION).doc(saveKey).set(
      {
        key: saveKey,
        playerId,
        ownerUid,
        alias,
        payload,
        updatedAt: firebaseServerTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('sync save failed:', e);
  }
}

export function scheduleSaveSync(
  saveKey: string,
  payload: Record<string, unknown>,
  delayMs = SAVE_SYNC_DEBOUNCE_MS,
): void {
  if (!gs.firebaseReady || !gs.db) return;
  const oldTimer = pendingSaveSyncTimers.get(saveKey);
  if (oldTimer) clearTimeout(oldTimer);
  const timer = setTimeout(() => {
    pendingSaveSyncTimers.delete(saveKey);
    void syncSaveToCloud(saveKey, payload);
  }, delayMs);
  pendingSaveSyncTimers.set(saveKey, timer);
}

export async function deleteSaveFromCloud(saveKey: string): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  if (!SAVE_KEY_PATTERN.test(saveKey)) return;
  const existingTimer = pendingSaveSyncTimers.get(saveKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingSaveSyncTimers.delete(saveKey);
  }
  const { playerId } = getPlayerIdentity();
  try {
    await gs.db
      .collection('player_profiles')
      .doc(playerId)
      .collection(PROFILE_SAVE_SUBCOLLECTION)
      .doc(saveKey)
      .delete();
  } catch (e) {
    console.warn('delete cloud save failed:', e);
  }
}

export async function hydratePlayerProfileFromCloud(): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  const { playerId } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  const docRef = gs.db!.collection('player_profiles').doc(playerId);
  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      scheduleProgressSync(50);
      return;
    }
    const data = doc.data() || {};

    const localRecords = normalizeRecordMap(readJson<Record<string, unknown>>(SK.RECORDS, {}), 'classic');
    const remoteRecords = normalizeRecordMap(data.records, 'classic');
    const mergedRecords = mergeRecordMaps(localRecords, remoteRecords, 'classic');
    if (JSON.stringify(localRecords) !== JSON.stringify(mergedRecords)) writeJson(SK.RECORDS, mergedRecords);

    const localSpeedRecords = normalizeRecordMap(readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {}), 'speed');
    const remoteSpeedRecords = normalizeRecordMap(data.speedRecords, 'speed');
    const mergedSpeedRecords = mergeRecordMaps(localSpeedRecords, remoteSpeedRecords, 'speed');
    if (JSON.stringify(localSpeedRecords) !== JSON.stringify(mergedSpeedRecords))
      writeJson(SK.SPEED_RECORDS, mergedSpeedRecords);

    const localAchievements = sanitizeAchievementMap(readJson<AchievementMap>(SK.ACHIEVEMENTS, {}));
    const remoteAchievements = sanitizeAchievementMap(data.achievements);
    const mergedAchievements = mergeAchievementMaps(localAchievements, remoteAchievements);
    if (!sameAchievementMaps(localAchievements, mergedAchievements)) writeJson(SK.ACHIEVEMENTS, mergedAchievements);

    applyRemoteSettingsIfMissing(data.settings);
    if (isPlainObject(data.practiceRecords) && localStorage.getItem(SK.PRACTICE_RECORDS) === null) {
      writeJson(SK.PRACTICE_RECORDS, data.practiceRecords);
    }
    const journey = isPlainObject(data.journey) ? data.journey : {};
    const journeyKeys: Array<[string, unknown]> = [
      [SK.TEACH_READ, journey.teachRead],
      [SK.PRACTICE_DONE, journey.practiceDone],
      [SK.TECHNIQUES_USED, journey.techniquesUsed],
      [SK.WILD_PROFILE, journey.wildProfile],
      [SK.DUO_RECORDS, journey.duoRecords],
      ['sudoku_duo_profile_v2', journey.duoProfile],
    ];
    for (const [key, value] of journeyKeys) {
      if (value != null && localStorage.getItem(key) === null) writeJson(key, value);
    }

    const saveSnap = await docRef.collection(PROFILE_SAVE_SUBCOLLECTION).get();
    saveSnap.docs.forEach((saveDoc: FirestoreDoc) => {
      const saveData = saveDoc.data() || {};
      const key = typeof saveData.key === 'string' ? saveData.key : saveDoc.id;
      if (!SAVE_KEY_PATTERN.test(key) || !isPlainObject(saveData.payload)) return;
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(saveData.payload));
      }
    });

    scheduleProgressSync(80);
    for (const key of Object.keys(localStorage)) {
      if (!SAVE_KEY_PATTERN.test(key)) continue;
      const payload = getLocalSavePayload(key);
      if (payload) scheduleSaveSync(key, payload, 120);
    }
  } catch (e) {
    console.warn('hydrate player profile failed:', e);
  } finally {
    _hydrateComplete = true;
  }
}

export async function deletePlayerData(): Promise<void> {
  const { playerId, alias } = getPlayerIdentity();
  const legacyPlayerId = localStorage.getItem(SK.LEGACY_PLAYER_ID);
  await callDuoFunction('deletePlayerData', { playerId, alias, legacyPlayerId });
  localStorage.clear();
  window.location.reload();
}

// ── Leaderboard ─────────────────────────────────────────────────────

export function renderLeaderboard(el: HTMLElement | null, rows: LeaderboardRow[]): void {
  if (!el) return;
  if (!gs.firebaseReady) {
    el.textContent = t('firebase.disabled');
    return;
  }
  if (!rows.length) {
    el.textContent = t('firebase.noRecords');
    return;
  }
  el.innerHTML = rows
    .map((r, i) => {
      const titleStr = r.title ? escapeHtml(r.title) : '';
      return `${i + 1}. ${escapeHtml(r.alias)}${titleStr}  ${formatSeconds(r.firstTimeSec)}  ${'★'.repeat(r.firstStars)}`;
    })
    .join('<br>');
}

export async function loadLevelLeaderboard(levelId: number): Promise<void> {
  if (!gs.firebaseReady || !gs.db) {
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(document.getElementById('win-leaderboard-list'), []);
    return;
  }
  const db = gs.db;
  try {
    const snap = await db
      .collection('level_first_clears')
      .doc(String(levelId))
      .collection('players')
      .orderBy('firstTimeSec', 'asc')
      .limit(3)
      .get();
    const rows = snap.docs
      .map((d: FirestoreDoc) => normalizeLeaderboardRow(d.data()))
      .filter((row): row is LeaderboardRow => !!row);
    renderLeaderboard(gs.leaderboardListEl, rows);
    renderLeaderboard(document.getElementById('win-leaderboard-list'), rows);
    // Also update React win store leaderboard
    const winEl = document.getElementById('win-leaderboard-list');
    if (winEl) renderLeaderboard(winEl, rows);
  } catch (e) {
    console.warn('load leaderboard failed:', e);
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(document.getElementById('win-leaderboard-list'), []);
  }
}

export async function loadPreLevelLeaderboard(levelId: number): Promise<void> {
  if (!gs.firebaseReady || !gs.db) {
    const _plEl = document.getElementById('pre-level-leaderboard');
    if (_plEl) _plEl.textContent = t('firebase.disabled');
    return;
  }
  const db = gs.db;
  try {
    const snap = await db
      .collection('level_first_clears')
      .doc(String(levelId))
      .collection('players')
      .orderBy('firstTimeSec', 'asc')
      .limit(3)
      .get();
    const rows = snap.docs
      .map((d: FirestoreDoc) => normalizeLeaderboardRow(d.data()))
      .filter((row): row is LeaderboardRow => !!row);
    const html = !rows.length
      ? t('firebase.noRecords')
      : rows
          .map((r: LeaderboardRow, i: number) => {
            const timeStr = formatSeconds(r.firstTimeSec);
            const titleStr = r.title ? escapeHtml(r.title) : '';
            if (gs.isSpeedrunMode)
              return `${i + 1}. ${escapeHtml(r.alias)}${titleStr}  ${timeStr} ${t('miscRuntime.speedrunClassic')}`;
            return `${i + 1}. ${escapeHtml(r.alias)}${titleStr}  ${timeStr}  ${'★'.repeat(r.firstStars)}`;
          })
          .join('<br>');
    const _plEl = document.getElementById('pre-level-leaderboard');
    if (_plEl) _plEl.innerHTML = html;
    // Also update React pre-level store
    import('../react/prelevel/preLevelBridge').then(({ bridgeSetPreLevelLeaderboard }) => {
      bridgeSetPreLevelLeaderboard(html);
    });
  } catch (e) {
    console.warn('load pre-level leaderboard failed:', e);
    const _plEl = document.getElementById('pre-level-leaderboard');
    if (_plEl) _plEl.textContent = t('firebase.loadFailed');
  }
}

export async function submitFirstClear(levelId: number, clearSec: number, clearStars: number): Promise<void> {
  if (!gs.firebaseReady) return;
  if (localStorage.getItem('sudoku_e2e_mode') === '1') return;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  const levels = getAllLevels();
  const level = levels.find((l) => l.id === levelId) || gs.currentLevel || null;
  const levelVersion = gs.appVersion || 'legacy-unknown';
  const levelSnapshot = level
    ? {
        schemaVersion: 1,
        levelId: level.id,
        stars: level.stars,
        difficultyName: level.difficultyName,
        displayName: level.displayName,
        maxTechnique: level.maxTechnique || null,
        techTier: level.techTier || null,
        puzzle: Array.isArray(level.puzzle) ? level.puzzle.slice() : null,
        puzzleHash: Array.isArray(level.puzzle) ? `p81:${level.puzzle.join('')}` : null,
      }
    : null;
  const docRef = gs.db!.collection('level_first_clears').doc(String(levelId)).collection('players').doc(playerId);
  try {
    await gs.db!.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(docRef);
      if (doc.exists) return;
      const title = getEquippedTitleDisplay();
      tx.set(docRef, {
        playerId,
        ownerUid,
        alias,
        title,
        firstTimeSec: clearSec,
        firstStars: clearStars,
        levelVersion,
        levelSnapshot,
        createdAt: firebaseServerTimestamp(),
      });
    });
  } catch (e) {
    console.warn('submit first clear failed:', e);
  }
}
