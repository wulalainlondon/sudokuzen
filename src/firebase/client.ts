import { readEditionMigration, getLegacyHistory, markLegacyCloudImported } from '../platform/editionMigration';
import { ACTIVE_EDITION, editionCollection } from '../platform/appEdition';
import { leaderboardKey } from '../platform/leaderboardScope';
// Firebase initialisation, leaderboard, and player identity

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getMusicCollection, mergeMusicCollections } from '../music/collection';
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
  getLegacyProfileDb,
  getLegacyLeaderboardDb,
  signOutLegacySession,
  deleteCurrentAuthUser,
} from './runtime';
import { escapeHtml } from '../shared/html/escape';
import { sanitizeReplayHistory } from '../shared/records/levelRecords';
import { publicPlayerAlias } from '../platform/publicAlias';
import { mergeWildProfiles } from '../shared/records/wildProfileMerge';
import type { WildProfile } from '../features/wild/wildState';

let _firebaseInitPromise: Promise<boolean> | null = null;

type AchievementMap = Record<string, { date: string }>;

interface ClassicRecord {
  time: number;
  stars: number;
  replayHistory: unknown[];
  techKey?: string;
}
interface SpeedRecord {
  time: number;
  submissions: number;
  replayHistory: unknown[];
}
type GenericRecordMap = Record<string, ClassicRecord | SpeedRecord>;

interface CloudDuoProfile {
  playCount: Record<string, number>;
  legacyPlayCount?: Record<string, number>;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  rivals: Record<string, { wins: number; losses: number }>;
}

export interface LeaderboardRow {
  playerId: string;
  alias: string;
  title?: string;
  firstTimeSec: number;
  firstStars: number;
  firstSubmissions?: number;
  mode?: 'classic' | 'speed';
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
  SK.DUO_PUZZLE_RECORDS,
  SK.DUO_PROFILE,
  SK.ACHIEVEMENTS,
  SK.LAST_LEVEL,
  SK.SPEEDRUN,
  SK.SKILL_MODE,
  SK.THEME,
  SK.PLAYER_TITLE,
  SK.MUSIC_COLLECTION,
]);
let _progressSyncTimer: ReturnType<typeof setTimeout> | null = null;
const pendingSaveSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
let _bridgeInstalled = false;
let _hydrateComplete = false;
let _hydratePromise: Promise<void> | null = null;

export function isPlayerCloudHydrated(): boolean {
  return _hydrateComplete;
}

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
  return {
    playerId,
    alias,
    title,
    firstTimeSec,
    firstStars,
    ...(obj.mode === 'speed' ? { mode: 'speed', firstSubmissions: Math.max(1, toInt(obj.firstSubmissions, 1)) } : {}),
  };
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
  return {
    time,
    stars,
    replayHistory,
    ...(typeof raw.techKey === 'string' && raw.techKey.length <= 64 ? { techKey: raw.techKey } : {}),
  };
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

function nonNegativeInt(value: unknown): number {
  return Math.max(0, toInt(value));
}

function normalizeDuoProfile(raw: unknown): CloudDuoProfile {
  const profile = isPlainObject(raw) ? raw : {};
  const playCount: Record<string, number> = {};
  if (isPlainObject(profile.playCount)) {
    for (const [key, value] of Object.entries(profile.playCount)) {
      if (!key) continue;
      playCount[key] = nonNegativeInt(value);
    }
  }

  const rivals: CloudDuoProfile['rivals'] = {};
  const legacyPlayCount: Record<string, number> = {};
  if (isPlainObject(profile.legacyPlayCount)) {
    for (const [key, value] of Object.entries(profile.legacyPlayCount)) legacyPlayCount[key] = nonNegativeInt(value);
  }
  if (isPlainObject(profile.rivals)) {
    for (const [alias, record] of Object.entries(profile.rivals)) {
      if (!alias || !isPlainObject(record)) continue;
      rivals[alias] = {
        wins: nonNegativeInt(record.wins),
        losses: nonNegativeInt(record.losses),
      };
    }
  }

  return {
    playCount,
    ...(Object.keys(legacyPlayCount).length ? { legacyPlayCount } : {}),
    wins: nonNegativeInt(profile.wins),
    losses: nonNegativeInt(profile.losses),
    draws: nonNegativeInt(profile.draws),
    currentStreak: nonNegativeInt(profile.currentStreak),
    bestStreak: nonNegativeInt(profile.bestStreak),
    rivals,
  };
}

