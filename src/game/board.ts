// Board rendering, cell selection, numpad

import { gs } from './state';
import type { CellData } from './state';
import { SK } from '../storage/keys';
import { playCellSelectSound } from './audio';
import { showFeedback } from '../ui/feedback';
import { t } from '../i18n/t';
import { showUnitAnalysis, hideUnitAnalysis } from './unitAnalysisPanel';

// ── Callback hooks (injected by core.ts to avoid circular imports) ───
let _onContinuousCellClick: ((idx: number) => boolean) | null = null;
let _onContinuousDigitSet: ((digit: number) => void) | null = null;
let _onCandidateProbeTap: ((cell: number, digit: number) => void) | null = null;
let _onCellLongPress: ((idx: number, prevSelected: number) => void) | null = null;
let _onSkillModeExit: (() => void) | null = null;
let _onSlCellFocus: ((idx: number) => void) | null = null;

export function setBoardCallbacks(callbacks: {
  onContinuousCellClick: (idx: number) => boolean;
  onContinuousDigitSet: (digit: number) => void;
  onCandidateProbeTap: (cell: number, digit: number) => void;
  onCellLongPress: (idx: number, prevSelected: number) => void;
  onSkillModeExit: () => void;
  onSlCellFocus?: (idx: number) => void;
}): void {
  _onContinuousCellClick = callbacks.onContinuousCellClick;
  _onContinuousDigitSet = callbacks.onContinuousDigitSet;
  _onCandidateProbeTap = callbacks.onCandidateProbeTap;
  _onCellLongPress = callbacks.onCellLongPress;
  _onSkillModeExit = callbacks.onSkillModeExit;
  _onSlCellFocus = callbacks.onSlCellFocus ?? null;
}

export function renderGrid(): void {
  if (!gs.gridEl) return;
  gs.gridEl.innerHTML = '';
  gs.cellsData.forEach((data, i) => {
    const cell = document.createElement('div');
    cell.dataset.idx = String(i);
    cell.className = `cell ${data.fixed ? 'is-fixed' : ''} ${data.isError ? 'error' : ''}`;
    updateCellDisplay(cell, data);
    // ── Long-press detection for skill mode ──
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    let lpFired = false;
    cell.addEventListener('pointerdown', (ev) => {
      if (ev && ev.button !== undefined && ev.button !== 0) return;
      lpFired = false;

      // Capture the previously selected cell BEFORE selectCell changes it
      const prevSelected = gs.selectedIdx;

      // Start long-press timer for skill mode:
      // - Two-cell: empty cell + different cell already selected → domain expansion
      // - Single-cell: empty cell, no prior selection → quick cast (naked/hidden single)
      const cellData = gs.cellsData[i];
      if (cellData && cellData.value === 0) {
        if (prevSelected !== null && prevSelected !== i) {
          lpTimer = setTimeout(() => {
            lpFired = true;
            _onCellLongPress?.(i, prevSelected);
          }, 300);
        } else if (prevSelected === null || prevSelected === i) {
          lpTimer = setTimeout(() => {
            lpFired = true;
            _onCellLongPress?.(i, -1); // -1 signals single-cell quick cast
          }, 300);
        }
      }

      // In continuous fill mode
      if (gs.continuousFillDigit !== null && gs.continuousFillDigit >= 1) {
        const cellVal = gs.cellsData[i].value;
        if (cellVal !== 0) {
          _onContinuousDigitSet?.(cellVal);
          selectCell(i);
        } else {
          if (!_onContinuousCellClick?.(i)) selectCell(i);
        }
      } else {
        selectCell(i);
      }
    });
    cell.addEventListener('pointerup', () => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      // Normal tap while skill mode is active → exit skill mode
      if (!lpFired && gs.skillMode.enabled) {
        _onSkillModeExit?.();
      }
    });
    cell.addEventListener('pointerleave', () => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
    });
    gs.gridEl!.appendChild(cell);
  });
  updateNumpadState();
}

export function updateCellDisplay(cell: HTMLElement, data: CellData): void {
  const prevText = cell.textContent;
  cell.innerHTML = '';
  if (data.value !== 0) {
    cell.textContent = String(data.value);
    if (!data.fixed) {
      cell.classList.add('user-val');
      // Trigger fill pop-in if value just changed
      if (prevText !== String(data.value)) {
        cell.classList.remove('fill-pop');
        void cell.offsetWidth;
        cell.classList.add('fill-pop');
      }
    } else {
      cell.classList.remove('user-val');
    }
  } else {
    const ng = document.createElement('div');
    ng.className = 'notes-grid';
    const cellIdx = Number(cell.dataset.idx ?? '-1');
    for (let n = 1; n <= 9; n++) {
      const nd = document.createElement('div');
      nd.className = `note-num ${data.notes.includes(n) ? 'active' : ''}`;
      nd.dataset.cell = String(cellIdx);
      nd.dataset.digit = String(n);
      nd.textContent = String(n);
      nd.addEventListener('pointerdown', () => {
        if (!data.notes.includes(n) || !Number.isInteger(cellIdx) || cellIdx < 0) return;
        _onCandidateProbeTap?.(cellIdx, n);
      });
      ng.appendChild(nd);
    }
    cell.appendChild(ng);
  }
}

