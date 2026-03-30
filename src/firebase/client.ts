// Firebase initialisation, leaderboard, and player identity

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds, normalizeAlias, ALIAS_MIN_LEN } from '../game/utils';
import { showFeedback } from '../ui/feedback';
import { getAllLevels } from '../data/dataRegistry';

declare const firebase: any;
type AchievementMap = Record<string, { date: string }>;
type GenericRecordMap = Record<string, any>;
const SAVE_KEY_PATTERN = /^sudoku_(speed_)?save_(\d+)$/;
const PROFILE_SAVE_SUBCOLLECTION = 'game_saves';
const ALIAS_INDEX_COLLECTION = 'alias_player_index';
const PROGRESS_SYNC_DEBOUNCE_MS = 1200;
const SAVE_SYNC_DEBOUNCE_MS = 800;
const PROFILE_SYNC_KEYS: Set<string> = new Set([
  SK.RECORDS,
  SK.SPEED_RECORDS,
  SK.ACHIEVEMENTS,
  SK.LAST_LEVEL,
  SK.SPEEDRUN,
  SK.SKILL_MODE,
  SK.THEME,
]);
let progressSyncTimer: ReturnType<typeof setTimeout> | null = null;
const pendingSaveSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
let bridgeInstalled = false;
let hydrateComplete = false;

