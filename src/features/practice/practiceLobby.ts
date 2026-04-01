// Practice Mode Lobby — technique skill tree + per-technique level grid
// 41 techniques × 25 levels = 1025 levels in public/data/practice.json

import { gs } from '../../game/state';
import { SK, readJson } from '../../storage/keys';
import { getPracticeLevels } from '../../data/dataRegistry';
import { TECH_MAP } from '../teach-legacy';
import { showFeedback } from '../../ui/feedback';
import { syncLevelCardSize } from '../../game/board';
import { playZenMentor, playZenEncounter, playZenDiscover, playZenLevelUp, playZenSessionComplete } from '../../game/zenAudio';
import { t } from '../../i18n/t';
import { usePracticeTreeStore } from '../../react/practice/practiceTreeStore';

// ── Unlock tree definition ────────────────────────────────────────────

interface TreeNode {
  key: string;
  prerequisites: string[];
}

const UNLOCK_TREE: TreeNode[] = [
  // Phase 1: foundation (linear)
  { key: 'naked_single', prerequisites: [] },
  { key: 'hidden_single', prerequisites: ['naked_single'] },
  { key: 'locked_candidates', prerequisites: ['hidden_single'] },
  { key: 'naked_pair', prerequisites: ['locked_candidates'] },
  { key: 'hidden_pair', prerequisites: ['naked_pair'] },
  { key: 'naked_triple', prerequisites: ['hidden_pair'] },
  { key: 'hidden_triple', prerequisites: ['naked_triple'] },

  // Phase 2 left: fish/wing branch
  { key: 'x_wing', prerequisites: ['hidden_triple'] },
  { key: 'finned_x_wing', prerequisites: ['x_wing'] },
  { key: 'swordfish', prerequisites: ['finned_x_wing'] },
  { key: 'finned_swordfish', prerequisites: ['swordfish'] },
  { key: 'jellyfish', prerequisites: ['finned_swordfish'] },
  { key: 'finned_jellyfish', prerequisites: ['jellyfish'] },
  { key: 'skyscraper', prerequisites: ['finned_jellyfish'] },
  { key: 'two_string_kite', prerequisites: ['skyscraper'] },
  { key: 'empty_rectangle', prerequisites: ['two_string_kite'] },

  // Phase 2 middle: coloring branch
  { key: 'x_cycle_simple_coloring', prerequisites: ['hidden_triple'] },
  { key: 'xy_wing', prerequisites: ['x_cycle_simple_coloring'] },
  { key: 'xyz_wing', prerequisites: ['xy_wing'] },
  { key: 'w_wing', prerequisites: ['xyz_wing'] },
  { key: 'remote_pairs', prerequisites: ['w_wing'] },

  // Phase 2 right: UR/ALS branch
  { key: 'unique_rectangle', prerequisites: ['hidden_triple'] },
  { key: 'bug_plus_one', prerequisites: ['unique_rectangle'] },
  { key: 'als_xz', prerequisites: ['bug_plus_one'] },
  { key: 'als_xy', prerequisites: ['als_xz'] },
  { key: 'als_w_wing', prerequisites: ['als_xy'] },
  { key: 'als_chain', prerequisites: ['als_w_wing'] },

  // Phase 3: convergence
  { key: 'medusa_3d', prerequisites: ['empty_rectangle', 'remote_pairs', 'als_chain'] },

  // Phase 4: chain arts (linear)
  { key: 'xy_chain', prerequisites: ['medusa_3d'] },
  { key: 'aic', prerequisites: ['xy_chain'] },
  { key: 'aic_mid_chain', prerequisites: ['aic'] },
  { key: 'aic_long_chain', prerequisites: ['aic_mid_chain'] },
  { key: 'grouped_aic_nice_loop', prerequisites: ['aic_long_chain'] },
  { key: 'discontinuous_nice_loop', prerequisites: ['grouped_aic_nice_loop'] },

  // Phase 5: endgame (linear)
  { key: 'forcing_chain_net', prerequisites: ['discontinuous_nice_loop'] },
  { key: 'cell_forcing_chain', prerequisites: ['forcing_chain_net'] },
  { key: 'region_forcing_chain', prerequisites: ['cell_forcing_chain'] },
  { key: 'sue_de_coq', prerequisites: ['region_forcing_chain'] },
  { key: 'template', prerequisites: ['sue_de_coq'] },
  { key: 'death_blossom', prerequisites: ['template'] },
  { key: 'exocet_death_blossom', prerequisites: ['death_blossom'] },
];

