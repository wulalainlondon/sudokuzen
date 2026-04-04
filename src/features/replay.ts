// Replay engine — visual replay board + text replay list

import { gs, type ActionRecord, type ReplayCellState } from '../game/state';
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
  bridgeSetReplayFilter,
  bridgeSetReplaySummary,
  bridgeSetReplayListHtml,
  bridgeSetReplayPlayback,
} from '../react/replay/replayBridge';

const RB_BASE_INTERVAL = 700;

// Score tracking during replay
let replayTechniqueLog: { type: string; technique?: TechniqueName | null }[] = [];

export function isKeyReplayAction(a: ActionRecord): boolean {
  return ['fill', 'mistake', 'eliminate', 'quick_note'].includes(a.type);
}

export function getFilteredReplayActions(): ActionRecord[] {
  if (gs.replayFilter === 'mistake') return gs.actionHistory.filter((a) => a.type === 'mistake');
  if (gs.replayFilter === 'key') return gs.actionHistory.filter(isKeyReplayAction);
  return gs.actionHistory;
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
  const filtered = getFilteredReplayActions();
  const filterLabel = gs.replayFilter === 'mistake' ? t('replayRuntime.filterLabelMistake') : gs.replayFilter === 'key' ? t('replayRuntime.filterLabelKey') : t('replayRuntime.filterLabelAll');
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
  replayOpen();
  bridgeOpenReplay();
}

export function openHistoricalReplay(levelId: number, savedHistory: ActionRecord[]): void {
  const levels = getAllLevels();
  gs.currentLevel = levels.find((l) => l.id === levelId) || levels[0];
  gs.actionHistory = savedHistory;
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
  bridgeCloseReplay();
}

export function replayOpen(): void {
  replayTechniqueLog = [];
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
  const state: ReplayCellState[] = gs.currentLevel!.puzzle.map((v: number): ReplayCellState => ({ value: v, fixed: v !== 0, notes: [] }));
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
  const stepText = t('replayRuntime.stepLabel', { current: String(gs.rbStepIdx), total: String(gs.actionHistory.length) });
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
  replayTechniqueLog.push({ type: action.type, technique: detectedTechnique });

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
  const score = computeReplayScore(replayTechniqueLog, gs.seconds, errors);

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
    const label = b.technique === 'guess' ? t('replayRuntime.scoreGuess') : b.technique === 'mistake' ? t('replayRuntime.scoreMistake') : b.technique;
    rows.push({ label: `${label} ×${b.count}`, points: b.points, penalty: b.points < 0 });
  }
  if (score.speedBonus > 0) rows.push({ label: t('replayRuntime.scoreSpeedBonus'), points: score.speedBonus, penalty: false });
  if (score.accuracyBonus > 0) rows.push({ label: t('replayRuntime.scoreAccuracyBonus'), points: score.accuracyBonus, penalty: false });

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
    import('../game/audio').then((audio) => {
      if (score.grade === 'S' || score.grade === 'A') {
        audio.playWinSound();
      } else {
        audio.playUnitCompleteSound();
      }
    }).catch(() => {});
    if (navigator.vibrate) {
      navigator.vibrate(score.grade === 'S' ? [20, 40, 20, 40, 20, 60, 40] : [15, 30, 15]);
    }
  }, gradeDelay);

  // Play tick sound for each row appearance
  rows.forEach((r, i) => {
    setTimeout(
      () => {
        import('../game/audio').then((audio) => {
          if (r.penalty) audio.playErrorFeedback();
          else audio.playFillSound();
        }).catch(() => {});
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
