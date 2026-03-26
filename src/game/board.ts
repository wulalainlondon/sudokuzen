// Board rendering, cell selection, numpad

import { gs } from './state';
import type { CellData } from './state';

export function renderGrid(): void {
  if (!gs.gridEl) return;
  gs.gridEl.innerHTML = '';
  gs.cellsData.forEach((data, i) => {
    const cell = document.createElement('div');
    cell.className = `cell ${data.fixed ? 'is-fixed' : ''} ${data.isError ? 'error' : ''}`;
    updateCellDisplay(cell, data);
    cell.addEventListener('pointerdown', (ev) => {
      if (ev && ev.button !== undefined && ev.button !== 0) return;
      // In continuous fill mode, clicking a cell directly fills
      if (gs.continuousFillDigit && gs.continuousFillDigit >= 1) {
        import('./core').then(m => {
          if (!m.handleContinuousCellClick(i)) selectCell(i);
        });
      } else {
        selectCell(i);
      }
    });
    gs.gridEl!.appendChild(cell);
  });
  updateNumpadState();
}

export function updateCellDisplay(cell: HTMLElement, data: CellData): void {
  cell.innerHTML = '';
  if (data.value !== 0) {
    cell.textContent = String(data.value);
    if (!data.fixed) cell.classList.add('user-val');
    else cell.classList.remove('user-val');
  } else {
    const ng = document.createElement('div');
    ng.className = 'notes-grid';
    for (let n = 1; n <= 9; n++) {
      const nd = document.createElement('div');
      nd.className = `note-num ${data.notes.includes(n) ? 'active' : ''}`;
      nd.textContent = String(n);
      ng.appendChild(nd);
    }
    cell.appendChild(ng);
  }
}

export function selectCell(idx: number): void {
  gs.selectedIdx = idx;
  if (!gs.gridEl) return;
  const selectedVal = gs.cellsData[idx].value;
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);

  Array.from(gs.gridEl.children).forEach((c, i) => {
    c.classList.remove('selected', 'related', 'match');
    const r = Math.floor(i / 9);
    const l = i % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(l / 3);
    const val = gs.cellsData[i].value;

    if (i === idx) {
      c.classList.add('selected');
    } else {
      if (r === row || l === col || b === box) c.classList.add('related');
      if (selectedVal !== 0 && val === selectedVal) c.classList.add('match');
    }
  });
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
  return indices.every(i => gs.cellsData[i].value !== 0);
}

export function updateNumpadState(): void {
  if (!gs.numButtons.length || !gs.cellsData.length) return;
  const counts = new Array(10).fill(0);
  for (const c of gs.cellsData) {
    if (c.value >= 1 && c.value <= 9) counts[c.value] += 1;
  }
  gs.numButtons.forEach((btn, i) => {
    const n = i + 1;
    btn.classList.toggle('completed', counts[n] >= 9);
  });
}

export function syncLevelCardSize(): void {
  const items = document.querySelectorAll('#level-list .level-item');
  items.forEach((item) => {
    const w = (item as HTMLElement).getBoundingClientRect().width;
    if (w > 0) (item as HTMLElement).style.height = `${w}px`;
  });
}
