// Replay engine — visual replay board + text replay list

import { gs } from '../game/state';
import { formatSeconds } from '../game/utils';
import { getAllLevels } from '../data/dataRegistry';
import { detectTechnique } from '../solver/techniqueDetector';
import { computeReplayScore, type ReplayScore } from '../solver/scoring';

const RB_BASE_INTERVAL = 700;

// Score tracking during replay
let replayTechniqueLog: { type: string; technique?: string | null }[] = [];

export function isKeyReplayAction(a: any): boolean {
  return ['fill', 'mistake', 'eliminate', 'quick_note'].includes(a.type);
}

export function getFilteredReplayActions(): any[] {
  if (gs.replayFilter === 'mistake') return gs.actionHistory.filter((a: any) => a.type === 'mistake');
  if (gs.replayFilter === 'key') return gs.actionHistory.filter(isKeyReplayAction);
  return gs.actionHistory;
}

export function syncReplayFilterButtons(): void {
  if (!gs.replayFilterAllBtn) return;
  gs.replayFilterAllBtn.classList.toggle('active', gs.replayFilter === 'all');
  gs.replayFilterMistakeBtn!.classList.toggle('active', gs.replayFilter === 'mistake');
  gs.replayFilterKeyBtn!.classList.toggle('active', gs.replayFilter === 'key');
}

export function setReplayFilter(filterKey: 'all' | 'mistake' | 'key'): void {
  gs.replayFilter = filterKey;
  syncReplayFilterButtons();
  renderReplayList();
}

