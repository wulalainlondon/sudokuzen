// Replay engine — visual replay board + text replay list

import { gs, type ActionRecord, type ReplayCellState } from '../game/state';
import { vibrate } from '../platform/haptics';
import { formatSeconds } from '../game/utils';
import { getAllLevels } from '../data/dataRegistry';
import { detectTechnique } from '../solver/techniqueDetector';
import { computeReplayScore } from '../solver/scoring';
import type { TechniqueName } from '../solver/types';
import { recordReplayWatch } from './stats';
import { t } from '../i18n/t';
import { closePreLevel } from '../app/ui/uiOrchestrator';
import {
  bridgeOpenReplay,
  bridgeCloseReplay,
  bridgeSetReplayDiagnosis,
  bridgeSetReplayFilter,
  bridgeSetReplaySummary,
  bridgeSetReplayListHtml,
  bridgeSetReplayPlayback,
} from '../react/replay/replayBridge';
import teachData from '../../teach-data.json';

const RB_BASE_INTERVAL = 700;

// Score tracking during replay
let _replayTechniqueLog: { type: string; technique?: TechniqueName | null }[] = [];

export interface ReplayDiagnosis {
  totalActions: number;
  elapsedSeconds: number;
  mistakeCount: number;
  keyCount: number;
  keyRatePct: number;
  mistakeRatePct: number;
  paceSecondsPerAction: number;
  paceLabel: 'idle' | 'fast' | 'steady' | 'slow';
  learningFocus: {
    focusType: 'mistake' | 'key_step' | 'pace' | 'balanced';
    focusLabel: string;
  };
  recommendations: ReplayRecommendation[];
  summary: string;
  insights: string[];
}

export interface ReplayRecommendation {
  techniqueKey: string;
  techniqueLabel: string;
  moduleId: string | null;
  moduleName: string | null;
  reason: string;
}

export function isKeyReplayAction(a: ActionRecord): boolean {
  return ['fill', 'mistake', 'eliminate', 'quick_note'].includes(a.type);
}

export function getFilteredReplayActions(): ActionRecord[] {
  if (gs.replayFilter === 'mistake') return gs.actionHistory.filter((a) => a.type === 'mistake');
  if (gs.replayFilter === 'key') return gs.actionHistory.filter(isKeyReplayAction);
  return gs.actionHistory;
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function formatPaceLabel(secondsPerAction: number, totalActions: number): ReplayDiagnosis['paceLabel'] {
  if (totalActions <= 0) return 'idle';
  if (secondsPerAction <= 3) return 'fast';
  if (secondsPerAction <= 8) return 'steady';
  return 'slow';
}

const RECOMMENDATION_POOLS: Record<ReplayDiagnosis['learningFocus']['focusType'], string[]> = {
  mistake: ['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair'],
  key_step: ['hidden_pair', 'naked_triple', 'hidden_triple', 'x_wing'],
  pace: ['naked_single', 'hidden_single', 'naked_pair', 'hidden_pair'],
  balanced: ['hidden_single', 'locked_candidates', 'naked_pair'],
};

function getTechniqueLabel(techniqueKey: string): string {
  const translated = t(`techMap.${techniqueKey}`);
  return translated === `techMap.${techniqueKey}` ? techniqueKey : translated;
}

function buildTeachModuleIndex(): Map<string, { id: string; name: string }> {
  const entries = Object.entries(teachData).sort((a, b) => Number(a[0]) - Number(b[0]));
  const index = new Map<string, { id: string; name: string }>();
  for (const [id, mod] of entries) {
    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) continue;
    const technique =
      typeof (mod as Record<string, unknown>).technique === 'string'
        ? String((mod as Record<string, unknown>).technique)
        : '';
    if (!technique) continue;
    const name =
      typeof (mod as Record<string, unknown>).name === 'string'
        ? String((mod as Record<string, unknown>).name)
        : `Module ${id}`;
    if (!index.has(technique)) index.set(technique, { id, name });
  }
  return index;
}

