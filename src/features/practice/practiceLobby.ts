// Practice Mode Lobby — technique skill tree + per-technique level grid
// 41 techniques × 25 levels = 1025 levels in public/data/practice.json

import { gs, type ActionRecord } from '../../game/state';
import { SK, readJson } from '../../storage/keys';
import { getPracticeLevels, hasTeachModule } from '../../data/dataRegistry';
import { TECH_MAP } from '../teach-legacy';
import { showFeedback } from '../../ui/feedback';
import { syncLevelCardSize } from '../../game/board';
import { playZenMentor, playZenEncounter, playZenDiscover, playZenLevelUp, playZenSessionComplete } from '../../game/zenAudio';
import { t } from '../../i18n/t';
import { usePracticeTreeStore } from '../../react/practice/practiceTreeStore';
import { emitNavigation } from '../../app/navigation/navigationBus';
import { saveScroll, restoreScroll } from '../levels';
import type { SudokuWindow } from '../../facade/windowTypes';
import { toClassicLevelRecord } from '../../shared/records/levelRecords';

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

type PracticePhaseKey = 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'phase5';

const PHASE1_SET = new Set(['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple']);
const PHASE2_SET = new Set([
  'x_wing', 'finned_x_wing', 'swordfish', 'finned_swordfish', 'jellyfish', 'finned_jellyfish', 'skyscraper', 'two_string_kite', 'empty_rectangle',
  'x_cycle_simple_coloring', 'xy_wing', 'xyz_wing', 'w_wing', 'remote_pairs',
  'unique_rectangle', 'bug_plus_one', 'als_xz', 'als_xy', 'als_w_wing', 'als_chain',
]);
const PHASE3_SET = new Set(['medusa_3d']);
const PHASE4_SET = new Set(['xy_chain', 'aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop']);

// Representative teach books for first-entry phase briefing.
const PHASE_TEACH_BOOK: Record<PracticePhaseKey, number> = {
  phase1: 1, // naked_single
  phase2: 8, // x_wing
  phase3: 26, // remote_pairs (convergence prep)
  phase4: 18, // aic
  phase5: 24, // forcing_chain_net
};
const PRACTICE_PHASE_TEACH_SEEN_KEY = 'sudoku_practice_phase_teach_seen_v1';

// Deduplicate tree (als_xz appears twice above — keep first)
const _seen = new Set<string>();
export const TREE: TreeNode[] = [];
for (const node of UNLOCK_TREE) {
  if (!_seen.has(node.key)) {
    _seen.add(node.key);
    TREE.push(node);
  }
}

// Phase layout definition is now in React PracticeTree.tsx — phases here removed.

// ── Unlock computation ─────────────────────────────────────────────────

export const UNLOCK_THRESHOLD = 3;

export type TechStatus = 'locked' | 'unlocked' | 'partial' | 'completed';

export interface TechState {
  status: TechStatus;
  cleared: number;
  total: number;
}

