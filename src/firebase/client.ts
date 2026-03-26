// Firebase initialisation, leaderboard, and player identity

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds, normalizeAlias, ALIAS_MIN_LEN } from '../game/utils';
import { showFeedback } from '../ui/feedback';
import { getAllLevels } from '../data/dataRegistry';

declare const firebase: any;

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
}

// ── Leaderboard ─────────────────────────────────────────────────────

export function renderLeaderboard(el: HTMLElement | null, rows: any[]): void {
  if (!el) return;
  if (!gs.firebaseReady) { el.textContent = '尚未啟用 Firebase 排行。'; return; }
  if (!rows.length) { el.textContent = '尚無玩家首通紀錄'; return; }
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
    const snap = await gs.db.collection('level_first_clears').doc(String(levelId)).collection('players')
      .orderBy('firstTimeSec', 'asc').limit(3).get();
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
    const snap = await gs.db.collection('level_first_clears').doc(String(levelId)).collection('players')
      .orderBy('firstTimeSec', 'asc').limit(3).get();
    const rows = snap.docs.map((d: any) => d.data());
    if (!gs.preLevelLeaderboardEl) return;
    if (!rows.length) { gs.preLevelLeaderboardEl.textContent = '尚無玩家首通紀錄'; return; }
    gs.preLevelLeaderboardEl.innerHTML = rows.map((r: any, i: number) => {
      const timeStr = formatSeconds(r.firstTimeSec);
      if (gs.isSpeedrunMode) return `${i + 1}. ${r.alias}  ${timeStr} (經典)`;
      return `${i + 1}. ${r.alias}  ${timeStr}  ${'★'.repeat(r.firstStars)}`;
    }).join('<br>');
  } catch (e) {
    console.warn('load pre-level leaderboard failed:', e);
    if (gs.preLevelLeaderboardEl) gs.preLevelLeaderboardEl.textContent = '載入失敗';
  }
}

export async function submitFirstClear(levelId: number, clearSec: number, clearStars: number): Promise<void> {
  if (!gs.firebaseReady) return;
  const { playerId, alias } = getPlayerIdentity();
  const levels = getAllLevels();
  const level = levels.find(l => l.id === levelId) || gs.currentLevel || null;
  const levelVersion = gs.appVersion || 'legacy-unknown';
  const levelSnapshot = level
    ? {
        schemaVersion: 1,
        levelId: level.id, stars: level.stars, difficultyName: level.difficultyName,
        displayName: level.displayName, maxTechnique: level.maxTechnique || null,
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
        playerId, alias, firstTimeSec: clearSec, firstStars: clearStars,
        levelVersion, levelSnapshot,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    console.warn('submit first clear failed:', e);
  }
}
