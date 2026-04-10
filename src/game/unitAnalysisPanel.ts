// Unit Analysis Panel — shows missing digits in row/col/box for a selected filled cell
// Slides in over the numpad when a filled cell is selected.

import { gs } from './state';
import { getUnitIndices } from './board';
import { t } from '../i18n/t';

let _panelEl: HTMLElement | null = null;
let _visible = false;

function getPanel(): HTMLElement | null {
  if (!_panelEl) _panelEl = document.getElementById('unit-analysis-panel');
  return _panelEl;
}

function getMissing(indices: number[]): number[] {
  const present = new Set<number>();
  for (const i of indices) {
    const v = gs.cellsData[i]?.value;
    if (v >= 1 && v <= 9) present.add(v);
  }
  const missing: number[] = [];
  for (let d = 1; d <= 9; d++) {
    if (!present.has(d)) missing.push(d);
  }
  return missing;
}

function renderDigits(digits: number[]): string {
  if (digits.length === 0) return `<span class="ua-complete">✓</span>`;
  return digits.map((d) => `<span class="ua-digit">${d}</span>`).join('');
}

export function showUnitAnalysis(idx: number): void {
  const panel = getPanel();
  const numpad = document.getElementById('numpad');
  if (!panel || !numpad) return;

  const { rowIndices, colIndices, boxIndices } = getUnitIndices(idx);
  const rowMissing = getMissing(rowIndices);
  const colMissing = getMissing(colIndices);
  const boxMissing = getMissing(boxIndices);

  const row = Math.floor(idx / 9) + 1;
  const col = (idx % 9) + 1;

  panel.innerHTML = `
    <div class="ua-row">
      <span class="ua-label">${t('unitAnalysis.row', { n: String(row) })}</span>
      <span class="ua-digits">${renderDigits(rowMissing)}</span>
    </div>
    <div class="ua-row">
      <span class="ua-label">${t('unitAnalysis.col', { n: String(col) })}</span>
      <span class="ua-digits">${renderDigits(colMissing)}</span>
    </div>
    <div class="ua-row">
      <span class="ua-label">${t('unitAnalysis.box')}</span>
      <span class="ua-digits">${renderDigits(boxMissing)}</span>
    </div>
  `;

  numpad.style.visibility = 'hidden';
  panel.classList.remove('hidden');
  _visible = true;
}

export function hideUnitAnalysis(): void {
  if (!_visible) return;
  const panel = getPanel();
  const numpad = document.getElementById('numpad');
  if (panel) panel.classList.add('hidden');
  if (numpad) numpad.style.visibility = '';
  _visible = false;
}

export function isUnitAnalysisVisible(): boolean {
  return _visible;
}