function duoResultCount(profile: CloudDuoProfile): number {
  return profile.wins + profile.losses + profile.draws;
}

function mergeDuoProfiles(localRaw: unknown, remoteRaw: unknown): CloudDuoProfile {
  const local = normalizeDuoProfile(localRaw);
  const remote = normalizeDuoProfile(remoteRaw);
  const playCount = { ...remote.playCount };
  for (const [key, count] of Object.entries(local.playCount)) {
    playCount[key] = Math.max(count, playCount[key] || 0);
  }

  const rivals = { ...remote.rivals };
  const legacyPlayCount = { ...remote.legacyPlayCount };
  for (const [key, count] of Object.entries(local.legacyPlayCount || {})) {
    legacyPlayCount[key] = Math.max(count, legacyPlayCount[key] || 0);
  }
  for (const [alias, record] of Object.entries(local.rivals)) {
    const remoteRecord = rivals[alias];
    rivals[alias] = {
      wins: Math.max(record.wins, remoteRecord?.wins || 0),
      losses: Math.max(record.losses, remoteRecord?.losses || 0),
    };
  }

  // currentStreak is not monotonic. Keep it from whichever snapshot contains
  // more completed results, so an old winning streak cannot override a later loss.
  const currentStreak = duoResultCount(local) >= duoResultCount(remote) ? local.currentStreak : remote.currentStreak;

  return {
    playCount,
    ...(Object.keys(legacyPlayCount).length ? { legacyPlayCount } : {}),
    wins: Math.max(local.wins, remote.wins),
    losses: Math.max(local.losses, remote.losses),
    draws: Math.max(local.draws, remote.draws),
    currentStreak,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    rivals,
  };
}