function buildRecommendationReason(
  focusType: ReplayDiagnosis['learningFocus']['focusType'],
  techniqueLabel: string,
  moduleName: string | null,
): string {
  const name = moduleName || techniqueLabel;
  if (focusType === 'mistake') return `${name} helps clean up avoidable errors.`;
  if (focusType === 'key_step') return `${name} turns more moves into decisive steps.`;
  if (focusType === 'pace') return `${name} can reduce hesitation and speed up solving.`;
  return `${name} keeps accuracy and tempo balanced.`;
}

function buildReplayRecommendations(focusType: ReplayDiagnosis['learningFocus']['focusType']): ReplayRecommendation[] {
  const moduleIndex = buildTeachModuleIndex();
  const techniqueKeys = RECOMMENDATION_POOLS[focusType] || RECOMMENDATION_POOLS.balanced;
  return techniqueKeys.slice(0, 4).map((techniqueKey) => {
    const module = moduleIndex.get(techniqueKey) || null;
    const techniqueLabel = getTechniqueLabel(techniqueKey);
    return {
      techniqueKey,
      techniqueLabel,
      moduleId: module?.id ?? null,
      moduleName: module?.name ?? null,
      reason: buildRecommendationReason(focusType, techniqueLabel, module?.name ?? null),
    };
  });
}

function buildLearningFocus(
  mistakeCount: number,
  mistakeRatePct: number,
  keyRatePct: number,
  paceLabel: ReplayDiagnosis['paceLabel'],
): ReplayDiagnosis['learningFocus'] {
  if (mistakeCount > 0 && mistakeRatePct >= 25) {
    return {
      focusType: 'mistake',
      focusLabel: 'Review mistakes first',
    };
  }

  if (keyRatePct <= 40) {
    return {
      focusType: 'key_step',
      focusLabel: 'Increase key-step usage',
    };
  }

  if (paceLabel === 'slow') {
    return {
      focusType: 'pace',
      focusLabel: 'Improve solving pace',
    };
  }

  return {
    focusType: 'balanced',
    focusLabel: 'Balanced replay profile',
  };
}

export function buildReplayDiagnosis(actionHistory: ActionRecord[], elapsedSeconds: number): ReplayDiagnosis {
  const actions = Array.isArray(actionHistory) ? actionHistory : [];
  const totalActions = actions.length;
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const mistakeCount = actions.filter((a) => a.type === 'mistake').length;
  const keyCount = actions.filter(isKeyReplayAction).length;
  const keyRatePct = totalActions > 0 ? Math.round((keyCount / totalActions) * 100) : 0;
  const mistakeRatePct = totalActions > 0 ? Math.round((mistakeCount / totalActions) * 100) : 0;
  const paceSecondsPerAction = totalActions > 0 ? elapsed / totalActions : 0;
  const paceLabel = formatPaceLabel(paceSecondsPerAction, totalActions);
  const learningFocus = buildLearningFocus(mistakeCount, mistakeRatePct, keyRatePct, paceLabel);
  const recommendations = buildReplayRecommendations(learningFocus.focusType);
  const summary =
    totalActions > 0
      ? `${totalActions} ${formatCountLabel(totalActions, 'action', 'actions')} · ${mistakeCount} ${formatCountLabel(mistakeCount, 'mistake', 'mistakes')} · ${keyCount} key ${formatCountLabel(keyCount, 'step', 'steps')}`
      : 'No replay actions recorded.';

  const insights: string[] = [];
  if (totalActions <= 0) {
    insights.push('Open a solved replay to generate a diagnosis.');
    insights.push('Mistakes, key steps, and tempo will appear here.');
    return {
      totalActions,
      elapsedSeconds: elapsed,
      mistakeCount,
      keyCount,
      keyRatePct,
      mistakeRatePct,
      paceSecondsPerAction,
      paceLabel,
      learningFocus,
      recommendations,
      summary,
      insights,
    };
  }

  if (mistakeCount === 0) insights.push('No mistakes recorded in this replay.');
  else if (mistakeRatePct >= 25)
    insights.push(
      `${mistakeCount} ${formatCountLabel(mistakeCount, 'mistake is', 'mistakes are')} concentrated and worth reviewing first.`,
    );
  else insights.push(`${mistakeCount} mistakes recorded.`);

  if (keyRatePct >= 70) insights.push(`Key steps dominate (${keyRatePct}% of moves).`);
  else if (keyRatePct <= 40) insights.push(`Many filler moves remain (${keyRatePct}% key steps).`);
  else insights.push(`Balanced move mix (${keyRatePct}% key steps).`);

  const paceText = `${paceSecondsPerAction.toFixed(1)}s/action`;
  if (paceLabel === 'fast') insights.push(`Tempo is fast (${paceText}).`);
  else if (paceLabel === 'steady') insights.push(`Tempo is steady (${paceText}).`);
  else insights.push(`Tempo is slow (${paceText}).`);

  return {
    totalActions,
    elapsedSeconds: elapsed,
    mistakeCount,
    keyCount,
    keyRatePct,
    mistakeRatePct,
    paceSecondsPerAction,
    paceLabel,
    learningFocus,
    recommendations,
    summary,
    insights,
  };
}

