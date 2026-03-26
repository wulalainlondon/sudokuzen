// Replay engine — visual replay board + text replay list
// Extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { formatSeconds } from '../game/utils';
import { getAllLevels } from '../data/dataRegistry';

const RB_BASE_INTERVAL = 700; // ms per step at 1x speed

export function isKeyReplayAction(a: any): boolean {
  return ['fill', 'mistake', 'quick_note'].includes(a.type);
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
    .map(
      (a: any, i: number) =>
        `<div class="replay-item"><span class="replay-time">${formatSeconds(a.t)}</span>#${i + 1} ${a.detail}</div>`,
    )
    .join('');
}

export function openReplayModal(): void {
  if (!gs.replayModalEl) return;
  gs.replayFilter = 'all';
  syncReplayFilterButtons();
  renderReplayList();
  replayOpen();
  gs.replayModalEl.style.display = 'flex';
}

export function openHistoricalReplay(levelId: number, savedHistory: any[]): void {
  const levels = getAllLevels();
  gs.currentLevel = levels.find((l) => l.id === levelId) || levels[0];
  gs.actionHistory = savedHistory;
  // Clean slate for cellsData so the UI can rebuild it cleanly
  gs.cellsData = gs.currentLevel.puzzle.map((val: number) => ({
    value: val,
    fixed: val !== 0,
    notes: [] as number[],
    isError: false,
  }));

  document.getElementById('pre-level-modal')!.style.display = 'none';
  openReplayModal();
}

export function closeReplayModal(): void {
  if (!gs.replayModalEl) return;
  replayPause();
  gs.replayModalEl.style.display = 'none';
}

export function replayOpen(): void {
  // Build initial state from current level puzzle
  gs.rbState = gs.currentLevel!.puzzle.map((v: number) => ({ value: v, fixed: v !== 0, notes: [] }));
  gs.rbStepIdx = 0;
  gs.rbIsPlaying = false;
  gs.rbSpeed = 1;
  document.getElementById('rb-speed-btn')!.textContent = '1x';
  replayRenderBoard(-1);
  replayUpdateStepInfo();
  replayUpdateButtons();
}

export function replayBuildStateAtStep(targetStep: number): any[] {
  // Rebuild from scratch up to targetStep
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
  }
  // 'mistake' → show value temporarily but don't permanently fill
}

export function replayRenderBoard(highlightIdx: number): void {
  const boardEl = document.getElementById('replay-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  gs.rbState.forEach((cell: any, i: number) => {
    const div = document.createElement('div');
    div.className = 'rb-cell';
    const row = Math.floor(i / 9),
      col = i % 9;
    if (col === 2 || col === 5) div.classList.add('rb-box-border-right');
    if (row === 2 || row === 5) div.classList.add('rb-box-border-bottom');
    if (cell.fixed) {
      div.classList.add('rb-fixed');
      div.textContent = cell.value;
    } else if (cell.value !== 0) {
      div.classList.add('rb-fill');
      div.textContent = cell.value;
    } else if (cell.notes.length) {
      div.style.fontSize = 'clamp(0.28rem, 1vw, 0.4rem)';
      div.style.lineHeight = '1';
      div.style.flexWrap = 'wrap';
      div.style.padding = '1px';
      div.textContent = cell.notes.join(' ');
    }
    if (i === highlightIdx) div.classList.add('rb-active');
    boardEl.appendChild(div);
  });
}

export function replayUpdateStepInfo(): void {
  const el = document.getElementById('replay-step-info');
  if (el) el.textContent = `步驟 ${gs.rbStepIdx} / ${gs.actionHistory.length}`;
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
  gs.rbState = replayBuildStateAtStep(gs.rbStepIdx + 1);
  gs.rbStepIdx++;
  const highlightIdx = action.idx !== null && action.idx !== undefined ? action.idx : -1;
  replayRenderBoard(highlightIdx);
  replayUpdateStepInfo();
  replayUpdateButtons();
}

export function replayStepBack(): void {
  if (gs.rbStepIdx <= 0) return;
  gs.rbStepIdx--;
  gs.rbState = replayBuildStateAtStep(gs.rbStepIdx);
  const highlightIdx = gs.rbStepIdx > 0 ? (gs.actionHistory[gs.rbStepIdx - 1].idx ?? -1) : -1;
  replayRenderBoard(highlightIdx);
  replayUpdateStepInfo();
  replayUpdateButtons();
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
  replayRenderBoard(-1);
  replayUpdateStepInfo();
  replayUpdateButtons();
}

export function replayToggleSpeed(): void {
  const speeds = [1, 2, 4];
  gs.rbSpeed = speeds[(speeds.indexOf(gs.rbSpeed) + 1) % speeds.length];
  const speedBtn = document.getElementById('rb-speed-btn');
  if (speedBtn) speedBtn.textContent = `${gs.rbSpeed}x`;
  // Restart timer at new speed if playing
  if (gs.rbIsPlaying) {
    replayPause();
    replayPlay();
  }
}