function mergeLegacyDuoRecords(localRaw: unknown, remoteRaw: unknown): Record<string, unknown> {
  const local = isPlainObject(localRaw) ? localRaw : {};
  const remote = isPlainObject(remoteRaw) ? remoteRaw : {};
  const merged: Record<string, unknown> = { ...remote, ...local };
  const localWins = isPlainObject(local.wins) ? local.wins : {};
  const remoteWins = isPlainObject(remote.wins) ? remote.wins : {};

  if (Object.keys(localWins).length > 0 || Object.keys(remoteWins).length > 0) {
    const wins: Record<string, number> = {};
    for (const alias of new Set([...Object.keys(remoteWins), ...Object.keys(localWins)])) {
      wins[alias] = Math.max(nonNegativeInt(remoteWins[alias]), nonNegativeInt(localWins[alias]));
    }
    merged.wins = wins;
  }

  const localStreak = nonNegativeInt(local.streak);
  const remoteStreak = nonNegativeInt(remote.streak);
  if ('streak' in local || 'streak' in remote) {
    merged.streak = Math.max(localStreak, remoteStreak);
    if (remoteStreak > localStreak && typeof remote.streakHolder === 'string') {
      merged.streakHolder = remote.streakHolder;
    }
  }
  return merged;
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
    await gs.db!.collection(editionCollection(PRESENCE_COLLECTION)).doc(_presenceDocId).set({
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
  const unsub = gs.db.collection(editionCollection(PRESENCE_COLLECTION)).onSnapshot(
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
  if (gs.firebaseReady && gs.db && getAuthUid()) return true;
  if (_firebaseInitPromise) return _firebaseInitPromise;

  _firebaseInitPromise = (async () => {
    try {
      const win = window as unknown as SudokuWindow;
      const firebase = await ensureFirebaseRuntime();
      if (!firebase) return false;
      if (!win.SUDOKU_FIREBASE_CONFIG) return false;
      if (!firebase.apps.length) firebase.initializeApp(win.SUDOKU_FIREBASE_CONFIG);
      const ownerUid = await initAnonymousAuth();
      if (!ownerUid) return false;
      bindPlayerIdentityToAuth(ownerUid);
      gs.db = firebase.firestore();
      gs.firebaseReady = true;
      window.dispatchEvent(new Event('sudoku:firebase-ready'));
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
  })().finally(() => {
    _firebaseInitPromise = null;
  });

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
  const migration = readEditionMigration();
  const changesEditionIdentity = migration?.localPrepared && ACTIVE_EDITION !== 'legacy';
  if (existingPlayerId && existingPlayerId !== playerId && !changesEditionIdentity) {
    localStorage.setItem(SK.LEGACY_PLAYER_ID, existingPlayerId);
  }
  localStorage.setItem(SK.PLAYER_ID, playerId);
  return playerId;
}

export function whenFirebaseReady(): Promise<boolean> {
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
  const docRef = gs.db!.collection(editionCollection('player_profiles')).doc(playerId);

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
  const docRef = gs.db!.collection(editionCollection('player_profiles')).doc(playerId);
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

export async function syncPlayerProgressToCloud(): Promise<boolean> {
  if (!gs.firebaseReady || !gs.db) return false;
  if (localStorage.getItem('sudoku_e2e_mode') === '1') return false;
  // Block sync until hydrate finishes, to prevent overwriting cloud data with empty localStorage
  if (!_hydrateComplete) return false;
  const { playerId, alias } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return false;
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
    duoPuzzleRecords: normalizeRecordMap(readJson<Record<string, unknown>>(SK.DUO_PUZZLE_RECORDS, {}), 'classic'),
    duoProfile: readJson<Record<string, unknown>>(SK.DUO_PROFILE, {}),
    musicCollection: getMusicCollection(),
    ...(ACTIVE_EDITION === 'pwa'
      ? {
          pwaBaselineProfile: normalizeDuoProfile(readJson('sudoku_duo_profile_v2', {})),
        }
      : {}),
  };
  const settings = readLocalSettings();
  try {
    await gs.db!.collection(editionCollection('player_profiles')).doc(playerId).set(
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
    return true;
  } catch (e) {
    console.warn('sync player progress failed:', e);
    return false;
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
    if (isProfileSyncKey(key) || (ACTIVE_EDITION === 'pwa' && key === 'sudoku_duo_profile_v2')) scheduleProgressSync();
  };

  proto.removeItem = function removeItemPatched(this: Storage, key: string): void {
    rawRemoveItem.call(this, key);
    if (this !== window.localStorage) return;
    if (SAVE_KEY_PATTERN.test(key)) {
      void deleteSaveFromCloud(key);
      scheduleProgressSync();
      return;
    }
    if (isProfileSyncKey(key) || (ACTIVE_EDITION === 'pwa' && key === 'sudoku_duo_profile_v2')) scheduleProgressSync();
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
    await gs
      .db!.collection(editionCollection('player_profiles'))
      .doc(playerId)
      .collection(PROFILE_SAVE_SUBCOLLECTION)
      .doc(saveKey)
      .set(
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
      .collection(editionCollection('player_profiles'))
      .doc(playerId)
      .collection(PROFILE_SAVE_SUBCOLLECTION)
      .doc(saveKey)
      .delete();
  } catch (e) {
    console.warn('delete cloud save failed:', e);
  }
}

function writeMigrationJson(key: string, value: unknown): void {
  // A failed local write must leave migration pending, never falsely complete.
  localStorage.setItem(key, JSON.stringify(value));
}

function mergeLegacyHistoryIntoLocal(journey: Record<string, unknown>): void {
  const archive = getLegacyHistory();
  const profile = mergeDuoProfiles(archive.duoProfile, journey.duoProfile);
  writeMigrationJson('sudoku_duo_profile_v2', profile);
  writeMigrationJson('sudoku_duo_records', mergeLegacyDuoRecords(archive.duoRecords, journey.duoRecords));
  writeMigrationJson(
    'sudoku_duo_puzzle_records_v1',
    mergeRecordMaps(
      normalizeRecordMap(archive.duoPuzzleRecords, 'classic'),
      normalizeRecordMap(journey.duoPuzzleRecords, 'classic'),
      'classic',
    ),
  );
  const current = normalizeDuoProfile(readJson(SK.DUO_PROFILE, {}));
  const legacyPlayCount = { ...current.legacyPlayCount };
  for (const [key, count] of Object.entries(profile.playCount)) {
    legacyPlayCount[key] = Math.max(count, legacyPlayCount[key] || 0);
  }
  writeMigrationJson(SK.DUO_PROFILE, { ...current, legacyPlayCount });
}

let legacySourceRecovered = false;
async function importLegacyProfileFromCloud(): Promise<void> {
  const migration = readEditionMigration();
  if (!migration || ACTIVE_EDITION === 'legacy' || (migration.cloudImported && ACTIVE_EDITION !== 'pwa')) return;
  if (!migration.sourcePlayerId) {
    legacySourceRecovered = true;
    return;
  }
  const sourceDb = await getLegacyProfileDb(migration.sourcePlayerId);
  if (!sourceDb) return; // Preserve retry eligibility if original auth is unavailable.
  const ref = sourceDb.collection('player_profiles').doc(migration.sourcePlayerId);
  const doc = await ref.get({ source: 'server' });
  if (doc.exists) {
    mergeProfileIntoLocal(doc.data() || {}, true);
    const saves = await ref.collection(PROFILE_SAVE_SUBCOLLECTION).get();
    for (const saveDoc of saves.docs) {
      const data = saveDoc.data() || {};
      const key = typeof data.key === 'string' ? data.key : saveDoc.id;
      if (SAVE_KEY_PATTERN.test(key) && isPlainObject(data.payload) && localStorage.getItem(key) === null) {
        writeJson(key, data.payload);
      }
    }
  }
  legacySourceRecovered = true;
}

async function persistLegacyHistoryToCloud(): Promise<void> {
  const migration = readEditionMigration();
  if (!migration || !gs.db || ACTIVE_EDITION === 'legacy' || (migration.cloudImported && ACTIVE_EDITION !== 'pwa'))
    return;
  if (!(await syncPlayerProgressToCloud())) return;
  const { playerId } = getPlayerIdentity();
  const ownerUid = getAuthUid();
  if (!ownerUid) return;
  try {
    // Strings avoid Firestore depth/index limits for old replay payloads. Each
    // document is below 1 MiB even with four-byte Unicode characters.
    const json = JSON.stringify(getLegacyHistory());
    const digest =
      ACTIVE_EDITION === 'pwa' && globalThis.crypto?.subtle
        ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
        : null;
    const chunks = Math.ceil(json.length / 200_000);
    const archive = gs.db.collection(editionCollection('player_profiles')).doc(playerId).collection('legacy_history');
    if (digest) {
      const summary = await archive.doc('summary').get({ source: 'server' });
      if (summary.exists && summary.data()?.contentHash === digest) {
        if (legacySourceRecovered) markLegacyCloudImported();
        return;
      }
    }
    for (let index = 0; index < chunks; index++) {
      await archive.doc(`part_${String(index).padStart(5, '0')}`).set({
        ownerUid,
        playerId,
        index,
        payload: json.slice(index * 200_000, (index + 1) * 200_000),
      });
    }
    await archive.doc('summary').set({
      ownerUid,
      playerId,
      version: 1,
      chunks,
      sourceProject: migration.sourceProject,
      sourceRecovered: legacySourceRecovered,
      ...(digest ? { contentHash: digest } : {}),
      updatedAt: firebaseServerTimestamp(),
    });
    // An interrupted/offline transfer remains retryable. Never remove source data.
    if (legacySourceRecovered) markLegacyCloudImported();
  } catch (error) {
    console.warn('Legacy history backup remains pending:', error);
  }
}

async function restoreLegacyHistoryFromCloud(playerId: string): Promise<void> {
  if (ACTIVE_EDITION === 'legacy' || !gs.db) return;
  const ref = gs.db.collection(editionCollection('player_profiles')).doc(playerId).collection('legacy_history');
  const summary = await ref.doc('summary').get();
  if (!summary.exists) return;
  const count = summary.data()?.chunks;
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 200) return;
  const parts: string[] = [];
  for (let index = 0; index < Number(count); index++) {
    const part = await ref.doc(`part_${String(index).padStart(5, '0')}`).get();
    const payload = part.data()?.payload;
    if (typeof payload !== 'string') throw new Error('Incomplete legacy history backup');
    parts.push(payload);
  }
  const history: unknown = JSON.parse(parts.join(''));
  if (isPlainObject(history)) mergeLegacyHistoryIntoLocal(history);
}

function mergeProfileIntoLocal(data: Record<string, unknown>, legacy = false): void {
  const store = legacy ? writeMigrationJson : writeJson;
  const localRecords = normalizeRecordMap(readJson<Record<string, unknown>>(SK.RECORDS, {}), 'classic');
  const remoteRecords = normalizeRecordMap(data.records, 'classic');
  const mergedRecords = mergeRecordMaps(localRecords, remoteRecords, 'classic');
  if (JSON.stringify(localRecords) !== JSON.stringify(mergedRecords)) store(SK.RECORDS, mergedRecords);

  const localSpeedRecords = normalizeRecordMap(readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {}), 'speed');
  const remoteSpeedRecords = normalizeRecordMap(data.speedRecords, 'speed');
  const mergedSpeedRecords = mergeRecordMaps(localSpeedRecords, remoteSpeedRecords, 'speed');
  if (JSON.stringify(localSpeedRecords) !== JSON.stringify(mergedSpeedRecords))
    store(SK.SPEED_RECORDS, mergedSpeedRecords);

  const localAchievements = sanitizeAchievementMap(readJson<AchievementMap>(SK.ACHIEVEMENTS, {}));
  const remoteAchievements = sanitizeAchievementMap(data.achievements);
  const mergedAchievements = mergeAchievementMaps(localAchievements, remoteAchievements);
  if (!sameAchievementMaps(localAchievements, mergedAchievements)) store(SK.ACHIEVEMENTS, mergedAchievements);

  applyRemoteSettingsIfMissing(data.settings);
  const localPractice = normalizeRecordMap(readJson(SK.PRACTICE_RECORDS, {}), 'classic');
  const mergedPractice = mergeRecordMaps(localPractice, normalizeRecordMap(data.practiceRecords, 'classic'), 'classic');
  if (JSON.stringify(localPractice) !== JSON.stringify(mergedPractice)) store(SK.PRACTICE_RECORDS, mergedPractice);
  const journey = isPlainObject(data.journey) ? data.journey : {};
  if (isPlainObject(journey.musicCollection)) {
    store(SK.MUSIC_COLLECTION, mergeMusicCollections(getMusicCollection(), journey.musicCollection));
  }
  const journeyKeys: Array<[string, unknown]> = [
    [SK.TEACH_READ, journey.teachRead],
    [SK.PRACTICE_DONE, journey.practiceDone],
  ];
  for (const [key, value] of journeyKeys) {
    if (!isPlainObject(value)) continue;
    const local = readJson<Record<string, boolean>>(key, {});
    const merged = { ...local };
    for (const [id, completed] of Object.entries(value)) if (completed === true) merged[id] = true;
    if (JSON.stringify(local) !== JSON.stringify(merged)) store(key, merged);
  }
  const localTechniques = readJson<string[]>(SK.TECHNIQUES_USED, []);
  const remoteTechniques = Array.isArray(journey.techniquesUsed) ? journey.techniquesUsed : [];
  const techniques = [
    ...new Set([...localTechniques, ...remoteTechniques].filter((value): value is string => typeof value === 'string')),
  ];
  if (JSON.stringify(localTechniques) !== JSON.stringify(techniques)) store(SK.TECHNIQUES_USED, techniques);
  if (isPlainObject(journey.wildProfile)) {
    const localWild = readJson<Partial<WildProfile>>(SK.WILD_PROFILE, {});
    const mergedWild = mergeWildProfiles(journey.wildProfile as Partial<WildProfile>, localWild);
    if (JSON.stringify(localWild) !== JSON.stringify(mergedWild)) store(SK.WILD_PROFILE, mergedWild);
  }
  if (legacy) {
    mergeLegacyHistoryIntoLocal(journey);
  } else {
    if (ACTIVE_EDITION === 'pwa' && isPlainObject(journey.pwaBaselineProfile)) {
      writeMigrationJson(
        'sudoku_duo_profile_v2',
        mergeDuoProfiles(readJson('sudoku_duo_profile_v2', {}), journey.pwaBaselineProfile),
      );
    }
    const mergedDuoRecords = mergeLegacyDuoRecords(
      readJson<Record<string, unknown>>(SK.DUO_RECORDS, {}),
      journey.duoRecords,
    );
    if (JSON.stringify(readJson(SK.DUO_RECORDS, {})) !== JSON.stringify(mergedDuoRecords)) {
      store(SK.DUO_RECORDS, mergedDuoRecords);
    }
    const localDuoPuzzleRecords = normalizeRecordMap(
      readJson<Record<string, unknown>>(SK.DUO_PUZZLE_RECORDS, {}),
      'classic',
    );
    const remoteDuoPuzzleRecords = normalizeRecordMap(journey.duoPuzzleRecords, 'classic');
    const mergedDuoPuzzleRecords = mergeRecordMaps(localDuoPuzzleRecords, remoteDuoPuzzleRecords, 'classic');
    if (JSON.stringify(localDuoPuzzleRecords) !== JSON.stringify(mergedDuoPuzzleRecords)) {
      store(SK.DUO_PUZZLE_RECORDS, mergedDuoPuzzleRecords);
    }
    const mergedDuoProfile = mergeDuoProfiles(
      readJson<Record<string, unknown>>(SK.DUO_PROFILE, {}),
      journey.duoProfile,
    );
    if (JSON.stringify(readJson(SK.DUO_PROFILE, {})) !== JSON.stringify(mergedDuoProfile)) {
      store(SK.DUO_PROFILE, mergedDuoProfile);
    }
  }
}

export async function hydratePlayerProfileFromCloud(): Promise<void> {
  if (_hydratePromise) return _hydratePromise;
  _hydratePromise = hydratePlayerProfileInternal().finally(() => {
    _hydratePromise = null;
  });
  return _hydratePromise;
}

async function hydratePlayerProfileInternal(): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  _hydrateComplete = false;
  const { playerId } = getPlayerIdentity();
  const ownerUid = getAuthUid() || (await initAnonymousAuth());
  if (!ownerUid) return;
  const docRef = gs.db!.collection(editionCollection('player_profiles')).doc(playerId);
  let hydrated = false;
  try {
    const doc = await docRef.get({ source: 'server' });
    await importLegacyProfileFromCloud().catch((error) => console.warn('Legacy cloud import remains pending:', error));
    const data = doc.exists ? doc.data() || {} : {};

    mergeProfileIntoLocal(data);
    if (doc.exists && ACTIVE_EDITION !== 'legacy') await restoreLegacyHistoryFromCloud(playerId);

    const saveSnap = doc.exists ? await docRef.collection(PROFILE_SAVE_SUBCOLLECTION).get() : { docs: [] };
    saveSnap.docs.forEach((saveDoc: FirestoreDoc) => {
      const saveData = saveDoc.data() || {};
      const key = typeof saveData.key === 'string' ? saveData.key : saveDoc.id;
      if (!SAVE_KEY_PATTERN.test(key) || !isPlainObject(saveData.payload)) return;
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(saveData.payload));
      }
    });

    hydrated = true;
    scheduleProgressSync(80);
    for (const key of Object.keys(localStorage)) {
      if (!SAVE_KEY_PATTERN.test(key)) continue;
      const payload = getLocalSavePayload(key);
      if (payload) scheduleSaveSync(key, payload, 120);
    }
  } catch (e) {
    console.warn('hydrate player profile failed:', e);
  } finally {
    _hydrateComplete = hydrated;
  }
  if (hydrated) {
    await persistLegacyHistoryToCloud();
    window.dispatchEvent(new Event('sudoku:profile-hydrated'));
  }
}

export async function deletePlayerData(): Promise<void> {
  const { playerId, alias } = getPlayerIdentity();
  const legacyPlayerId = localStorage.getItem(SK.LEGACY_PLAYER_ID);
  if (ACTIVE_EDITION === 'legacy') {
    await callDuoFunction('deletePlayerData', { playerId, alias, legacyPlayerId });
  } else {
    if (!gs.db) throw new Error('Cloud storage unavailable');
    const ownerUid = getAuthUid() || (await initAnonymousAuth());
    if (!ownerUid || playerId !== `p_${ownerUid}`) throw new Error('Authenticated account required for deletion');
    const wasHydrated = _hydrateComplete;
    try {
      gs.firebaseReady = false;
      // Stop local writes before removing data; every path is inside this realm.
      if (_progressSyncTimer) clearTimeout(_progressSyncTimer);
      for (const timer of pendingSaveSyncTimers.values()) clearTimeout(timer);
      pendingSaveSyncTimers.clear();
      _hydrateComplete = false;
      await gs.db.waitForPendingWrites?.();
      const profile = gs.db.collection(editionCollection('player_profiles')).doc(playerId);
      for (const collection of [PROFILE_SAVE_SUBCOLLECTION, 'legacy_history']) {
        const snap = await profile.collection(collection).get();
        for (const doc of snap.docs) await doc.ref.delete();
      }
      const scores = gs.db.collection(editionCollection('score_owners')).doc(playerId).collection('entries');
      const snap = await scores.get();
      for (const doc of snap.docs) {
        // Use the owner's entry ID, never a document path supplied by profile data.
        await gs.db
          .collection(editionCollection('level_first_clears'))
          .doc(doc.id)
          .collection('players')
          .doc(playerId)
          .delete();
        await doc.ref.delete();
      }
      const rooms = await gs.db
        .collection(editionCollection('duo_ws_rooms'))
        .where('hostOwnerUid', '==', ownerUid)
        .get();
      for (const doc of rooms.docs) await doc.ref.delete();
      const presence = gs.db.collection(editionCollection('presence')).doc(playerId);
      if ((await presence.get()).exists) await presence.delete();
      if ((await profile.get()).exists) await profile.delete();
      await deleteCurrentAuthUser();
      await signOutLegacySession().catch((error) => console.warn('Original session sign-out pending:', error));
    } catch (error) {
      gs.firebaseReady = true;
      _hydrateComplete = wasHydrated;
      throw error;
    }
  }
  localStorage.clear();
  window.location.reload();
}

// ── Leaderboard ─────────────────────────────────────────────────────

export async function loadLegacyLeaderboard(levelId: number): Promise<LeaderboardRow[]> {
  const db = await getLegacyLeaderboardDb();
  if (!db) return [];
  const snap = await db
    .collection('level_first_clears')
    .doc(String(levelId))
    .collection('players')
    .orderBy('firstTimeSec', 'asc')
    .limit(3)
    .get();
  return snap.docs.map((doc) => normalizeLeaderboardRow(doc.data())).filter((row): row is LeaderboardRow => !!row);
}

function currentLeaderboardKey(levelId: number): string | null {
  const level =
    getAllLevels().find((l) => l.id === levelId) || (gs.currentLevel?.id === levelId ? gs.currentLevel : null);
  return leaderboardKey(levelId, level?.puzzle, gs.isSpeedrunMode ? 'speed' : 'classic');
}

function leaderboardQuery(levelId: number) {
  const key = currentLeaderboardKey(levelId);
  if (!key || !gs.db) return null;
  const players = gs.db.collection(editionCollection('level_first_clears')).doc(key).collection('players');
  return ACTIVE_EDITION !== 'legacy' && gs.isSpeedrunMode
    ? players.orderBy('firstSubmissions', 'asc').orderBy('firstTimeSec', 'asc').limit(3)
    : players.orderBy('firstTimeSec', 'asc').limit(3);
}

function leaderboardScore(row: LeaderboardRow): string {
  return row.mode === 'speed'
    ? `${t('levelGrid.speedrunSubmissions', { submissions: String(row.firstSubmissions || 1) })}  ${formatSeconds(row.firstTimeSec)}`
    : `${formatSeconds(row.firstTimeSec)}  ${'★'.repeat(row.firstStars)}`;
}

function leaderboardRowsHtml(rows: LeaderboardRow[]): string {
  if (!rows.length) return t('firebase.noRecords');
  return rows
    .map((r, i) => {
      const titleStr = r.title ? escapeHtml(r.title) : '';
      return `${i + 1}. ${escapeHtml(r.alias)}${titleStr}  ${leaderboardScore(r)}`;
    })
    .join('<br>');
}

export function renderLeaderboard(el: HTMLElement | null, rows: LeaderboardRow[]): void {
  if (!el) return;
  el.innerHTML = gs.firebaseReady ? leaderboardRowsHtml(rows) : t('firebase.disabled');
}

async function leaderboardHtml(levelId: number): Promise<string> {
  const query = leaderboardQuery(levelId);
  const current = query
    ? query
        .get()
        .then((snap) =>
          snap.docs
            .map((doc: FirestoreDoc) => normalizeLeaderboardRow(doc.data()))
            .filter((row): row is LeaderboardRow => !!row),
        )
    : Promise.resolve([] as LeaderboardRow[]);
  if (ACTIVE_EDITION !== 'pwa') return leaderboardRowsHtml(await current);
  // Old boards are still the same immutable public records. Do not merge ranks
  // with a new fingerprint: some old level IDs now refer to different puzzles.
  const [old, next] = await Promise.allSettled([loadLegacyLeaderboard(levelId), current]);
  const oldHtml = old.status === 'fulfilled' ? leaderboardRowsHtml(old.value) : t('firebase.loadFailed');
  const nextHtml = next.status === 'fulfilled' ? leaderboardRowsHtml(next.value) : t('firebase.loadFailed');
  return `<div data-testid="pwa-existing-board"><strong>${t('edition.existingBoard')}</strong><br>${oldHtml}<p style="font-size:12px;color:var(--text-light);margin:6px 0 12px">${t('edition.existingBoardNote')}</p></div><div data-testid="pwa-current-board"><strong>${t('edition.currentBoard')}</strong><br>${nextHtml}</div>`;
}

export async function loadLevelLeaderboard(levelId: number): Promise<void> {
  // Duo puzzles have their own per-puzzle records. Legacy Duo IDs were reused
  // across tiers, so the classic first-clear board would compare different boards.
  if (gs.isDuoMode) {
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(document.getElementById('win-leaderboard-list'), []);
    return;
  }
  if (!gs.firebaseReady || !gs.db) {
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(document.getElementById('win-leaderboard-list'), []);
    return;
  }
  try {
    const html = await leaderboardHtml(levelId);
    if (gs.leaderboardListEl) gs.leaderboardListEl.innerHTML = html;
    const winEl = document.getElementById('win-leaderboard-list');
    if (winEl) winEl.innerHTML = html;
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
  try {
    const html = await leaderboardHtml(levelId);
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
  const level = levels.find((l) => l.id === levelId) || (gs.currentLevel?.id === levelId ? gs.currentLevel : null);
  const boardKey = currentLeaderboardKey(levelId);
  if (!boardKey || !gs.db || gs.isDuoMode) return;
  const mode = gs.isSpeedrunMode ? 'speed' : 'classic';
  const firstSubmissions = mode === 'speed' ? gs.submissionCount + 1 : 0;
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
  const docRef = gs.db
    .collection(editionCollection('level_first_clears'))
    .doc(boardKey)
    .collection('players')
    .doc(playerId);
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
        firstStars: mode === 'speed' ? 0 : clearStars,
        ...(ACTIVE_EDITION === 'legacy'
          ? {}
          : {
              edition: ACTIVE_EDITION,
              mode,
              boardKey,
              firstSubmissions,
            }),
        levelVersion,
        levelSnapshot,
        createdAt: firebaseServerTimestamp(),
      });
      if (ACTIVE_EDITION !== 'legacy') {
        const ownerRef = gs
          .db!.collection(editionCollection('score_owners'))
          .doc(playerId)
          .collection('entries')
          .doc(boardKey);
        tx.set(ownerRef, { ownerUid, playerId, boardKey, createdAt: firebaseServerTimestamp() });
      }
    });
  } catch (e) {
    console.warn('submit first clear failed:', e);
  }
}