export function syncReplayDiagnosis(): ReplayDiagnosis {
  const diagnosis = buildReplayDiagnosis(gs.actionHistory, gs.seconds);
  bridgeSetReplayDiagnosis(diagnosis);
  return diagnosis;
}

export function syncReplayFilterButtons(): void {
  bridgeSetReplayFilter(gs.replayFilter as 'all' | 'mistake' | 'key');
}

export function setReplayFilter(filterKey: 'all' | 'mistake' | 'key'): void {
  gs.replayFilter = filterKey;
  syncReplayFilterButtons();
  renderReplayList();
}

export function renderReplayList(): void {
  if (!gs.currentLevel) {
    bridgeSetReplaySummary('-');
    bridgeSetReplayListHtml(`<div class="replay-item">${t('replayRuntime.noStepsForFilter')}</div>`);
    return;
  }
  const filtered = getFilteredReplayActions();
  const filterLabel =
    gs.replayFilter === 'mistake'
      ? t('replayRuntime.filterLabelMistake')
      : gs.replayFilter === 'key'
        ? t('replayRuntime.filterLabelKey')
        : t('replayRuntime.filterLabelAll');
  const summaryText = `${gs.currentLevel!.displayName} / 用時 ${formatSeconds(gs.seconds)} / ${filterLabel} ${filtered.length}/${gs.actionHistory.length}`;
  bridgeSetReplaySummary(summaryText);

  if (!filtered.length) {
    bridgeSetReplayListHtml(`<div class="replay-item">${t('replayRuntime.noStepsForFilter')}</div>`);
    return;
  }
  const html = filtered
    .map((a: ActionRecord, i: number) => {
      const isMistake = a.type === 'mistake';
      const isElim = a.type === 'eliminate';
      const cls = isMistake
        ? 'replay-item replay-item-mistake'
        : isElim
          ? 'replay-item replay-item-elim'
          : 'replay-item';
      // Find the absolute index in actionHistory for click-to-jump
      const absIdx = gs.actionHistory.indexOf(a);
      return `<div class="${cls}" data-step="${absIdx + 1}"><span class="replay-time">${formatSeconds(a.t)}</span>#${i + 1} ${a.detail}</div>`;
    })
    .join('');

  bridgeSetReplayListHtml(html);
}

export function openReplayModal(): void {
  recordReplayWatch();
  gs.replayFilter = 'all';
  syncReplayFilterButtons();
  renderReplayList();
  syncReplayDiagnosis();
  replayOpen();
  bridgeOpenReplay();
}

export function openHistoricalReplay(levelId: number, savedHistory: ActionRecord[] | null | undefined): void {
  const levels = getAllLevels();
  const level = levels.find((l) => l.id === levelId) || levels[0];
  if (!level) return;
  gs.currentLevel = level;
  gs.actionHistory = Array.isArray(savedHistory) ? savedHistory : [];
  gs.cellsData = gs.currentLevel.puzzle.map((val: number) => ({
    value: val,
    fixed: val !== 0,
    notes: [],
    isError: false,
  }));

  closePreLevel('system');
  openReplayModal();
}

export function closeReplayModal(): void {
  replayPause();
  bridgeSetReplayDiagnosis(null);
  bridgeCloseReplay();
}

export function replayOpen(): void {
  _replayTechniqueLog = [];
  gs.rbState = gs.currentLevel!.puzzle.map((v: number): ReplayCellState => ({ value: v, fixed: v !== 0, notes: [] }));
  gs.rbStepIdx = 0;
  gs.rbIsPlaying = false;
  gs.rbSpeed = 1;
  bridgeSetReplayPlayback({ speed: 1 });
  replayRenderBoard(-1, null);
  replayUpdateStepInfo();
  replayUpdateButtons();
}