export function computeUnlockState(): Map<string, TechState> {
  const records = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const result = new Map<string, TechState>();

  // First pass: count cleared levels per technique
  const clearedCount = new Map<string, number>();
  for (const key of Object.keys(records)) {
    const rec = toClassicLevelRecord(records[key]);
    if (rec?.techKey) clearedCount.set(rec.techKey, (clearedCount.get(rec.techKey) || 0) + 1);
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

function getPracticePhaseKey(techKey: string): PracticePhaseKey {
  if (PHASE1_SET.has(techKey)) return 'phase1';
  if (PHASE2_SET.has(techKey)) return 'phase2';
  if (PHASE3_SET.has(techKey)) return 'phase3';
  if (PHASE4_SET.has(techKey)) return 'phase4';
  return 'phase5';
}

function maybeShowPhaseTeachBrief(techKey: string): void {
  const phase = getPracticePhaseKey(techKey);
  const raw = localStorage.getItem(PRACTICE_PHASE_TEACH_SEEN_KEY);
  let seen: Record<string, boolean> = {};
  if (raw) {
    try {
      seen = JSON.parse(raw) as Record<string, boolean>;
    } catch {
      seen = {};
    }
  }
  if (seen[phase]) return;

  const stars = PHASE_TEACH_BOOK[phase];
  seen[phase] = true;
  localStorage.setItem(PRACTICE_PHASE_TEACH_SEEN_KEY, JSON.stringify(seen));
  if (!hasTeachModule(stars)) return;

  window.setTimeout(() => {
    const show = (window as SudokuWindow).showTeachModal;
    if (show) {
      show(stars, 'tier');
      return;
    }
    import('../teach-legacy').then((m) => m.showTeachModal(stars, 'tier')).catch(() => {});
  }, 320);
}

// ── View management ───────────────────────────────────────────────────

let _practiceData: Awaited<ReturnType<typeof getPracticeLevels>> | null = null;

function setPracticeViewActive(active: boolean): void {
  const mainHeader = document.querySelector('.level-screen-header') as HTMLElement | null;
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const wildLobby = document.getElementById('wild-lobby');

  if (mainHeader) mainHeader.style.display = active ? 'none' : '';
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.add('hidden');
  if (wildLobby) wildLobby.classList.add('hidden');
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
  saveScroll('stage-map');
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
  restoreScroll('stage-map');
}

export function isPracticeLobbyOpen(): boolean {
  return usePracticeTreeStore.getState().visible;
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
  const tierView = document.getElementById('tier-view');

  if (stageView) stageView.style.display = 'none';
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
  maybeShowPhaseTeachBrief(techKey);
}

function renderPracticeLevelGrid(techKey: string): void {
  const list = document.getElementById('level-list');
  if (!list || !_practiceData) return;
  list.innerHTML = '';

  const records = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const techLevels = _practiceData.filter(l => l.maxTechnique === techKey);
  const cleared = techLevels.filter(l => records[l.id]).length;

  const progressEl = document.getElementById('tier-progress-text');
  if (progressEl) progressEl.textContent = `${cleared}/${techLevels.length}`;

  techLevels.forEach((l, idx) => {
    const record = records[l.id];
    const parsed = toClassicLevelRecord(record);
    const item = document.createElement('div');
    item.className = `level-item${record ? ' completed' : ''}`;

    const hasRecord = !!record;
    const bestTime = hasRecord ? (parsed?.time ?? null) : null;
    const timeStr = bestTime !== null
      ? `${Math.floor(bestTime / 60)}:${(bestTime % 60).toString().padStart(2, '0')}`
      : '--:--';
    const bestStars = hasRecord ? (parsed?.stars ?? 1) : 0;
    const starsClass = bestStars > 0 ? 'level-stars' : 'level-stars is-empty';
    const starsText = bestStars > 0
      ? '★'.repeat(bestStars) + '<span class="empty-star">' + '☆'.repeat(3 - bestStars) + '</span>'
      : '☆☆☆';

    item.innerHTML = `
      <div class="level-num">${l.displayName || t('practiceLobby.levelFallback', { idx: String(idx + 1) })}</div>
      <div class="${starsClass}">${starsText}</div>
      <div class="level-stats${hasRecord ? '' : ' is-empty'}">${timeStr}</div>
    `;

    item.onclick = () => {
      // Route to pre-level modal with practice context, passing level data directly
      emitNavigation({ type: 'show-pre-level-modal', levelId: l.id, ignoreTierLock: true, externalLevel: l });
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

  if (tierView) tierView.classList.add('hidden');

  // Restore tier-view back button to default behavior
  const backBtn = tierView?.querySelector('.tier-back-btn') as HTMLElement | null;
  if (backBtn) {
    backBtn.onclick = () => {
      emitNavigation({ type: 'back-to-stage-map' });
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
            t('practiceLobby.allCompleteQuote'),
            t('practiceLobby.allCompleteAttr'),
          );
        }).catch(() => {});
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
    emitNavigation({ type: 'show-level-screen', returnToTier: true });
    return;
  }

  const techKey = gs.practiceActiveTech;
  const techLevels = _practiceData.filter(l => l.maxTechnique === techKey);
  const currentIdx = techLevels.findIndex(l => l.id === gs.currentLevel!.id);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= techLevels.length) {
    // All levels in this technique done — go back to level grid
    showFeedback(t('practice.allComplete'), 'success');
    emitNavigation({ type: 'show-level-screen', returnToTier: true });
    return;
  }

  const nextLevel = techLevels[nextIdx];
  // Close React win celebration
  const { bridgeCloseWin } = await import('../../react/win/winBridge');
  bridgeCloseWin();
  // Also hide legacy win element (fallback)
  const winEl = document.getElementById('win-celebration');
  if (winEl) winEl.style.display = 'none';
  document.getElementById('level-screen')!.style.display = 'flex';
  emitNavigation({ type: 'show-pre-level-modal', levelId: nextLevel.id, ignoreTierLock: true, externalLevel: nextLevel });
}

// ── Save practice record ──────────────────────────────────────────────

export function savePracticeRecord(levelId: number, seconds: number, errors: number, techKey: string, replayHistory?: ActionRecord[]): void {
  const records = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const existing = records[levelId];
  const existingRec = toClassicLevelRecord(existing);
  const earnedStars = Math.max(1, 3 - errors);
  const shouldUpdate =
    !existing ||
    earnedStars > (existingRec?.stars ?? 1) ||
    (earnedStars === (existingRec?.stars ?? 1) && seconds < (existingRec?.time ?? Infinity));

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