function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeAchievementMap(raw: unknown): AchievementMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: AchievementMap = {};
  for (const [id, meta] of Object.entries(raw as Record<string, any>)) {
    if (!meta || typeof meta !== 'object') continue;
    const date = (meta as any).date;
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

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeClassicRecord(raw: any): { time: number; stars: number; replayHistory: any[] } | null {
  if (typeof raw === 'number') {
    return { time: Math.max(0, toInt(raw)), stars: 1, replayHistory: [] };
  }
  if (!isPlainObject(raw)) return null;
  const time = Math.max(0, toInt(raw.time));
  const stars = Math.min(3, Math.max(1, toInt(raw.stars, 1)));
  const replayHistory = Array.isArray(raw.replayHistory) ? raw.replayHistory : [];
  return { time, stars, replayHistory };
}

function normalizeSpeedRecord(raw: any): { time: number; submissions: number; replayHistory: any[] } | null {
  if (!isPlainObject(raw)) return null;
  const time = Math.max(0, toInt(raw.time));
  const submissions = Math.max(1, toInt(raw.submissions, 1));
  const replayHistory = Array.isArray(raw.replayHistory) ? raw.replayHistory : [];
  return { time, submissions, replayHistory };
}

function normalizeRecordMap(raw: any, mode: 'classic' | 'speed'): GenericRecordMap {
  if (!isPlainObject(raw)) return {};
  const out: GenericRecordMap = {};
  for (const [levelId, rec] of Object.entries(raw)) {
    const normalized = mode === 'classic' ? normalizeClassicRecord(rec) : normalizeSpeedRecord(rec);
    if (normalized) out[levelId] = normalized;
  }
  return out;
}

function pickBetterClassic(a: any, b: any): any {
  const ra = normalizeClassicRecord(a);
  const rb = normalizeClassicRecord(b);
  if (!ra) return rb;
  if (!rb) return ra;
  if (ra.stars !== rb.stars) return ra.stars > rb.stars ? ra : rb;
  return ra.time <= rb.time ? ra : rb;
}

function pickBetterSpeed(a: any, b: any): any {
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
    out[levelId] =
      mode === 'classic' ? pickBetterClassic(localRec, out[levelId]) : pickBetterSpeed(localRec, out[levelId]);
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

function applyRemoteSettingsIfMissing(remote: any): void {
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

function getLocalSavePayload(saveKey: string): any | null {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function aliasKeyOf(alias: string): string {
  return normalizeAlias(alias).trim().toLowerCase();
}

async function upsertAliasIndex(playerId: string, alias: string): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  const aliasKey = aliasKeyOf(alias);
  if (!aliasKey) return;
  try {
    await gs.db.collection(ALIAS_INDEX_COLLECTION).doc(aliasKey).set(
      {
        aliasKey,
        aliasDisplay: alias,
        playerId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('upsert alias index failed:', e);
  }
}

async function findPlayerIdByAlias(alias: string): Promise<string | null> {
  if (!gs.firebaseReady || !gs.db) return null;
  const aliasKey = aliasKeyOf(alias);
  if (!aliasKey) return null;
  try {
    const doc = await gs.db.collection(ALIAS_INDEX_COLLECTION).doc(aliasKey).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    const playerId = typeof data.playerId === 'string' ? data.playerId : null;
    return playerId;
  } catch (e) {
    console.warn('find playerId by alias failed:', e);
    return null;
  }
}

function isProfileSyncKey(key: string): boolean {
  return PROFILE_SYNC_KEYS.has(key);
}

// ── Init ────────────────────────────────────────────────────────────

export function initFirebase(): void {
  try {
    if (!(window as any).firebase || !(window as any).SUDOKU_FIREBASE_CONFIG) return;
    if (!firebase.apps.length) firebase.initializeApp((window as any).SUDOKU_FIREBASE_CONFIG);
    gs.db = firebase.firestore();
    gs.firebaseReady = true;
  } catch (e) {
    console.warn('Firebase init failed:', e);
  }
}

// ── Player identity ─────────────────────────────────────────────────

export function getPlayerIdentity(): { playerId: string; alias: string } {
  let playerId = localStorage.getItem(SK.PLAYER_ID);
  if (!playerId) {
    playerId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SK.PLAYER_ID, playerId);
  }
  let alias = localStorage.getItem(SK.PLAYER_ALIAS);
  if (!alias) {
    alias = `玩家${Math.floor(Math.random() * 9000) + 1000}`;
    localStorage.setItem(SK.PLAYER_ALIAS, alias);
  }
  alias = normalizeAlias(alias);
  if (alias.length < ALIAS_MIN_LEN) alias = `玩家${Math.floor(Math.random() * 9000) + 1000}`;
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
    showFeedback('暱稱至少 1 個字');
    return;
  }
  localStorage.setItem(SK.PLAYER_ALIAS, alias);
  if (gs.aliasInputEl) gs.aliasInputEl.value = alias;
  showFeedback(`暱稱已更新：${alias}`);
  const { playerId } = getPlayerIdentity();
  void upsertAliasIndex(playerId, alias);
  // Always re-hydrate on alias change — the new alias may map to a different playerId with existing records
  hydrateComplete = false;
  void hydratePlayerProfileFromCloud().then(() => {
    scheduleProgressSync();
  });
}

export async function mergeCloudAchievements(localAchievements: AchievementMap): Promise<AchievementMap | null> {
  if (!gs.firebaseReady || !gs.db) return null;
  const { playerId, alias } = getPlayerIdentity();
  const docRef = gs.db.collection('player_profiles').doc(playerId);

  try {
    const doc = await docRef.get();
    const remoteAchievements = sanitizeAchievementMap(doc.exists ? doc.data()?.achievements : null);
    const merged = mergeAchievementMaps(localAchievements, remoteAchievements);
    if (!sameAchievementMaps(merged, remoteAchievements)) {
      await docRef.set(
        {
          playerId,
          alias,
          achievements: merged,
          achievementsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
  const sanitized = sanitizeAchievementMap(achievements);
  const docRef = gs.db.collection('player_profiles').doc(playerId);
  try {
    await docRef.set(
      {
        playerId,
        alias,
        achievements: sanitized,
        achievementsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('sync achievements failed:', e);
  }
}

export async function syncPlayerProgressToCloud(): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  // Block sync until hydrate finishes, to prevent overwriting cloud data with empty localStorage
  if (!hydrateComplete) return;
  const { playerId, alias } = getPlayerIdentity();
  const records = normalizeRecordMap(readJson<Record<string, any>>(SK.RECORDS, {}), 'classic');
  const speedRecords = normalizeRecordMap(readJson<Record<string, any>>(SK.SPEED_RECORDS, {}), 'speed');
  const achievements = sanitizeAchievementMap(readJson<AchievementMap>(SK.ACHIEVEMENTS, {}));
  const settings = readLocalSettings();
  try {
    await gs.db.collection('player_profiles').doc(playerId).set(
      {
        playerId,
        alias,
        records,
        speedRecords,
        achievements,
        settings,
        progressUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await upsertAliasIndex(playerId, alias);
  } catch (e) {
    console.warn('sync player progress failed:', e);
  }
}

export function scheduleProgressSync(delayMs = PROGRESS_SYNC_DEBOUNCE_MS): void {
  if (!gs.firebaseReady || !gs.db) return;
  if (progressSyncTimer) clearTimeout(progressSyncTimer);
  progressSyncTimer = setTimeout(() => {
    progressSyncTimer = null;
    void syncPlayerProgressToCloud();
  }, delayMs);
}

export function installPlayerCloudSyncBridge(): void {
  if (bridgeInstalled) return;
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

  bridgeInstalled = true;
}

export async function syncSaveToCloud(saveKey: string, payload: any): Promise<void> {
  if (!gs.firebaseReady || !gs.db) return;
  if (!SAVE_KEY_PATTERN.test(saveKey) || !isPlainObject(payload)) return;
  const { playerId, alias } = getPlayerIdentity();
  try {
    await gs.db.collection('player_profiles').doc(playerId).collection(PROFILE_SAVE_SUBCOLLECTION).doc(saveKey).set(
      {
        key: saveKey,
        playerId,
        alias,
        payload,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('sync save failed:', e);
  }
}

export function scheduleSaveSync(saveKey: string, payload: any, delayMs = SAVE_SYNC_DEBOUNCE_MS): void {
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
  const identity = getPlayerIdentity();
  let playerId = identity.playerId;
  const alias = identity.alias;
  let docRef = gs.db.collection('player_profiles').doc(playerId);
  try {
    let doc = await docRef.get();
    if (!doc.exists) {
      const mappedPlayerId = await findPlayerIdByAlias(alias);
      if (mappedPlayerId && mappedPlayerId !== playerId) {
        const mappedRef = gs.db.collection('player_profiles').doc(mappedPlayerId);
        const mappedDoc = await mappedRef.get();
        if (mappedDoc.exists) {
          playerId = mappedPlayerId;
          docRef = mappedRef;
          doc = mappedDoc;
          localStorage.setItem(SK.PLAYER_ID, mappedPlayerId);
          localStorage.setItem(SK.PLAYER_ALIAS, alias);
          if (gs.aliasInputEl) gs.aliasInputEl.value = alias;
          showFeedback(`已依暱稱「${alias}」恢復雲端進度`);
        }
      }
    }
    if (!doc.exists) {
      scheduleProgressSync(50);
      return;
    }
    const data = doc.data() || {};

    const localRecords = normalizeRecordMap(readJson<Record<string, any>>(SK.RECORDS, {}), 'classic');
    const remoteRecords = normalizeRecordMap(data.records, 'classic');
    const mergedRecords = mergeRecordMaps(localRecords, remoteRecords, 'classic');
    if (JSON.stringify(localRecords) !== JSON.stringify(mergedRecords)) writeJson(SK.RECORDS, mergedRecords);

    const localSpeedRecords = normalizeRecordMap(readJson<Record<string, any>>(SK.SPEED_RECORDS, {}), 'speed');
    const remoteSpeedRecords = normalizeRecordMap(data.speedRecords, 'speed');
    const mergedSpeedRecords = mergeRecordMaps(localSpeedRecords, remoteSpeedRecords, 'speed');
    if (JSON.stringify(localSpeedRecords) !== JSON.stringify(mergedSpeedRecords))
      writeJson(SK.SPEED_RECORDS, mergedSpeedRecords);

    const localAchievements = sanitizeAchievementMap(readJson<AchievementMap>(SK.ACHIEVEMENTS, {}));
    const remoteAchievements = sanitizeAchievementMap(data.achievements);
    const mergedAchievements = mergeAchievementMaps(localAchievements, remoteAchievements);
    if (!sameAchievementMaps(localAchievements, mergedAchievements)) writeJson(SK.ACHIEVEMENTS, mergedAchievements);

    applyRemoteSettingsIfMissing(data.settings);

    const saveSnap = await docRef.collection(PROFILE_SAVE_SUBCOLLECTION).get();
    saveSnap.docs.forEach((saveDoc: any) => {
      const saveData = saveDoc.data() || {};
      const key = typeof saveData.key === 'string' ? saveData.key : saveDoc.id;
      if (!SAVE_KEY_PATTERN.test(key) || !isPlainObject(saveData.payload)) return;
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(saveData.payload));
      }
    });

    scheduleProgressSync(80);
    await upsertAliasIndex(playerId, alias);
    for (const key of Object.keys(localStorage)) {
      if (!SAVE_KEY_PATTERN.test(key)) continue;
      const payload = getLocalSavePayload(key);
      if (payload) scheduleSaveSync(key, payload, 120);
    }
  } catch (e) {
    console.warn('hydrate player profile failed:', e);
  } finally {
    hydrateComplete = true;
  }
}

// ── Leaderboard ─────────────────────────────────────────────────────

export function renderLeaderboard(el: HTMLElement | null, rows: any[]): void {
  if (!el) return;
  if (!gs.firebaseReady) {
    el.textContent = '尚未啟用 Firebase 排行。';
    return;
  }
  if (!rows.length) {
    el.textContent = '尚無玩家首通紀錄';
    return;
  }
  el.innerHTML = rows
    .map((r, i) => `${i + 1}. ${r.alias}  ${formatSeconds(r.firstTimeSec)}  ${'★'.repeat(r.firstStars)}`)
    .join('<br>');
}

export async function loadLevelLeaderboard(levelId: number): Promise<void> {
  if (!gs.firebaseReady) {
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(gs.winLeaderboardListEl, []);
    return;
  }
  try {
    const snap = await gs.db
      .collection('level_first_clears')
      .doc(String(levelId))
      .collection('players')
      .orderBy('firstTimeSec', 'asc')
      .limit(3)
      .get();
    const rows = snap.docs.map((d: any) => d.data());
    renderLeaderboard(gs.leaderboardListEl, rows);
    renderLeaderboard(gs.winLeaderboardListEl, rows);
  } catch (e) {
    console.warn('load leaderboard failed:', e);
    renderLeaderboard(gs.leaderboardListEl, []);
    renderLeaderboard(gs.winLeaderboardListEl, []);
  }
}

export async function loadPreLevelLeaderboard(levelId: number): Promise<void> {
  if (!gs.firebaseReady) {
    if (gs.preLevelLeaderboardEl) gs.preLevelLeaderboardEl.textContent = '尚未啟用 Firebase 排行。';
    return;
  }
  try {
    const snap = await gs.db
      .collection('level_first_clears')
      .doc(String(levelId))
      .collection('players')
      .orderBy('firstTimeSec', 'asc')
      .limit(3)
      .get();
    const rows = snap.docs.map((d: any) => d.data());
    if (!gs.preLevelLeaderboardEl) return;
    if (!rows.length) {
      gs.preLevelLeaderboardEl.textContent = '尚無玩家首通紀錄';
      return;
    }
    gs.preLevelLeaderboardEl.innerHTML = rows
      .map((r: any, i: number) => {
        const timeStr = formatSeconds(r.firstTimeSec);
        if (gs.isSpeedrunMode) return `${i + 1}. ${r.alias}  ${timeStr} (經典)`;
        return `${i + 1}. ${r.alias}  ${timeStr}  ${'★'.repeat(r.firstStars)}`;
      })
      .join('<br>');
  } catch (e) {
    console.warn('load pre-level leaderboard failed:', e);
    if (gs.preLevelLeaderboardEl) gs.preLevelLeaderboardEl.textContent = '載入失敗';
  }
}

export async function submitFirstClear(levelId: number, clearSec: number, clearStars: number): Promise<void> {
  if (!gs.firebaseReady) return;
  const { playerId, alias } = getPlayerIdentity();
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
  const docRef = gs.db.collection('level_first_clears').doc(String(levelId)).collection('players').doc(playerId);
  try {
    await gs.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(docRef);
      if (doc.exists) return;
      tx.set(docRef, {
        playerId,
        alias,
        firstTimeSec: clearSec,
        firstStars: clearStars,
        levelVersion,
        levelSnapshot,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    console.warn('submit first clear failed:', e);
  }
}