export function replayBuildStateAtStep(targetStep: number): ReplayCellState[] {
  const state: ReplayCellState[] = gs.currentLevel!.puzzle.map(
    (v: number): ReplayCellState => ({ value: v, fixed: v !== 0, notes: [] }),
  );
  for (let i = 0; i < targetStep && i < gs.actionHistory.length; i++) {
    replayApplyActionToState(state, gs.actionHistory[i]);
  }
  return state;
}

export function replayApplyActionToState(state: ReplayCellState[], action: ActionRecord): void {
  const { type, idx, val, notes } = action;
  if (idx === null || idx === undefined) return;
  if (type === 'fill') {
    state[idx].value = val ?? 0;
    state[idx].notes = [];
  } else if (type === 'erase') {
    state[idx].value = 0;
    state[idx].notes = [];
  } else if (type === 'note' && notes !== null) {
    state[idx].notes = notes.slice();
  } else if (type === 'eliminate' && val != null) {
    // Remove a specific candidate from cell's notes
    const ni = state[idx].notes.indexOf(val);
    if (ni > -1) state[idx].notes.splice(ni, 1);
  }
  // mistake: mark for visual but don't persist value
  if (type === 'mistake') {
    state[idx]._mistake = true;
    state[idx]._mistakeVal = val;
  }
}

export function replayRenderBoard(highlightIdx: number, _action: ActionRecord | null): void {
  const boardEl = document.getElementById('replay-board');
  if (!boardEl) return;

  // Incremental update: only re-render changed cells instead of full innerHTML rebuild
  const needsFullRender = boardEl.children.length !== 81;

  if (needsFullRender) {
    boardEl.innerHTML = '';
  }

  gs.rbState.forEach((cell: ReplayCellState, i: number) => {
    let div: HTMLElement;
    if (needsFullRender) {
      div = document.createElement('div');
      div.className = 'rb-cell';
      const row = Math.floor(i / 9),
        col = i % 9;
      if (col === 2 || col === 5) div.classList.add('rb-box-border-right');
      if (row === 2 || row === 5) div.classList.add('rb-box-border-bottom');
      boardEl.appendChild(div);
    } else {
      div = boardEl.children[i] as HTMLElement;
    }

    // Reset dynamic classes
    div.classList.remove('rb-fill', 'rb-fixed', 'rb-active', 'rb-mistake');

    if (cell.fixed) {
      div.classList.add('rb-fixed');
      div.textContent = String(cell.value);
    } else if (cell._mistake) {
      // Show mistake value with error styling
      div.classList.add('rb-mistake');
      div.textContent = String(cell._mistakeVal || '?');
      // Clear the transient mistake flag
      cell._mistake = false;
      cell._mistakeVal = null;
    } else if (cell.value !== 0) {
      div.classList.add('rb-fill');
      div.textContent = String(cell.value);
    } else if (cell.notes && cell.notes.length) {
      div.innerHTML = '';
      const ng = document.createElement('div');
      ng.className = 'rb-notes';
      ng.textContent = cell.notes.join(' ');
      div.appendChild(ng);
    } else {
      div.textContent = '';
    }

    if (i === highlightIdx) {
      div.classList.add('rb-active');
    }
  });

  updateProgressBar();
}

function updateProgressBar(): void {
  const pct = gs.actionHistory.length > 0 ? (gs.rbStepIdx / gs.actionHistory.length) * 100 : 0;
  bridgeSetReplayPlayback({ progressPct: pct });
  // Also update the DOM element directly for immediate visual feedback
  const bar = document.getElementById('rb-progress-fill');
  if (bar) bar.style.width = `${pct}%`;
}

export function replayUpdateStepInfo(technique = ''): void {
  const stepText = t('replayRuntime.stepLabel', {
    current: String(gs.rbStepIdx),
    total: String(gs.actionHistory.length),
  });
  let html: string;
  if (technique) {
    html = `${stepText}<span class="replay-technique">${technique}</span>`;
  } else {
    html = stepText;
  }
  bridgeSetReplayPlayback({ stepInfoHtml: html });
  updateProgressBar();
}

