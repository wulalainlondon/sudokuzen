// Level selection screen, tier/realm system, stage map, progression

import { gs } from '../game/state';
import { getAllLevels } from '../data/dataRegistry';
import { SK, readJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { showFeedback } from '../ui/feedback';
import { loadPreLevelLeaderboard } from '../firebase/client';
import { syncLevelCardSize } from '../game/board';
import { TECH_MAP, showTeachModal, shouldShowTeach, closeLibraryOverlay } from './teach-legacy';
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
  '無我',
  '破陣',
  '空鏡',
  '星潮',
  '玄鏈',
  '本源',
  '寂滅',
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
  本源: 9,
  寂滅: 10,
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
    return { name, cleared, total, isCleared: total > 0 && cleared >= total };
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
  return `需先全通「${prev.name}」(${prev.cleared}/${prev.total}) 才能挑戰後續境界`;
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
        <div class="stage-progress">${isLocked ? lockHint : cleared === 0 ? '尚未挑戰' : isCleared ? '已全通' : '進行中'}</div>
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
  const TEACH_DATA = (typeof globalThis !== 'undefined' && (globalThis as any).TEACH_DATA) || {};
  if (representativeStar !== null && TEACH_DATA[representativeStar]) {
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

export function showPreLevelModal(levelId: number, ignoreTierLock = false): void {
  closeLibraryOverlay();
  gs.pendingLevelId = levelId;
  const levels = getAllLevels();
  const level = levels.find((l) => l.id === levelId);
  if (!level) return;
  if (!ignoreTierLock && !canAccessLevel(level)) {
    showFeedback(getTierUnlockMessage(level.difficultyName), 'error');
    return;
  }

  gs.preLevelNameEl!.textContent = level.displayName;
  const techName = TECH_MAP[level.maxTechnique || ''] || level.maxTechnique || '-';
  const techTier = level.techTier || '';
  gs.preLevelTechEl!.textContent = `💡 核心技巧: ${techName} ${techTier ? `(${techTier})` : ''}`;

  const recKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recKey, {});
  const record = records[levelId];

  if (record) {
    if (gs.isSpeedrunMode) {
      gs.preLevelBestRecordEl!.textContent = `最佳紀錄：${formatSeconds(record.time)} ⚡ ${record.submissions}次提交`;
    } else {
      const stars = typeof record === 'number' ? 1 : record.stars || 1;
      const time = typeof record === 'number' ? record : record.time;
      gs.preLevelBestRecordEl!.textContent = `最佳紀錄：${formatSeconds(time)} 星級：${'★'.repeat(stars)}`;
    }
    gs.preLevelBestRecordEl!.classList.add('has-record');

    if (record.replayHistory && record.replayHistory.length > 0) {
      gs.preLevelReplayBtn!.style.display = 'block';
      (gs.preLevelReplayBtn as HTMLElement).onclick = async () => {
        const { openHistoricalReplay } = await import('./replay');
        openHistoricalReplay(levelId, record.replayHistory);
      };
      gs.preLevelGhostBtn!.style.display = 'block';
      (gs.preLevelGhostBtn as HTMLElement).onclick = () => startLevelFromModal(true, true, record.replayHistory);
    } else {
      gs.preLevelReplayBtn!.style.display = 'none';
      gs.preLevelGhostBtn!.style.display = 'none';
    }
  } else {
    gs.preLevelBestRecordEl!.textContent = '尚無通關紀錄';
    gs.preLevelBestRecordEl!.classList.remove('has-record');
    gs.preLevelReplayBtn!.style.display = 'none';
    gs.preLevelGhostBtn!.style.display = 'none';
  }

  gs.preLevelLeaderboardEl!.textContent = '載入中...';
  loadPreLevelLeaderboard(levelId);
  gs.preLevelModalEl!.style.display = 'flex';
  if (gs.firebaseReady) callEnterDuoRoom(levelId);
}

export function hidePreLevelModal(): void {
  gs.preLevelModalEl!.style.display = 'none';
  gs.pendingLevelId = null;
  if (!gs.isDuoMode && gs.duoRole) callLeaveDuoRoom();
}

export async function startLevelFromModal(
  forceReset = false,
  playWithGhost = false,
  ghostData: any = null,
): Promise<void> {
  if (gs.pendingLevelId === null) return;
  const levelId = gs.pendingLevelId;
  closeLibraryOverlay();
  hidePreLevelModal();
  document.getElementById('level-screen')!.style.display = 'none';
  const { initGame } = await import('../game/core');
  initGame(levelId, forceReset, playWithGhost, ghostData);
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
  clearInterval(gs.timerInterval!);
  gs.overlay!.style.display = 'none';
  import('./replay').then((m) => m.closeReplayModal());
  hidePreLevelModal();
  if (gs.isDuoMode) callResetDuoState();
  if (returnToTier && gs.currentTab !== null) {
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

// ── Random / Pool ───────────────────────────────────────────────────

export function startPoolRandom(): void {
  const midPoolLevels = getAllLevels().filter((l) => l.hidden);
  if (!midPoolLevels.length) {
    showFeedback('今日隨機題庫載入失敗，請稍後重試', 'error');
    return;
  }
  const records = readJson<Record<string, any>>(SK.RECORDS, {});
  const next = midPoolLevels.find((l) => !records[l.id]) || midPoolLevels[0];
  if (!next) return;
  if (records[next.id]) showFeedback('今日題庫已全通，已為你開啟固定挑戰題。', 'success');
  showPreLevelModal(next.id, true);
}
