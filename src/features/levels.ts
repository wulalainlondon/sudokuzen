// Level selection screen, tier/realm system, stage map, progression

import { gs } from '../game/state';
import { getAllLevels, hasTeachModule } from '../data/dataRegistry';
import { SK, readJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { showFeedback } from '../ui/feedback';
import { loadPreLevelLeaderboard } from '../firebase/client';
import { syncLevelCardSize } from '../game/board';
import { TECH_MAP, shouldShowTeach, closeLibraryOverlay } from './teach-legacy';
import { closeWildLobby } from './wild/wildLobby';
import { closePracticeLobby, enterPracticeTechnique } from './practice/practiceLobby';

// Route through window so the React bridge can intercept
function showTeachModal(stars: number, source = 'tier') {
  const wShow = (window as any).showTeachModal;
  if (wShow) wShow(stars, source);
}
import { getPlayerIdentity } from '../firebase/client';

// Lazy imports to break circular: levels ↔ duo ↔ core
async function callEnterDuoRoom(levelId: number) {
  const m = await import('./duo');
  m.enterDuoRoom(levelId);
}
async function callLeaveDuoRoom() {
  const m = await import('./duo');
  m.leaveDuoRoom();
}
function callResetDuoState() {
  import('./duo').then((m) => m.resetDuoState());
}
function callStartDuoGlowListener() {
  import('./duo').then((m) => m.startDuoGlowListener());
}

// ── Constants ───────────────────────────────────────────────────────

const REALM_ORDER = [
  '初心',
  '鍛骨',
  '虛空',
  '本源',
  '寂滅',
  '無我',
  '破陣',
  '空鏡',
  '星潮',
  '玄鏈',
  '天望',
  '鋒刃',
  '化神',
  '返虛',
  '合道',
  '渡劫',
  '真仙',
  '二昇',
  '玄仙',
  '太乙',
  '大羅',
  '混元',
  '天尊',
  '三昇',
  '神王',
  '帝宙',
  '神人',
];

const REALM_TEACH_KEY: Record<string, number> = {
  初心: 1,
  鍛骨: 2,
  虛空: 3,
  無我: 4,
  破陣: 5,
  空鏡: 6,
  星潮: 7,
  玄鏈: 8,
  天望: 9,
  鋒刃: 10,
  化神: 11,
  返虛: 12,
  合道: 13,
  渡劫: 14,
  真仙: 15,
  二昇: 16,
  玄仙: 17,
  太乙: 18,
  大羅: 19,
  混元: 20,
  天尊: 21,
  三昇: 22,
  神王: 23,
  帝宙: 24,
  神人: 25,
};

// ── Tier helpers ────────────────────────────────────────────────────

export function getDifficultyTiers(): string[] {
  const levels = getAllLevels();
  const present = new Set(levels.filter((l) => !l.hidden).map((l) => l.difficultyName || '未命名境界'));
  const ordered = REALM_ORDER.filter((name) => present.has(name));
  const extras = [...present].filter((name) => !REALM_ORDER.includes(name));
  return ordered.concat(extras);
}

function getTierRepresentativeStar(tierName: string): number | null {
  if (Object.prototype.hasOwnProperty.call(REALM_TEACH_KEY, tierName)) return REALM_TEACH_KEY[tierName];
  const levels = getAllLevels();
  const lv = levels.find((l) => !l.hidden && l.difficultyName === tierName);
  return lv ? lv.stars : null;
}

export function getRealmUnlockState(): {
  tiers: string[];
  stats: { name: string; cleared: number; total: number; isCleared: boolean }[];
  unlockedTiers: Set<string>;
} {
  const levels = getAllLevels();
  const tiers = getDifficultyTiers();
  const records = readJson<Record<string, any>>(SK.RECORDS, {});
  const stats = tiers.map((name) => {
    const tierLevels = levels.filter((l) => l.difficultyName === name && !l.hidden);
    const cleared = tierLevels.filter((l) => records[l.id]).length;
    const total = tierLevels.length;
    const UNLOCK_THRESHOLD = 3;
    return { name, cleared, total, isCleared: total > 0 && cleared >= Math.min(UNLOCK_THRESHOLD, total) };
  });

  let highestConsecutiveCleared = -1;
  for (let i = 0; i < stats.length; i++) {
    if (stats[i].isCleared) highestConsecutiveCleared = i;
    else break;
  }
  const currentIndex = Math.min(highestConsecutiveCleared + 1, Math.max(0, stats.length - 1));
  const unlockedMaxIndex = Math.min(currentIndex + 1, Math.max(0, stats.length - 1));
  const unlockedTiers = new Set(stats.slice(0, unlockedMaxIndex + 1).map((s) => s.name));
  return { tiers, stats, unlockedTiers };
}

export function getTierUnlockMessage(tierName: string, unlockState?: ReturnType<typeof getRealmUnlockState>): string {
  const state = unlockState || getRealmUnlockState();
  if (state.unlockedTiers.has(tierName)) return '';
  const idx = state.tiers.indexOf(tierName);
  if (idx <= 0) return '境界尚未達成，暫時無法挑戰。';
  const prev = state.stats[idx - 1];
  const needed = Math.min(3, prev.total);
  return `需先全通「${prev.name}」(${prev.cleared}/${needed}) 才能挑戰後續境界`;
}

export function canAccessLevel(level: any, unlockState?: ReturnType<typeof getRealmUnlockState>): boolean {
  if (!level || level.hidden) return false;
  const state = unlockState || getRealmUnlockState();
  return state.unlockedTiers.has(level.difficultyName);
}

export function getFilteredLevels(): any[] {
  return getAllLevels().filter((l) => l.difficultyName === gs.currentTab);
}

// ── Stage map ───────────────────────────────────────────────────────

export function renderStageMap(): void {
  const map = document.getElementById('stage-map');
  if (!map) return;
  const levels = getAllLevels();
  const recordsKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recordsKey, {});
  const tiers = getDifficultyTiers();
  const unlockState = getRealmUnlockState();
  map.innerHTML = '';

  tiers.forEach((tierName) => {
    const tierLevels = levels.filter((l) => l.difficultyName === tierName && !l.hidden);
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
        <div class="stage-name">${tierName}</div>
        <div class="stage-progress">${isLocked ? lockHint : cleared === 0 ? '尚未挑戰' : isCleared ? '已解鎖' : '進行中'}</div>
      </div>
      <div class="stage-bar-wrap"><div class="stage-bar-fill" style="width:${pct}%"></div></div>
      <div class="stage-count">${cleared}/${total}</div>
    `;
    map.appendChild(node);
  });
}

// ── Tier view ───────────────────────────────────────────────────────

export function enterTier(tierName: string): void {
  closeLibraryOverlay();
  const unlockState = getRealmUnlockState();
  if (!unlockState.unlockedTiers.has(tierName)) {
    showFeedback(getTierUnlockMessage(tierName, unlockState), 'error');
    return;
  }
  gs.currentTab = tierName;
  document.getElementById('stage-view')!.style.display = 'none';
  document.getElementById('tier-view')!.classList.remove('hidden');

  const recordsKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recordsKey, {});
  const levels = getAllLevels();
  const tierLevels = levels.filter((l) => l.difficultyName === tierName && !l.hidden);
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
  document.getElementById('tier-view')!.classList.add('hidden');
  document.getElementById('stage-view')!.style.display = 'flex';
  renderStageMap();
}

// ── Level grid ──────────────────────────────────────────────────────

export function renderLevelGrid(): void {
  const recordsKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recordsKey, {});
  const list = document.getElementById('level-list');
  if (!list) return;
  const unlockState = getRealmUnlockState();
  list.innerHTML = '';

  const filtered = getFilteredLevels().filter((l) => !l.hidden);
  filtered.forEach((l) => {
    const record = records[l.id];
    const isLocked = !canAccessLevel(l, unlockState);
    let bestTime: number | null = null;
    let bestStars = 0;
    let submissions = 0;

    if (record) {
      if (typeof record === 'number') {
        bestTime = record;
        bestStars = 1;
      } else {
        bestTime = record.time;
        bestStars = record.stars || 1;
        if (gs.isSpeedrunMode) submissions = record.submissions || 1;
      }
    }

    const item = document.createElement('div');
    item.className = `level-item ${bestTime !== null ? 'completed' : ''}${isLocked ? ' locked' : ''}`;
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
      starsText = hasRecord ? `⚡ ${submissions}次提交` : '⚡ 未通關';
    } else {
      starsClass = bestStars > 0 ? 'level-stars' : 'level-stars is-empty';
      starsText =
        bestStars > 0
          ? '★'.repeat(bestStars) + '<span class="empty-star">' + '☆'.repeat(3 - bestStars) + '</span>'
          : '☆☆☆';
    }

    if (isLocked) {
      item.innerHTML = `
        <div class="level-num">${l.displayName}</div>
        <div class="level-lock">🔒 境界未達</div>
        <div class="level-lock-hint">完成前一境界後解鎖</div>
      `;
    } else {
      item.innerHTML = `
        <div class="level-num">${l.displayName}</div>
        <div class="${starsClass}">${starsText}</div>
        <div class="${statsClass}">${timeStr}</div>
      `;
    }
    list.appendChild(item);
  });
  requestAnimationFrame(syncLevelCardSize);

  if (gs.duoRoomData && gs.duoRoomData.status === 'waiting' && gs.duoRoomData.levelId) {
    const { playerId } = getPlayerIdentity();
    if (gs.duoRoomData.hostId !== playerId) {
      const items = document.querySelectorAll('#level-list .level-item');
      filtered.forEach((l, i) => {
        if (l.id === gs.duoRoomData.levelId && items[i]) items[i].classList.add('duo-glow');
      });
    }
  }
}

// ── Pre-level modal ─────────────────────────────────────────────────

let _pendingLevelData: any = null;

export function showPreLevelModal(levelId: number, ignoreTierLock = false, externalLevel?: any): void {
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
  const recKey = isPractice ? SK.PRACTICE_RECORDS : gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recKey, {});
  const record = records[levelId];

  let bestRecord = '尚無通關紀錄';
  let hasRecord = false;
  let hasReplay = false;

  if (record) {
    hasRecord = true;
    if (gs.isSpeedrunMode) {
      bestRecord = `最佳紀錄：${formatSeconds(record.time)} ⚡ ${record.submissions}次提交`;
    } else {
      const stars = typeof record === 'number' ? 1 : record.stars || 1;
      const time = typeof record === 'number' ? record : record.time;
      bestRecord = `最佳紀錄：${formatSeconds(time)} 星級：${'★'.repeat(stars)}`;
    }
    hasReplay = !!(record.replayHistory && record.replayHistory.length > 0);
  }

  // Delegate to React PreLevelModal
  import('../react/prelevel/preLevelBridge').then(({ bridgeOpenPreLevel }) => {
    bridgeOpenPreLevel({
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
  });

  loadPreLevelLeaderboard(levelId);
  // Duo not supported for practice levels
  if (gs.firebaseReady && !isPractice) callEnterDuoRoom(levelId);
}

export function hidePreLevelModal(): void {
  import('../react/prelevel/preLevelBridge').then(({ bridgeClosePreLevel }) => bridgeClosePreLevel());
  gs.pendingLevelId = null;
  _pendingLevelData = null;
  if (!gs.isDuoMode && gs.duoRole === 'guest') callLeaveDuoRoom();
}

export async function startLevelFromModal(
  forceReset = false,
  playWithGhost = false,
  ghostData: any = null,
): Promise<void> {
  if (gs.pendingLevelId === null) return;
  const levelId = gs.pendingLevelId;
  const overrideData = _pendingLevelData;
  _pendingLevelData = null;
  closeLibraryOverlay();
  hidePreLevelModal();
  document.getElementById('level-screen')!.style.display = 'none';
  const { initGame } = await import('../game/core');
  initGame(levelId, forceReset, playWithGhost, ghostData, overrideData || undefined);
}

// ── Navigation ──────────────────────────────────────────────────────

export function showLevelScreen(returnToTier = false): void {
  // Save progress before leaving game screen
  if (gs.currentLevel && (document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') {
    import('../game/core').then((m) => m.saveGameStatus());
  }
  closeLibraryOverlay();
  updateSpeedrunToggleUI();
  document.getElementById('level-screen')!.style.display = 'flex';
  (document.querySelector('.game-container') as HTMLElement).style.display = 'none';
  if (gs.timerInterval) clearInterval(gs.timerInterval);
  import('./replay').then((m) => m.closeReplayModal());
  hidePreLevelModal();
  closeWildLobby();
  const practiceReturnTech = gs.practiceActiveTech;
  closePracticeLobby();
  if (gs.isDuoMode) callResetDuoState();
  if (returnToTier && practiceReturnTech) {
    enterPracticeTechnique(practiceReturnTech);
  } else if (returnToTier && gs.currentTab !== null) {
    enterTier(gs.currentTab);
  } else {
    document.getElementById('tier-view')!.classList.add('hidden');
    document.getElementById('stage-view')!.style.display = 'flex';
    renderStageMap();
  }
  if (gs.firebaseReady) callStartDuoGlowListener();
}

export function toggleSpeedrunMode(): void {
  gs.isSpeedrunMode = !gs.isSpeedrunMode;
  localStorage.setItem(SK.SPEEDRUN, String(gs.isSpeedrunMode));
  updateSpeedrunToggleUI();
  renderLevelGrid();
  if (gs.isSpeedrunMode) showFeedback('已切換至純粹競速模式 ⚡', 'success');
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
  const tierLevels = levels.filter(l => l.difficultyName === gs.currentTab && !l.hidden);
  const currentIdx = tierLevels.findIndex(l => l.id === gs.currentLevel!.id);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= tierLevels.length) {
    showFeedback('本境界已全部通關！', 'success');
    showLevelScreen(true);
    return;
  }

  // Close React win, show level screen, open pre-level modal for next level
  import('../react/win/winBridge').then(({ bridgeCloseWin }) => bridgeCloseWin());
  document.getElementById('level-screen')!.style.display = 'flex';
  (document.querySelector('.game-container') as HTMLElement).style.display = 'none';
  showPreLevelModal(tierLevels[nextIdx].id);
}

// ── Random / Pool (Wild mode) ────────────────────────────────────────

let worldLaunchInFlight = false;

export async function startPoolRandom(): Promise<void> {
  if (worldLaunchInFlight) return;
  worldLaunchInFlight = true;

  const enterBtn = document.getElementById('wild-enter-btn') as HTMLButtonElement | null;
  if (enterBtn) {
    enterBtn.classList.add('is-loading');
    enterBtn.setAttribute('aria-busy', 'true');
    enterBtn.disabled = true;
  }

  try {
    showFeedback('世界載入中...', 'success');
    const { startWorldSession, continueWild, getWildProfile } = await import('./wild/wildController');
    const session = getWildProfile().currentSession;
    if (session && session.round > 0 && session.round < 10) {
      await continueWild();
      return;
    }
    await startWorldSession();
  } catch (e) {
    console.error('[World] start failed:', e);
    showFeedback('進入世界失敗，請稍後再試', 'error');
  } finally {
    worldLaunchInFlight = false;
    if (enterBtn) {
      enterBtn.classList.remove('is-loading');
      enterBtn.removeAttribute('aria-busy');
      enterBtn.disabled = false;
    }
  }
}