export function selectCell(idx: number): void {
  gs.selectedIdx = idx;
  if (!gs.gridEl) return;
  playCellSelectSound();
  const selectedVal = gs.cellsData[idx].value;
  // In continuous mode, highlight the locked digit; otherwise use selected cell's value
  const highlightDigit = gs.continuousFillDigit && gs.continuousFillDigit >= 1 ? gs.continuousFillDigit : selectedVal;
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);

  Array.from(gs.gridEl.children).forEach((c, i) => {
    c.classList.remove('selected', 'related', 'match', 'note-match');
    // Clear previous note highlights
    c.querySelectorAll('.note-num.note-highlight').forEach((n) => n.classList.remove('note-highlight'));

    const r = Math.floor(i / 9);
    const l = i % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(l / 3);
    const cell = gs.cellsData[i];

    if (i === idx) {
      c.classList.add('selected');
    } else {
      if (r === row || l === col || b === box) c.classList.add('related');
      // Match filled value
      if (highlightDigit !== 0 && cell.value === highlightDigit) {
        c.classList.add('match');
      }
      // Match in notes
      if (highlightDigit !== 0 && cell.value === 0 && cell.notes.includes(highlightDigit)) {
        c.classList.add('note-match');
        const noteEl = c.querySelector(`.note-num:nth-child(${highlightDigit})`);
        if (noteEl) noteEl.classList.add('note-highlight');
      }
    }
  });

  // Notify strong link panel when it's open
  if (gs.strongLinkPanelOpen) _onSlCellFocus?.(idx);

  // Show unit analysis panel when selecting a filled cell in Wild mode (opt-in)
  const isWild = !!(gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild');
  const uaEnabled = localStorage.getItem(SK.UNIT_ANALYSIS) === '1';
  const isFilled = gs.cellsData[idx].value !== 0;
  const inSpecialMode = gs.skillMode?.enabled || (gs.continuousFillDigit !== null && gs.continuousFillDigit >= 1);
  if (isWild && uaEnabled && isFilled && !inSpecialMode) {
    showUnitAnalysis(idx);
  } else {
    hideUnitAnalysis();
  }
}

export function getUnitIndices(idx: number): {
  rowIndices: number[];
  colIndices: number[];
  boxIndices: number[];
} {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const rowIndices = Array.from({ length: 9 }, (_, i) => row * 9 + i);
  const colIndices = Array.from({ length: 9 }, (_, i) => i * 9 + col);
  const boxIndices: number[] = [];
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      boxIndices.push(r * 9 + c);
    }
  }
  return { rowIndices, colIndices, boxIndices };
}

export function isUnitComplete(indices: number[]): boolean {
  return indices.every((i) => gs.cellsData[i].value !== 0);
}

export function updateNumpadState(): void {
  if (!gs.numButtons.length || !gs.cellsData.length) return;
  const counts = new Array(10).fill(0);
  for (const c of gs.cellsData) {
    const v = c.value;
    if (!Number.isFinite(v)) continue;
    const d = Math.round(v);
    if (d >= 1 && d <= 9) counts[d] += 1;
  }
  gs.numButtons.forEach((btn, i) => {
    const n = i + 1;
    const done = counts[n] >= 9;
    btn.classList.toggle('completed', done);
    btn.disabled = done;
    btn.setAttribute('aria-disabled', String(done));
  });
  // When the locked digit is fully placed, keep continuous mode on
  // but return to "no locked digit" (0) to avoid breaking input flow.
  if (gs.continuousFillDigit !== null && gs.continuousFillDigit >= 1 && counts[gs.continuousFillDigit] >= 9) {
    const finishedDigit = gs.continuousFillDigit;
    gs.continuousFillDigit = 0;
    gs.numButtons.forEach((b) => b.classList.remove('continuous-active'));
    showFeedback(t('miscRuntime.digitComplete', { digit: String(finishedDigit) }), 'success');
  }
}

export function syncLevelCardSize(): void {
  const items = document.querySelectorAll('#level-list .level-item');
  items.forEach((item) => {
    const w = (item as HTMLElement).getBoundingClientRect().width;
    if (w > 0) (item as HTMLElement).style.height = `${w}px`;
  });
}
