// Level selection screen, stage map, progression

import { gs, type LevelData, type ActionRecord } from '../game/state';
import { getAllLevels, hasTeachModule } from '../data/dataRegistry';
import { SK, readJson } from '../storage/keys';
import { escapeHtml } from '../shared/html/escape';
import { formatSeconds } from '../game/utils';
import { getRecordsStorageKeyForLevelList, getSaveKeyForCurrentMode } from '../game/modePolicy';
import { showFeedback } from '../ui/feedback';
import { loadPreLevelLeaderboard } from '../firebase/client';
import { syncLevelCardSize } from '../game/board';
import { TECH_MAP, shouldShowTeach, closeLibraryOverlay } from './teach-legacy';
import { closeWildLobby, openWildLobby } from './wild/wildLobby';
import { closeDuoLobby } from './duo/duoLobby';
import { closePracticeLobby, enterPracticeTechnique } from './practice/practiceLobby';
import { t } from '../i18n/t';
import { toClassicLevelRecord, toSpeedLevelRecord, getReplayHistory } from '../shared/records/levelRecords';
import { requestRefresh } from '../app/ui/refreshBus';
import { openPreLevel, closePreLevel } from '../app/ui/uiOrchestrator';
import type { SudokuWindow } from '../facade/windowTypes';

// Re-export tier system symbols so existing imports from './levels' keep working
export {
  REALM_ORDER,
  getDifficultyTiers,
  getTierRepresentativeStar,
  getRealmUnlockState,
  getTierUnlockMessage,
  canAccessLevel,
  getFilteredLevels,
} from './tierSystem';

import {
  getDifficultyTiers,
  getTierRepresentativeStar,
  getRealmUnlockState,
  getTierUnlockMessage,
  canAccessLevel,
  getFilteredLevels,
} from './tierSystem';