// Deduplicate tree (als_xz appears twice above — keep first)
const _seen = new Set<string>();
const TREE: TreeNode[] = [];
for (const node of UNLOCK_TREE) {
  if (!_seen.has(node.key)) {
    _seen.add(node.key);
    TREE.push(node);
  }
}

// ── Phase layout definition ───────────────────────────────────────────

interface PhaseLinear {
  type: 'linear';
  name: string;
  keys: string[];
}

interface PhaseBranch {
  type: 'branch';
  name: string;
  branches: { name: string; keys: string[] }[];
}

type Phase = PhaseLinear | PhaseBranch;

const PHASES: Phase[] = [
  {
    type: 'linear',
    name: t('practice.phase1'),
    keys: ['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple'],
  },
  {
    type: 'branch',
    name: t('practice.phase2'),
    branches: [
      {
        name: t('practice.branchFish'),
        keys: ['x_wing', 'finned_x_wing', 'swordfish', 'finned_swordfish', 'jellyfish', 'finned_jellyfish', 'skyscraper', 'two_string_kite', 'empty_rectangle'],
      },
      {
        name: t('practice.branchColor'),
        keys: ['x_cycle_simple_coloring', 'xy_wing', 'xyz_wing', 'w_wing', 'remote_pairs'],
      },
      {
        name: t('practice.branchALS'),
        keys: ['unique_rectangle', 'bug_plus_one', 'als_xz', 'als_xy', 'als_w_wing', 'als_chain'],
      },
    ],
  },
  {
    type: 'linear',
    name: t('practice.phase3'),
    keys: ['medusa_3d'],
  },
  {
    type: 'linear',
    name: t('practice.phase4'),
    keys: ['xy_chain', 'aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop'],
  },
  {
    type: 'linear',
    name: t('practice.phase5'),
    keys: ['forcing_chain_net', 'cell_forcing_chain', 'region_forcing_chain', 'sue_de_coq', 'template', 'death_blossom', 'exocet_death_blossom'],
  },
];

// ── Unlock computation ─────────────────────────────────────────────────

const UNLOCK_THRESHOLD = 3;

type TechStatus = 'locked' | 'unlocked' | 'partial' | 'completed';

interface TechState {
  status: TechStatus;
  cleared: number;
  total: number;
}

function computeUnlockState(): Map<string, TechState> {
  const records = readJson<Record<string, any>>(SK.PRACTICE_RECORDS, {});
  const result = new Map<string, TechState>();

  // First pass: count cleared levels per technique
  const clearedCount = new Map<string, number>();
  for (const key of Object.keys(records)) {
    const rec = records[key];
    if (rec && rec.techKey) {
      clearedCount.set(rec.techKey, (clearedCount.get(rec.techKey) || 0) + 1);
    }
  }

  // Second pass: determine unlock state
  for (const node of TREE) {
    const cleared = clearedCount.get(node.key) || 0;
    const total = 25;

    // Check prerequisites
    const prereqs = node.prerequisites;
    let allPrereqsMet = true;
    for (const pre of prereqs) {
      const preClear = clearedCount.get(pre) || 0;
      if (preClear < Math.min(UNLOCK_THRESHOLD, 25)) {
        allPrereqsMet = false;
        break;
      }
    }

    // medusa_3d special: ANY one of three branches completing suffices
    if (node.key === 'medusa_3d') {
      const branchEnds = ['empty_rectangle', 'remote_pairs', 'als_chain'];
      allPrereqsMet = branchEnds.some(k => (clearedCount.get(k) || 0) >= Math.min(UNLOCK_THRESHOLD, 25));
    }

    let status: TechStatus;
    if (!allPrereqsMet) {
      status = 'locked';
    } else if (cleared >= total) {
      status = 'completed';
    } else if (cleared > 0) {
      status = 'partial';
    } else {
      status = 'unlocked';
    }

    result.set(node.key, { status, cleared, total });
  }

  return result;
}

// ── View management ───────────────────────────────────────────────────

let _practiceData: Awaited<ReturnType<typeof getPracticeLevels>> | null = null;

function setPracticeViewActive(active: boolean): void {
  const levelTitle = document.getElementById('level-title');
  const levelModeChip = document.getElementById('level-mode-chip');
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const wildLobby = document.getElementById('wild-lobby');
  const practiceLobby = document.getElementById('practice-lobby');
  const libraryBtn = document.getElementById('library-btn');

  if (levelTitle) levelTitle.textContent = active ? t('practice.lobbyTitle') : 'SUDOKU ZEN';
  if (levelModeChip) {
    levelModeChip.textContent = t('mode.practice');
    levelModeChip.classList.toggle('hidden', !active);
  }
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.add('hidden');
  if (wildLobby) wildLobby.classList.add('hidden');
  if (practiceLobby) practiceLobby.classList.toggle('hidden', !active);
  if (libraryBtn) libraryBtn.style.display = active ? 'none' : '';
}