export function replayUpdateButtons(): void {
  const prevDisabled = gs.rbStepIdx <= 0;
  const nextDisabled = gs.rbStepIdx >= gs.actionHistory.length;
  bridgeSetReplayPlayback({
    prevDisabled,
    nextDisabled,
    isPlaying: gs.rbIsPlaying,
  });
}

export function replayStepForward(): void {
  if (gs.rbStepIdx >= gs.actionHistory.length) {
    replayPause();
    return;
  }
  const action = gs.actionHistory[gs.rbStepIdx];

  // Detect technique BEFORE applying the action (on the pre-move state)
  let techniqueName = '';
  let detectedTechnique: TechniqueName | null = null;
  if ((action.type === 'fill' || action.type === 'eliminate') && action.idx != null && action.val != null) {
    const prevState = replayBuildStateAtStep(gs.rbStepIdx);
    const kind = action.type === 'fill' ? 'fill' : 'eliminate';
    const answer = detectTechnique(
      prevState.map((c) => ({ value: c.value, fixed: c.fixed, notes: c.notes || [], isError: false })),
      { kind, cell: action.idx, digit: action.val },
    );
    if (answer) {
      techniqueName = answer.description;
      detectedTechnique = answer.technique;
    }
  }

  // Log for scoring
  _replayTechniqueLog.push({ type: action.type, technique: detectedTechnique });

  gs.rbState = replayBuildStateAtStep(gs.rbStepIdx + 1);
  gs.rbStepIdx++;
  const highlightIdx = action.idx !== null && action.idx !== undefined ? action.idx : -1;
  replayRenderBoard(highlightIdx, action);
  replayUpdateStepInfo(techniqueName);
  replayUpdateButtons();
  highlightReplayListItem();

  // Show score when replay reaches the end
  if (gs.rbStepIdx >= gs.actionHistory.length) {
    showReplayScore();
  }
}

export function replayStepBack(): void {
  if (gs.rbStepIdx <= 0) return;
  gs.rbStepIdx--;
  gs.rbState = replayBuildStateAtStep(gs.rbStepIdx);
  const highlightIdx = gs.rbStepIdx > 0 ? (gs.actionHistory[gs.rbStepIdx - 1].idx ?? -1) : -1;
  replayRenderBoard(highlightIdx, null);
  replayUpdateStepInfo();
  replayUpdateButtons();
  highlightReplayListItem();
}

export function replayPause(): void {
  if (gs.rbTimer) {
    clearInterval(gs.rbTimer);
    gs.rbTimer = null;
  }
  gs.rbIsPlaying = false;
  replayUpdateButtons();
}

export function replayPlay(): void {
  if (gs.rbStepIdx >= gs.actionHistory.length) replayReset();
  gs.rbIsPlaying = true;
  replayUpdateButtons();
  gs.rbTimer = setInterval(
    () => {
      if (gs.rbStepIdx >= gs.actionHistory.length) {
        replayPause();
      } else {
        replayStepForward();
      }
    },
    Math.round(RB_BASE_INTERVAL / gs.rbSpeed),
  );
}

export function replayTogglePlay(): void {
  if (gs.rbIsPlaying) replayPause();
  else replayPlay();
}

export function replayReset(): void {
  replayPause();
  gs.rbStepIdx = 0;
  gs.rbState = gs.currentLevel!.puzzle.map((v: number): ReplayCellState => ({ value: v, fixed: v !== 0, notes: [] }));
  replayRenderBoard(-1, null);
  replayUpdateStepInfo();
  replayUpdateButtons();
  highlightReplayListItem();
}

export function replayToggleSpeed(): void {
  const speeds = [1, 2, 4];
  gs.rbSpeed = speeds[(speeds.indexOf(gs.rbSpeed) + 1) % speeds.length];
  bridgeSetReplayPlayback({ speed: gs.rbSpeed });
  if (gs.rbIsPlaying) {
    replayPause();
    replayPlay();
  }
}