// Route through window so the React bridge can intercept
function showTeachModal(stars: number, source = 'tier') {
  const wShow = (window as SudokuWindow).showTeachModal;
  if (wShow) wShow(stars, source);
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildVisibleTierMap(levels: LevelData[]): Map<string, LevelData[]> {
  const map = new Map<string, LevelData[]>();
  for (const level of levels) {
    if (level.hidden) continue;
    const list = map.get(level.difficultyName);
    if (list) list.push(level);
    else map.set(level.difficultyName, [level]);
  }
  return map;
}

/** Check if there is an active save for a level (without importing core). */
function hasActiveSave(levelId: number): boolean {
  const saveKey = getSaveKeyForCurrentMode(levelId);
  return localStorage.getItem(saveKey) !== null;
}

/** Show or hide the "Resume Game" banner at the top of the level screen. */
export function updateResumeBanner(): void {
  const banner = document.getElementById('resume-banner');
  if (!banner) return;

  const level = gs.currentLevel;
  const hasGame = level && level.id > 0 && hasActiveSave(level.id);

  if (!hasGame) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  banner.textContent = t('nav.resumeGameWithLevel', { level: level!.displayName });
  banner.onclick = () => {
    // Resume: fade level screen out, show game board, restart timer
    const lsResume = document.getElementById('level-screen')!;
    lsResume.classList.add('screen-exit');
    setTimeout(() => {
      lsResume.style.display = 'none';
      lsResume.classList.remove('screen-exit');
      const gc = document.querySelector('.game-container') as HTMLElement;
      gc.style.display = 'flex';
      gc.classList.remove('screen-enter');
      void gc.offsetWidth;
      gc.classList.add('screen-enter');
    }, 130);
    import('../game/timer').then((m) => m.startTimer(false)).catch(() => {});
  };
}

// ── Stage map ───────────────────────────────────────────────────────

export function renderStageMap(): void {
  const map = document.getElementById('stage-map');
  if (!map) return;

  // React takeover path: keep legacy callers, but let React own rendering.
  if (document.body?.dataset.reactNormalStageMap === '1') {
    window.dispatchEvent(new Event('normal-stage-map-refresh'));
    return;
  }

  const levels = getAllLevels();
  const tierMap = buildVisibleTierMap(levels);
  const recordsKey = getRecordsStorageKeyForLevelList(false);
  const records = readJson<Record<string, unknown>>(recordsKey, {});
  const tiers = getDifficultyTiers();
  const unlockState = getRealmUnlockState();
  map.innerHTML = '';

  tiers.forEach((tierName) => {
    const tierLevels = tierMap.get(tierName) || [];
    const total = tierLevels.length;
    const cleared = tierLevels.filter((l) => records[l.id]).length;
    const pct = total > 0 ? (cleared / total) * 100 : 0;
    const isCleared = cleared === total && total > 0;
    const isPartial = cleared > 0 && !isCleared;
    const isLocked = !unlockState.unlockedTiers.has(tierName);
    const lockHint = getTierUnlockMessage(tierName, unlockState);

    const node = document.createElement('div');
    node.className =
      'stage-node' + (isCleared ? ' cleared' : '') + (isPartial ? ' partial' : '') + (isLocked ? ' locked' : '');
    node.onclick = () => {
      if (isLocked) {
        showFeedback(lockHint, 'error');
        return;
      }
      enterTier(tierName);
    };
    node.innerHTML = `
      <div class="stage-dot">${isLocked ? '🔒' : isCleared ? '✓' : ''}</div>
      <div class="stage-info">
        <div class="stage-name">${escapeHtml(tierName)}</div>
        <div class="stage-progress">${isLocked ? escapeHtml(lockHint) : cleared === 0 ? t('stage.notChallenged') : isCleared ? t('stage.unlocked') : t('stage.inProgress')}</div>
      </div>
      <div class="stage-bar-wrap"><div class="stage-bar-fill" style="width:${pct}%"></div></div>
      <div class="stage-count">${cleared}/${total}</div>
    `;
    map.appendChild(node);
  });
}

// ── View scroll position memory ──────────────────────────────────────
import { saveScroll, restoreScroll } from '../shared/ui/scrollMemory';
export { saveScroll, restoreScroll };

// ── Tier view ───────────────────────────────────────────────────────

export function enterTier(tierName: string): void {
  closeLibraryOverlay();
  const unlockState = getRealmUnlockState();
  if (!unlockState.unlockedTiers.has(tierName)) {
    showFeedback(getTierUnlockMessage(tierName, unlockState), 'error');
    return;
  }
  gs.currentTab = tierName;
  saveScroll('stage-map');
  document.getElementById('stage-view')!.style.display = 'none';
  document.getElementById('tier-view')!.classList.remove('hidden');

  const recordsKey = getRecordsStorageKeyForLevelList(false);
  const records = readJson<Record<string, unknown>>(recordsKey, {});
  const levels = getAllLevels();
  const tierMap = buildVisibleTierMap(levels);
  const tierLevels = tierMap.get(tierName) || [];
  const cleared = tierLevels.filter((l) => records[l.id]).length;

  document.getElementById('tier-title')!.textContent = tierName;
  document.getElementById('tier-progress-text')!.textContent = `${cleared}/${tierLevels.length}`;

  const bookBtn = document.getElementById('tier-teach-btn');
  const representativeStar = getTierRepresentativeStar(tierName);
  if (representativeStar !== null && hasTeachModule(representativeStar)) {
    bookBtn!.style.display = '';
    bookBtn!.onclick = () => showTeachModal(representativeStar);
  } else {
    bookBtn!.style.display = 'none';
  }

  renderLevelGrid();

  if (representativeStar !== null && representativeStar >= 3 && shouldShowTeach(representativeStar)) {
    setTimeout(() => showTeachModal(representativeStar), 350);
  }
}

export function backToStageMap(): void {
  saveScroll('level-list');
  document.getElementById('tier-view')!.classList.add('hidden');
  document.getElementById('stage-view')!.style.display = 'flex';
  renderStageMap();
  restoreScroll('stage-map');
}

// ── Level grid ──────────────────────────────────────────────────────

export function renderLevelGrid(): void {
  if (document.body?.dataset.reactNormalLevelList === '1') {
    requestRefresh('normal-level-list');
    return;
  }

  const recordsKey = getRecordsStorageKeyForLevelList(false);
  const records = readJson<Record<string, unknown>>(recordsKey, {});
  const list = document.getElementById('level-list');
  if (!list) return;
  const unlockState = getRealmUnlockState();
  list.innerHTML = '';

  const filtered = getFilteredLevels();
  filtered.forEach((l) => {
    const record = records[l.id];
    const classicRecord = toClassicLevelRecord(record);
    const speedRecord = toSpeedLevelRecord(record);
    const isLocked = !canAccessLevel(l, unlockState);
    let bestTime: number | null = null;
    let bestStars = 0;
    let submissions = 0;

    if (record) {
      if (gs.isSpeedrunMode) {
        if (speedRecord) {
          bestTime = speedRecord.time;
          submissions = speedRecord.submissions;
        }
      } else if (classicRecord) {
        bestTime = classicRecord.time;
        bestStars = classicRecord.stars;
      }
    }

    const isCurrent = gs.currentLevel?.id === l.id && hasActiveSave(l.id);
    const item = document.createElement('div');
    item.className = `level-item ${bestTime !== null ? 'completed' : ''}${isLocked ? ' locked' : ''}${isCurrent ? ' level-item--current' : ''}`;
    item.onclick = () => {
      if (isLocked) {
        showFeedback(getTierUnlockMessage(l.difficultyName, unlockState), 'error');
        return;
      }
      showPreLevelModal(l.id);
    };

    const hasRecord = bestTime !== null;
    const timeStr = hasRecord
      ? `${Math.floor(bestTime! / 60)}:${(bestTime! % 60).toString().padStart(2, '0')}`
      : '--:--';
    const statsClass = hasRecord ? 'level-stats' : 'level-stats is-empty';

    let starsClass: string, starsText: string;
    if (gs.isSpeedrunMode) {
      starsClass = hasRecord ? 'level-stars speedrun-stars' : 'level-stars is-empty';
      starsText = hasRecord ? t('levelGrid.speedrunSubmissions', { submissions: String(submissions) }) : t('levelGrid.speedrunNotCleared');
    } else {
      starsClass = bestStars > 0 ? 'level-stars' : 'level-stars is-empty';
      starsText =
        bestStars > 0
          ? '★'.repeat(bestStars) + '<span class="empty-star">' + '☆'.repeat(3 - bestStars) + '</span>'
          : '☆☆☆';
    }

    if (isLocked) {
      item.innerHTML = `
        <div class="level-num">${escapeHtml(l.displayName)}</div>
        <div class="level-lock">${t('stage.locked')}</div>
        <div class="level-lock-hint">${t('stage.lockHint')}</div>
      `;
    } else {
      item.innerHTML = `
        ${isCurrent ? `<div class="level-current-badge">${t('stage.inProgress')}</div>` : ''}
        <div class="level-num">${escapeHtml(l.displayName)}</div>
        <div class="${starsClass}">${starsText}</div>
        <div class="${statsClass}">${timeStr}</div>
      `;
    }
    list.appendChild(item);
  });
  requestAnimationFrame(syncLevelCardSize);
}

// ── Pre-level modal ─────────────────────────────────────────────────

let _pendingLevelData: LevelData | null = null;

export function showPreLevelModal(
  levelId: number,
  ignoreTierLock = false,
  externalLevel?: LevelData,
): void {
  closeLibraryOverlay();
  gs.pendingLevelId = levelId;
  const levels = getAllLevels();
  const level = externalLevel || levels.find((l) => l.id === levelId);
  if (!level) return;
  _pendingLevelData = externalLevel || null;
  if (!ignoreTierLock && !canAccessLevel(level)) {
    showFeedback(getTierUnlockMessage(level.difficultyName), 'error');
    return;
  }

  const techName = TECH_MAP[level.maxTechnique || ''] || level.maxTechnique || '-';
  const techTier = level.techTier || '';
  const isPractice = level.mode === 'practice';
  const recKey = getRecordsStorageKeyForLevelList(isPractice);
  const records = readJson<Record<string, unknown>>(recKey, {});
  const record = records[levelId];
  const classicRecord = toClassicLevelRecord(record);
  const speedRecord = toSpeedLevelRecord(record);

  let bestRecord = t('prelevel.noRecord');
  let hasRecord = false;
  let hasReplay = false;

  if (record) {
    hasRecord = true;
    if (gs.isSpeedrunMode) {
      if (speedRecord) {
        bestRecord = t('prelevel.bestRecordSpeed', { time: formatSeconds(speedRecord.time), submissions: String(speedRecord.submissions) });
      }
    } else {
      const stars = classicRecord?.stars ?? 1;
      const time = classicRecord?.time ?? 0;
      bestRecord = t('prelevel.bestRecord', { time: formatSeconds(time), stars: '★'.repeat(stars) });
    }
    hasReplay = getReplayHistory(record).length > 0;
  }

  openPreLevel({
    levelId,
    displayName: level.displayName,
    techName,
    techTier,
    bestRecord,
    hasRecord,
    hasReplay,
    isPractice,
    isSpeedrun: gs.isSpeedrunMode,
  });

  loadPreLevelLeaderboard(levelId);
}

export function hidePreLevelModal(): void {
  closePreLevel('legacy-hide');
  gs.pendingLevelId = null;
  _pendingLevelData = null;
}

export async function startLevelFromModal(
  forceReset = false,
  playWithGhost = false,
  ghostData: ActionRecord[] | null = null,
): Promise<void> {
  if (gs.pendingLevelId === null) return;
  const levelId = gs.pendingLevelId;
  const overrideData = _pendingLevelData;
  _pendingLevelData = null;
  closeLibraryOverlay();
  hidePreLevelModal();

  // Fade level screen out before switching to game
  const ls = document.getElementById('level-screen')!;
  ls.classList.add('screen-exit');
  await new Promise<void>((r) => setTimeout(r, 130));
  ls.style.display = 'none';
  ls.classList.remove('screen-exit');

  const { initGame } = await import('../game/core');
  initGame(levelId, forceReset, playWithGhost, ghostData, overrideData || undefined);
}

// ── Navigation ──────────────────────────────────────────────────────

export type LevelScreenReturnTarget = 'world' | 'practice' | 'tier' | 'stage';

let _forcedLevelScreenReturnTarget: LevelScreenReturnTarget | null = null;

export function setNextLevelScreenReturnTarget(target: LevelScreenReturnTarget | null): void {
  _forcedLevelScreenReturnTarget = target;
}

function consumeLevelScreenReturnTarget(): LevelScreenReturnTarget | null {
  const target = _forcedLevelScreenReturnTarget;
  _forcedLevelScreenReturnTarget = null;
  return target;
}

export function resolveLevelScreenReturnTarget(
  returnToTier: boolean,
  context: { practiceReturnTech: string | null; currentTab: string | null; isWildContext: boolean },
): LevelScreenReturnTarget {
  if (context.isWildContext) return 'world';
  if (returnToTier && context.practiceReturnTech) return 'practice';
  if (returnToTier && context.currentTab !== null) return 'tier';
  return 'stage';
}

let _showLevelScreenActive = false;
export function showLevelScreen(returnToTier = false): void {
  if (_showLevelScreenActive) {
    console.warn('[showLevelScreen] re-entrant call blocked');
    return;
  }
  _showLevelScreenActive = true;
  try {
    _showLevelScreenInner(returnToTier);
  } finally {
    _showLevelScreenActive = false;
  }
}

function _showLevelScreenInner(returnToTier: boolean): void {
  const wasWildContext = gs.currentLevel?.source === 'wild' || gs.wildChallengeMode !== null;
  const practiceReturnTech = gs.practiceActiveTech;
  const currentTab = gs.currentTab;
  const forcedTarget = consumeLevelScreenReturnTarget();

  // Save progress before leaving game screen
  if (gs.currentLevel && (document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') {
    import('../game/core').then((m) => m.saveGameStatus()).catch(() => {});
  }
  closeLibraryOverlay();
  updateSpeedrunToggleUI();
  updateResumeBanner();
  const lsShow = document.getElementById('level-screen')!;
  lsShow.style.display = 'flex';
  lsShow.classList.remove('screen-enter');
  void lsShow.offsetWidth;
  lsShow.classList.add('screen-enter');
  (document.querySelector('.game-container') as HTMLElement).style.display = 'none';
  if (gs.timerInterval) clearInterval(gs.timerInterval);
  import('./replay').then((m) => m.closeReplayModal()).catch(() => {});
  import('../react/win/winBridge').then(({ bridgeCloseWin }) => bridgeCloseWin()).catch(() => {});
  import('../react/gameover/gameOverBridge').then(({ bridgeCloseGameOver }) => bridgeCloseGameOver()).catch(() => {});
  import('../react/stats/statsStore').then(({ useStatsStore }) => useStatsStore.getState().close()).catch(() => {});
  import('../react/mentor/mentorBridge').then(({ bridgeDismissMentor }) => bridgeDismissMentor()).catch(() => {});
  // Only dismiss the duo result UI — do NOT call closeDuoResult() as it
  // calls showLevelScreen() back, creating an infinite loop.
  import('../react/duoresult/duoResultBridge').then(({ bridgeCloseDuoResult }) => bridgeCloseDuoResult()).catch(() => {});
  hidePreLevelModal();
  closeWildLobby();
  closeDuoLobby();
  closePracticeLobby();
  if (gs.isDuoMode) {
    import('./duo/duoGame').then((m) => m.resetDuoState()).catch(() => {});
  }

  const target = forcedTarget ?? resolveLevelScreenReturnTarget(returnToTier, {
    practiceReturnTech,
    currentTab,
    isWildContext: wasWildContext,
  });
  if (target === 'world') {
    openWildLobby();
  } else if (target === 'practice') {
    enterPracticeTechnique(practiceReturnTech!);
  } else if (target === 'tier' && currentTab !== null) {
    enterTier(currentTab);
  } else {
    document.getElementById('tier-view')!.classList.add('hidden');
    document.getElementById('stage-view')!.style.display = 'flex';
    renderStageMap();
  }
  // Duo glow listener removed — duo is now fully independent
}

export function toggleSpeedrunMode(): void {
  gs.isSpeedrunMode = !gs.isSpeedrunMode;
  localStorage.setItem(SK.SPEEDRUN, String(gs.isSpeedrunMode));
  updateSpeedrunToggleUI();
  renderLevelGrid();
  if (gs.isSpeedrunMode) showFeedback(t('feedback.speedrunToggle'), 'success');
}

export function updateSpeedrunToggleUI(): void {
  const btn = document.getElementById('speedrun-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', gs.isSpeedrunMode);
}

// ── Advance to next level in current tier ────────────────────────────

export function advanceToNextLevel(): void {
  if (!gs.currentLevel || !gs.currentTab) {
    showLevelScreen(true);
    return;
  }
  const levels = getAllLevels();
  const tierMap = buildVisibleTierMap(levels);
  const tierLevels = gs.currentTab ? (tierMap.get(gs.currentTab) || []) : [];
  const currentIdx = tierLevels.findIndex(l => l.id === gs.currentLevel!.id);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= tierLevels.length) {
    showFeedback(t('win.tierAllCleared'), 'success');
    showLevelScreen(true);
    return;
  }

  // Close React win, show level screen, open pre-level modal for next level
  import('../react/win/winBridge').then(({ bridgeCloseWin }) => bridgeCloseWin()).catch(() => {});
  const lsNext = document.getElementById('level-screen')!;
  lsNext.style.display = 'flex';
  lsNext.classList.remove('screen-enter');
  void lsNext.offsetWidth;
  lsNext.classList.add('screen-enter');
  (document.querySelector('.game-container') as HTMLElement).style.display = 'none';
  showPreLevelModal(tierLevels[nextIdx].id);
}

// ── Random / Pool (Wild mode) ────────────────────────────────────────

let _worldLaunchInFlight = false;

export async function startPoolRandom(): Promise<void> {
  if (_worldLaunchInFlight) return;
  _worldLaunchInFlight = true;
  import('../react/wild/wildLobbyBridge').then(({ bridgeSetWildLobbyLoading }) => bridgeSetWildLobbyLoading(true)).catch(() => {});

  const enterBtn = document.getElementById('wild-enter-btn') as HTMLButtonElement | null;
  if (enterBtn) {
    enterBtn.classList.add('is-loading');
    enterBtn.setAttribute('aria-busy', 'true');
    enterBtn.disabled = true;
  }

  try {
    showFeedback(t('misc.worldLoadingFeedback'), 'success');
    const { startWorldSession, continueWild, getWildProfile, resumeWildEncounter } = await import('./wild/wildController');
    const { loadWildSave } = await import('./wild/wildState');

    // Check for saved encounter first (pause/resume)
    const savedEncounter = loadWildSave();
    if (savedEncounter) {
      await resumeWildEncounter();
      return;
    }

    const session = getWildProfile().currentSession;
    if (session && session.round > 0 && session.round < 10) {
      await continueWild();
      return;
    }
    await startWorldSession();
  } catch (e) {
    console.error('[World] start failed:', e);
    showFeedback(t('wild.worldLoadError'), 'error');
  } finally {
    _worldLaunchInFlight = false;
    import('../react/wild/wildLobbyBridge').then(({ bridgeSetWildLobbyLoading }) => bridgeSetWildLobbyLoading(false)).catch(() => {});
    if (enterBtn) {
      enterBtn.classList.remove('is-loading');
      enterBtn.removeAttribute('aria-busy');
      enterBtn.disabled = false;
    }
  }
}