// ── Open / Close / Render ─────────────────────────────────────────────

export async function openPracticeLobby(): Promise<void> {
  if (!_practiceData) {
    _practiceData = await getPracticeLevels();
  }
  if (!_practiceData || _practiceData.length === 0) {
    showFeedback(t('practice.dataLoadError'), 'error');
    return;
  }
  setPracticeViewActive(true);
  renderPracticeLobby();
  playZenMentor();
  // Initialize completion tracking for change detection on return
  const state = computeUnlockState();
  _prevCompletedCount = [...state.values()].filter(s => s.status === 'completed').length;
}

export function closePracticeLobby(): void {
  setPracticeViewActive(false);
  gs.practiceActiveTech = null;
  usePracticeTreeStore.getState().close();
}

export function isPracticeLobbyOpen(): boolean {
  const lobby = document.getElementById('practice-lobby');
  const legacyOpen = !!lobby && !lobby.classList.contains('hidden');
  return legacyOpen || usePracticeTreeStore.getState().visible;
}

function renderPracticeLobby(): void {
  const state = computeUnlockState();
  const completedCount = [...state.values()].filter(s => s.status === 'completed').length;

  // Convert to React-friendly format with display names
  const nodeMap = new Map<string, { key: string; name: string; status: TechStatus; cleared: number; total: number }>();
  for (const [key, val] of state.entries()) {
    nodeMap.set(key, {
      key,
      name: TECH_MAP[key] || key,
      status: val.status,
      cleared: val.cleared,
      total: val.total,
    });
  }

  // Push to React PracticeTree store
  usePracticeTreeStore.getState().open(nodeMap, completedCount);
}

// ── Enter technique level grid (reuses #tier-view) ──────────────────

export function enterPracticeTechnique(techKey: string): void {
  gs.practiceActiveTech = techKey;
  playZenEncounter();

  // Hide React tree when entering technique grid
  usePracticeTreeStore.getState().close();

  const stageView = document.getElementById('stage-view');
  const practiceLobby = document.getElementById('practice-lobby');
  const tierView = document.getElementById('tier-view');

  if (stageView) stageView.style.display = 'none';
  if (practiceLobby) practiceLobby.classList.add('hidden');
  if (tierView) tierView.classList.remove('hidden');

  const techName = TECH_MAP[techKey] || techKey;
  const titleEl = document.getElementById('tier-title');
  if (titleEl) titleEl.textContent = techName;

  // Hide teach button (not applicable for practice)
  const teachBtn = document.getElementById('tier-teach-btn');
  if (teachBtn) teachBtn.style.display = 'none';

  // Override back button
  const backBtn = tierView?.querySelector('.tier-back-btn') as HTMLElement | null;
  if (backBtn) {
    backBtn.onclick = () => backToPracticeLobby();
  }

  renderPracticeLevelGrid(techKey);
}

function renderPracticeLevelGrid(techKey: string): void {
  const list = document.getElementById('level-list');
  if (!list || !_practiceData) return;
  list.innerHTML = '';

  const records = readJson<Record<string, any>>(SK.PRACTICE_RECORDS, {});
  const techLevels = _practiceData.filter(l => l.maxTechnique === techKey);
  const cleared = techLevels.filter(l => records[l.id]).length;

  const progressEl = document.getElementById('tier-progress-text');
  if (progressEl) progressEl.textContent = `${cleared}/${techLevels.length}`;

  techLevels.forEach((l, idx) => {
    const record = records[l.id];
    const item = document.createElement('div');
    item.className = `level-item${record ? ' completed' : ''}`;

    const hasRecord = !!record;
    const bestTime = hasRecord ? record.time : null;
    const timeStr = bestTime !== null
      ? `${Math.floor(bestTime / 60)}:${(bestTime % 60).toString().padStart(2, '0')}`
      : '--:--';
    const bestStars = hasRecord ? (record.stars || 1) : 0;
    const starsClass = bestStars > 0 ? 'level-stars' : 'level-stars is-empty';
    const starsText = bestStars > 0
      ? '★'.repeat(bestStars) + '<span class="empty-star">' + '☆'.repeat(3 - bestStars) + '</span>'
      : '☆☆☆';

    item.innerHTML = `
      <div class="level-num">${l.displayName || `第 ${idx + 1} 關`}</div>
      <div class="${starsClass}">${starsText}</div>
      <div class="level-stats${hasRecord ? '' : ' is-empty'}">${timeStr}</div>
    `;

    item.onclick = () => {
      // Route to pre-level modal with practice context, passing level data directly
      import('../levels').then(m => m.showPreLevelModal(l.id, true, l));
    };

    list.appendChild(item);
  });

  requestAnimationFrame(syncLevelCardSize);
}