// ── Jump to specific step (from text list click) ────────────────
export function replayJumpToStep(step: number): void {
  replayPause();
  gs.rbStepIdx = step;
  gs.rbState = replayBuildStateAtStep(step);
  const action = step > 0 ? gs.actionHistory[step - 1] : null;
  const highlightIdx = action ? (action.idx ?? -1) : -1;
  replayRenderBoard(highlightIdx, action);
  replayUpdateStepInfo();
  replayUpdateButtons();
  highlightReplayListItem();
}

// ── Highlight active step in text list ──────────────────────────
function highlightReplayListItem(): void {
  const listEl = document.getElementById('replay-list');
  if (!listEl) return;
  listEl.querySelectorAll('.replay-item').forEach((el) => {
    const step = parseInt((el as HTMLElement).dataset.step || '0');
    el.classList.toggle('replay-item-active', step === gs.rbStepIdx);
  });
}

// ── Animated score reveal at end of replay ──────────────────────

function showReplayScore(): void {
  const errors = gs.actionHistory.filter((a) => a.type === 'mistake').length;
  const score = computeReplayScore(_replayTechniqueLog, gs.seconds, errors);

  const gradeColors: Record<string, string> = {
    S: 'var(--star-color)',
    A: 'var(--accent-strong)',
    B: 'var(--success-color)',
    C: 'var(--partial-color)',
    D: 'var(--text-light)',
  };
  const gradeColor = gradeColors[score.grade] || 'var(--text-main)';

  // Build rows for staggered reveal
  const rows: { label: string; points: number; penalty: boolean }[] = [];
  for (const b of score.breakdown.slice(0, 6)) {
    const label =
      b.technique === 'guess'
        ? t('replayRuntime.scoreGuess')
        : b.technique === 'mistake'
          ? t('replayRuntime.scoreMistake')
          : b.technique;
    rows.push({ label: `${label} ×${b.count}`, points: b.points, penalty: b.points < 0 });
  }
  if (score.speedBonus > 0)
    rows.push({ label: t('replayRuntime.scoreSpeedBonus'), points: score.speedBonus, penalty: false });
  if (score.accuracyBonus > 0)
    rows.push({ label: t('replayRuntime.scoreAccuracyBonus'), points: score.accuracyBonus, penalty: false });

  const rowsHtml = rows
    .map(
      (r, i) =>
        `<div class="score-row score-row-hidden" style="animation-delay:${300 + i * 120}ms">` +
        `<span>${r.label}</span>` +
        `<span class="${r.penalty ? 'score-penalty' : 'score-bonus'}">${r.points >= 0 ? '+' : ''}${r.points}</span>` +
        `</div>`,
    )
    .join('');

  const totalDelay = 300 + rows.length * 120 + 200;
  const gradeDelay = totalDelay + 600;

  const html = `
    <div class="replay-score">
      <div class="replay-score-grade score-grade-hidden" style="color:${gradeColor};animation-delay:${gradeDelay}ms">${score.grade}</div>
      <div class="replay-score-counter" id="score-counter" data-target="${score.total}" style="animation-delay:${totalDelay}ms">0</div>
      <div class="replay-score-breakdown">${rowsHtml}</div>
    </div>
  `;

  bridgeSetReplayPlayback({ stepInfoHtml: html });

  // Start counting animation after rows finish appearing
  setTimeout(() => animateCounter(score.total, totalDelay > 0 ? 800 : 400), totalDelay);

  // Play grade sound
  setTimeout(() => {
    import('../game/audio')
      .then((audio) => {
        if (score.grade === 'S' || score.grade === 'A') {
          audio.playWinSound();
        } else {
          audio.playUnitCompleteSound();
        }
      })
      .catch(() => {});
    vibrate(score.grade === 'S' ? [20, 40, 20, 40, 20, 60, 40] : [15, 30, 15]);
  }, gradeDelay);

  // Play tick sound for each row appearance
  rows.forEach((r, i) => {
    setTimeout(
      () => {
        import('../game/audio')
          .then((audio) => {
            if (r.penalty) audio.playErrorFeedback();
            else audio.playFillSound();
          })
          .catch(() => {});
      },
      300 + i * 120,
    );
  });
}

function animateCounter(target: number, duration: number): void {
  const el = document.getElementById('score-counter');
  if (!el) return;
  const start = performance.now();
  const from = 0;

  function tick(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    el!.textContent = t('replayRuntime.scorePoints', { points: String(current) });
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