export function renderReplayList(): void {
  const filtered = getFilteredReplayActions();
  const filterLabel = gs.replayFilter === 'mistake' ? '錯誤步驟' : gs.replayFilter === 'key' ? '關鍵步驟' : '全部步驟';
  gs.replaySummaryEl!.textContent = `${gs.currentLevel!.displayName} / 用時 ${formatSeconds(gs.seconds)} / ${filterLabel} ${filtered.length}/${gs.actionHistory.length}`;

  if (!filtered.length) {
    gs.replayListEl!.innerHTML = '<div class="replay-item">此篩選下暫無步驟</div>';
    return;
  }
  gs.replayListEl!.innerHTML = filtered
    .map((a: any, i: number) => {
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

  // Click-to-jump on replay items
  gs.replayListEl!.querySelectorAll('.replay-item[data-step]').forEach((el) => {
    el.addEventListener('click', () => {
      const step = parseInt((el as HTMLElement).dataset.step || '0');
      if (step > 0) replayJumpToStep(step);
    });
  });
}

export function openReplayModal(): void {
  if (!gs.replayModalEl) return;
  gs.replayFilter = 'all';
  syncReplayFilterButtons();
  renderReplayList();
  replayOpen();
  gs.replayModalEl.classList.add('show');
}

export function openHistoricalReplay(levelId: number, savedHistory: any[]): void {
  const levels = getAllLevels();
  gs.currentLevel = levels.find((l) => l.id === levelId) || levels[0];
  gs.actionHistory = savedHistory;
  gs.cellsData = gs.currentLevel.puzzle.map((val: number) => ({
    value: val,
    fixed: val !== 0,
    notes: [],
    isError: false,
  }));

  document.getElementById('pre-level-modal')!.style.display = 'none';
  openReplayModal();
}

export function closeReplayModal(): void {
  if (!gs.replayModalEl) return;
  replayPause();
  gs.replayModalEl.classList.remove('show');
}

export function replayOpen(): void {
  replayTechniqueLog = [];
  gs.rbState = gs.currentLevel!.puzzle.map((v: number) => ({ value: v, fixed: v !== 0, notes: [] }));
  gs.rbStepIdx = 0;
  gs.rbIsPlaying = false;
  gs.rbSpeed = 1;
  document.getElementById('rb-speed-btn')!.textContent = '1x';
  replayRenderBoard(-1, null);
  replayUpdateStepInfo();
  replayUpdateButtons();
}

export function replayBuildStateAtStep(targetStep: number): any[] {
  const state = gs.currentLevel!.puzzle.map((v: number) => ({ value: v, fixed: v !== 0, notes: [] }));
  for (let i = 0; i < targetStep && i < gs.actionHistory.length; i++) {
    replayApplyActionToState(state, gs.actionHistory[i]);
  }
  return state;
}

export function replayApplyActionToState(state: any[], action: any): void {
  const { type, idx, val, notes } = action;
  if (idx === null || idx === undefined) return;
  if (type === 'fill') {
    state[idx].value = val;
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

export function replayRenderBoard(highlightIdx: number, _action: any | null): void {
  const boardEl = document.getElementById('replay-board');
  if (!boardEl) return;

  // Incremental update: only re-render changed cells instead of full innerHTML rebuild
  const needsFullRender = boardEl.children.length !== 81;

  if (needsFullRender) {
    boardEl.innerHTML = '';
  }

  gs.rbState.forEach((cell: any, i: number) => {
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
  const bar = document.getElementById('rb-progress-fill');
  if (!bar) return;
  const pct = gs.actionHistory.length > 0 ? (gs.rbStepIdx / gs.actionHistory.length) * 100 : 0;
  bar.style.width = `${pct}%`;
}

export function replayUpdateStepInfo(technique = ''): void {
  const el = document.getElementById('replay-step-info');
  if (!el) return;
  const stepText = `步驟 ${gs.rbStepIdx} / ${gs.actionHistory.length}`;
  if (technique) {
    el.innerHTML = `${stepText}<span class="replay-technique">${technique}</span>`;
  } else {
    el.textContent = stepText;
  }
  updateProgressBar();
}

export function replayUpdateButtons(): void {
  const prevBtn = document.getElementById('rb-prev-btn') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('rb-next-btn') as HTMLButtonElement | null;
  const playBtn = document.getElementById('rb-play-btn') as HTMLButtonElement | null;
  if (prevBtn) prevBtn.disabled = gs.rbStepIdx <= 0;
  if (nextBtn) nextBtn.disabled = gs.rbStepIdx >= gs.actionHistory.length;
  if (playBtn) {
    playBtn.textContent = gs.rbIsPlaying ? '⏸ 暫停' : '▶ 播放';
    playBtn.classList.toggle('active', gs.rbIsPlaying);
  }
}

export function replayStepForward(): void {
  if (gs.rbStepIdx >= gs.actionHistory.length) {
    replayPause();
    return;
  }
  const action = gs.actionHistory[gs.rbStepIdx];

  // Detect technique BEFORE applying the action (on the pre-move state)
  let techniqueName = '';
  let detectedTechnique: string | null = null;
  if ((action.type === 'fill' || action.type === 'eliminate') && action.idx != null && action.val != null) {
    const prevState = replayBuildStateAtStep(gs.rbStepIdx);
    const kind = action.type === 'fill' ? 'fill' : 'eliminate';
    const answer = detectTechnique(
      prevState.map((c: any) => ({ value: c.value, fixed: c.fixed, notes: c.notes || [], isError: false })),
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
  gs.rbState = gs.currentLevel!.puzzle.map((v: number) => ({ value: v, fixed: v !== 0, notes: [] }));
  replayRenderBoard(-1, null);
  replayUpdateStepInfo();
  replayUpdateButtons();
  highlightReplayListItem();
}

export function replayToggleSpeed(): void {
  const speeds = [1, 2, 4];
  gs.rbSpeed = speeds[(speeds.indexOf(gs.rbSpeed) + 1) % speeds.length];
  const speedBtn = document.getElementById('rb-speed-btn');
  if (speedBtn) speedBtn.textContent = `${gs.rbSpeed}x`;
  if (gs.rbIsPlaying) {
    replayPause();
    replayPlay();
  }
}

// ── Jump to specific step (from text list click) ────────────────
function replayJumpToStep(step: number): void {
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
  if (!gs.replayListEl) return;
  gs.replayListEl.querySelectorAll('.replay-item').forEach((el) => {
    const step = parseInt((el as HTMLElement).dataset.step || '0');
    el.classList.toggle('replay-item-active', step === gs.rbStepIdx);
  });
}

// ── Score display at end of replay ─────────────────────────────
function showReplayScore(): void {
  const errors = gs.actionHistory.filter((a: any) => a.type === 'mistake').length;
  const score = computeReplayScore(replayTechniqueLog as any, gs.seconds, errors);

  const el = document.getElementById('replay-step-info');
  if (!el) return;

  const gradeColors: Record<string, string> = {
    S: 'var(--star-color)',
    A: 'var(--accent-strong)',
    B: 'var(--success-color)',
    C: 'var(--partial-color)',
    D: 'var(--text-light)',
  };
  const gradeColor = gradeColors[score.grade] || 'var(--text-main)';

  let breakdownHtml = score.breakdown
    .slice(0, 5)
    .map((b) => {
      const sign = b.points >= 0 ? '+' : '';
      const label = b.technique === 'guess' ? '猜測' : b.technique === 'mistake' ? '失誤' : b.technique;
      return `<span class="score-row"><span>${label} ×${b.count}</span><span>${sign}${b.points}</span></span>`;
    })
    .join('');

  if (score.speedBonus > 0) {
    breakdownHtml += `<span class="score-row"><span>速度加成</span><span>+${score.speedBonus}</span></span>`;
  }
  if (score.accuracyBonus > 0) {
    breakdownHtml += `<span class="score-row"><span>零失誤加成</span><span>+${score.accuracyBonus}</span></span>`;
  }

  el.innerHTML = `
    <div class="replay-score">
      <div class="replay-score-grade" style="color:${gradeColor}">${score.grade}</div>
      <div class="replay-score-total">${score.total} 分</div>
      <div class="replay-score-breakdown">${breakdownHtml}</div>
    </div>
  `;
}