// Track previous state to detect changes on return
let _prevCompletedCount = -1;

export function backToPracticeLobby(): void {
  const prevTech = gs.practiceActiveTech;
  gs.practiceActiveTech = null;

  const tierView = document.getElementById('tier-view');
  const practiceLobby = document.getElementById('practice-lobby');

  if (tierView) tierView.classList.add('hidden');
  if (practiceLobby) practiceLobby.classList.remove('hidden');

  // Restore tier-view back button to default behavior
  const backBtn = tierView?.querySelector('.tier-back-btn') as HTMLElement | null;
  if (backBtn) {
    backBtn.onclick = () => {
      import('../levels').then(m => m.backToStageMap());
    };
  }

  renderPracticeLobby();

  // Detect technique completion or full mastery
  const state = computeUnlockState();
  const completedCount = [...state.values()].filter(s => s.status === 'completed').length;

  if (_prevCompletedCount >= 0 && completedCount > _prevCompletedCount) {
    // A technique was just completed
    if (completedCount >= 41) {
      // All 41 completed — 出關
      playZenSessionComplete();
      setTimeout(() => {
        import('../../react/mentor/mentorBridge').then(({ bridgeShowMentor }) => {
          bridgeShowMentor(
            '你走完了三十九道坎，\n還多走了兩道我沒留記號的。\n\n修行圓滿。但劍沒有盡頭。',
            '── 弈塵',
          );
        });
      }, 3500);
    } else {
      // Single technique completed
      const techName = prevTech ? (TECH_MAP[prevTech] || prevTech) : '';
      if (techName) showFeedback(t('practice.techComplete', { name: techName }), 'success');
      playZenLevelUp();
    }
  }

  // Detect newly unlocked techniques
  if (_prevCompletedCount >= 0) {
    const newlyUnlocked = [...state.entries()].filter(
      ([, s]) => s.status === 'unlocked' && s.cleared === 0,
    );
    if (newlyUnlocked.length > 0 && completedCount > _prevCompletedCount) {
      setTimeout(() => playZenDiscover(), 600);
    }
  }

  _prevCompletedCount = completedCount;
}

// ── Next practice level ───────────────────────────────────────────────

export async function startNextPracticeLevel(): Promise<void> {
  if (!_practiceData || !gs.practiceActiveTech || !gs.currentLevel) {
    // Fallback: go to level screen
    const { showLevelScreen } = await import('../levels');
    showLevelScreen(true);
    return;
  }

  const techKey = gs.practiceActiveTech;
  const techLevels = _practiceData.filter(l => l.maxTechnique === techKey);
  const currentIdx = techLevels.findIndex(l => l.id === gs.currentLevel!.id);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= techLevels.length) {
    // All levels in this technique done — go back to level grid
    showFeedback(t('practice.allComplete'), 'success');
    const { showLevelScreen } = await import('../levels');
    showLevelScreen(true);
    return;
  }

  const nextLevel = techLevels[nextIdx];
  const { showPreLevelModal } = await import('../levels');
  // Close React win celebration
  const { bridgeCloseWin } = await import('../../react/win/winBridge');
  bridgeCloseWin();
  // Also hide legacy win element (fallback)
  const winEl = document.getElementById('win-celebration');
  if (winEl) winEl.style.display = 'none';
  document.getElementById('level-screen')!.style.display = 'flex';
  showPreLevelModal(nextLevel.id, true, nextLevel);
}

// ── Save practice record ──────────────────────────────────────────────

export function savePracticeRecord(levelId: number, seconds: number, errors: number, techKey: string, replayHistory?: any[]): void {
  const records = readJson<Record<string, any>>(SK.PRACTICE_RECORDS, {});
  const existing = records[levelId];
  const earnedStars = Math.max(1, 3 - errors);
  const shouldUpdate =
    !existing ||
    earnedStars > (existing.stars || 1) ||
    (earnedStars === (existing.stars || 1) && seconds < (existing.time || Infinity));

  if (shouldUpdate) {
    records[levelId] = {
      time: seconds,
      stars: earnedStars,
      techKey,
      ...(replayHistory ? { replayHistory } : {}),
    };
    try {
      localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(records));
    } catch (e) {
      console.warn('savePracticeRecord: localStorage quota exceeded', e);
    }
  }
}
