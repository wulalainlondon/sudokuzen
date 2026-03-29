// Skill mode controller — cell-based selection + numpad↔panel swap.
// Long-press a cell to enter skill mode. System auto-detects patterns.

import { gs } from '../../game/state';
import type { SkillModeState } from '../../game/state';
import { showFeedback } from '../../ui/feedback';
import { updateCellDisplay } from '../../game/board';
import { cellLabel } from '../../game/utils';
import { recordElimination } from '../stats';
import { registerSkill, evaluateAllSkills, getSkillById } from './skillRegistry';
import { lockedCandidatesSkill } from './lockedCandidates';
import { nakedPairSkill } from './nakedPair';
import { hiddenPairSkill } from './hiddenPair';
import { nakedTripleSkill } from './nakedTriple';
import { hiddenTripleSkill } from './hiddenTriple';
import type { SkillPreview } from './types';

// ── Register skills (order = evaluation priority) ────────────────────
// Lv1 — Phase 1 techniques (3-7)
registerSkill(lockedCandidatesSkill);
registerSkill(nakedPairSkill);
registerSkill(nakedTripleSkill);
registerSkill(hiddenPairSkill);
registerSkill(hiddenTripleSkill);

// ── State ────────────────────────────────────────────────────────────

function sm(): SkillModeState {
  const s = gs.skillMode;
  if (!s) throw new Error('gs.skillMode is not initialised');
  return s;
}

let _preview: SkillPreview | null = null;

// ── UI refs ──────────────────────────────────────────────────────────

function getNumpad(): HTMLElement | null { return document.getElementById('numpad'); }
function getSkillPanel(): HTMLElement | null { return document.getElementById('skill-panel'); }

// ── Panel swap (numpad ↔ skill panel) ────────────────────────────────

function showSkillPanel(): void {
  const numpad = getNumpad();
  const panel = getSkillPanel();
  if (numpad) numpad.style.visibility = 'hidden';
  if (panel) panel.classList.remove('hidden');
}

function hideSkillPanel(): void {
  const numpad = getNumpad();
  const panel = getSkillPanel();
  if (numpad) numpad.style.visibility = '';
  if (panel) panel.classList.add('hidden');
}

// ── Skill panel UI ──────────────────────────────────────────────────

function updatePanelUI(): void {
  const skill = sm();
  const castBtn = document.getElementById('skill-cast-btn') as HTMLButtonElement | null;
  const fillBtn = document.getElementById('skill-fill-btn') as HTMLButtonElement | null;
  const subtitle = document.getElementById('skill-subtitle');
  const status = document.getElementById('skill-status');
  if (!castBtn || !fillBtn || !subtitle || !status) return;

  const p = _preview;

  if (skill.casting && p) {
    subtitle.textContent = `${p.skillName} · {${p.digits?.join(',') ?? '-'}}`;
    status.textContent = skill.castMessage || '演算中...';
    castBtn.disabled = true;
    fillBtn.disabled = true;
    castBtn.textContent = '施放中...';
    return;
  }

  fillBtn.disabled = false;
  if (p?.valid) {
    subtitle.textContent = `${p.skillName} · {${p.digits?.join(',') ?? ''}}`;
    status.textContent = `可施放：${p.unitLabel} 可消去 ${p.targets.length} 個`;
    castBtn.disabled = false;
    castBtn.textContent = `${p.skillName}（-${p.targets.length}）`;
  } else {
    subtitle.textContent = p?.reason || '未構成任何招式';
    status.textContent = `已選 ${skill.selectedCells.length} 格 · 可長按更多格`;
    castBtn.disabled = true;
    castBtn.textContent = '施放';
  }
}

// ── Grid visuals ────────────────────────────────────────────────────

function refreshCellHighlights(): void {
  if (!gs.gridEl) return;
  const skill = sm();
  Array.from(gs.gridEl.children).forEach((c, i) => {
    c.classList.remove('skill-selected', 'skill-source', 'skill-target', 'skill-target-inward');
    // Highlight all selected cells
    if (skill.enabled && skill.selectedCells.includes(i)) {
      c.classList.add('skill-selected');
    }
  });

  // If preview is valid, add source/target highlights
  if (_preview?.valid) {
    for (const src of _preview.sourceCells) {
      gs.gridEl.children[src]?.classList.add('skill-source');
    }
    const tgtClass = _preview.sweepDirection === 'inward' ? 'skill-target-inward' : 'skill-target';
    for (const t of _preview.targets) {
      gs.gridEl.children[t.cell]?.classList.add(tgtClass);
    }
  }

  updateConnectionOverlay();
}

// ── Connection lines ────────────────────────────────────────────────

function getCellCenter(cellIdx: number): { x: number; y: number } | null {
  if (!gs.gridEl) return null;
  const el = gs.gridEl.children[cellIdx] as HTMLElement | undefined;
  if (!el) return null;
  const gr = gs.gridEl.getBoundingClientRect();
  const cr = el.getBoundingClientRect();
  return { x: cr.left + cr.width / 2 - gr.left, y: cr.top + cr.height / 2 - gr.top };
}

function removeConnectionOverlay(): void {
  document.getElementById('skill-connection-svg')?.remove();
}

function updateConnectionOverlay(): void {
  removeConnectionOverlay();
  const p = _preview;
  if (!p?.valid || !gs.gridEl || p.sweepDirection === 'inward') return;
  if (p.sourceCells.length < 2 || !p.targets.length) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'skill-connection-svg';
  svg.setAttribute('class', 'skill-connection-svg');
  const gr = gs.gridEl.getBoundingClientRect();
  svg.setAttribute('width', String(gr.width));
  svg.setAttribute('height', String(gr.height));

  const srcA = getCellCenter(p.sourceCells[0]);
  const srcB = getCellCenter(p.sourceCells[1]);
  if (!srcA || !srcB) return;
  const mid = { x: (srcA.x + srcB.x) / 2, y: (srcA.y + srcB.y) / 2 };

  const addLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    svg.appendChild(l);
  };

  addLine(srcA.x, srcA.y, srcB.x, srcB.y, 'skill-line skill-line-source');
  for (const t of p.targets) {
    const tgt = getCellCenter(t.cell);
    if (tgt) addLine(mid.x, mid.y, tgt.x, tgt.y, 'skill-line skill-line-target');
  }

  gs.gridEl.style.position = 'relative';
  gs.gridEl.appendChild(svg);
}

// ── Cast animation ──────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function recordAction(type: string, detail: string, idx: number | null = null, val: number | null = null, notes: number[] | null = null): void {
  gs.actionHistory.push({ t: gs.seconds, type, detail, idx, val, notes: notes ? notes.slice() : null });
  if (gs.actionHistory.length > 1200) gs.actionHistory.shift();
}

// ── Public API ──────────────────────────────────────────────────────

function evaluate(): void {
  const skill = sm();
  if (!skill.enabled || skill.selectedCells.length < 2) {
    _preview = null;
    updatePanelUI();
    refreshCellHighlights();
    return;
  }
  _preview = evaluateAllSkills(skill.selectedCells, gs.cellsData);
  skill.preview = _preview;
  updatePanelUI();
  refreshCellHighlights();
}

/** Called by board.ts when a cell is long-pressed. prevSelected is the cell that was selected before this tap. */
export function enterSkillMode(cellIdx: number, prevSelected?: number): void {
  const skill = sm();

  if (skill.enabled) {
    // Already in skill mode — add another cell
    if (!skill.selectedCells.includes(cellIdx)) {
      skill.selectedCells.push(cellIdx);
    }
    evaluate();
    return;
  }

  // Enter skill mode with 2 cells: the previously selected + long-pressed
  const firstCell = prevSelected ?? gs.selectedIdx;
  skill.enabled = true;
  skill.selectedCells = [];
  if (firstCell !== null && firstCell !== undefined && firstCell !== cellIdx) {
    skill.selectedCells.push(firstCell);
  }
  skill.selectedCells.push(cellIdx);

  if (navigator.vibrate) navigator.vibrate(15);
  showSkillPanel();
  evaluate();
}

export function exitSkillMode(): void {
  const skill = sm();
  skill.enabled = false;
  skill.selectedCells = [];
  skill.casting = false;
  skill.castMessage = '';
  skill.preview = null;
  _preview = null;
  removeConnectionOverlay();
  refreshCellHighlights();
  hideSkillPanel();
}

/** Find the note <span> for a specific digit in a cell element. */
function findNoteSpan(cellEl: HTMLElement, digit: number): HTMLElement | null {
  return cellEl.querySelector(`.note-num[data-digit="${digit}"]`) as HTMLElement | null;
}

export async function castSkill(): Promise<void> {
  const skill = sm();
  if (!skill.enabled || skill.casting) return;

  if (!_preview?.valid) {
    showFeedback(_preview?.reason || '條件未成立', 'error');
    return;
  }

  const detector = getSkillById(_preview.skillId);
  if (!detector) return;

  const result = detector.execute(gs.cellsData, _preview);
  if (!result.valid || !result.targets.length) {
    showFeedback(result.reason || '沒有可消去候選', 'error');
    exitSkillMode();
    return;
  }

  skill.casting = true;
  skill.castMessage = `${result.skillName}...`;
  updatePanelUI();

  // Phase 1: Source cells pulse (200ms)
  for (const src of result.sourceCells) {
    gs.gridEl?.children[src]?.classList.add('skill-source-pulse');
  }
  // Connection lines flash
  const svgLines = document.querySelectorAll('.skill-line');
  svgLines.forEach((l) => l.classList.add('skill-line-flash'));
  await wait(200);

  // Phase 2: Staggered digit-level strike → vanish
  removeConnectionOverlay();
  const STAGGER = 100;

  for (let i = 0; i < result.targets.length; i++) {
    const t = result.targets[i];
    const cellEl = gs.gridEl?.children[t.cell] as HTMLElement | undefined;
    if (!cellEl) continue;

    // Cell background flash
    cellEl.classList.add('skill-strike');

    // Digit strike animation
    const noteSpan = findNoteSpan(cellEl, t.digit);
    if (noteSpan) noteSpan.classList.add('skill-elim-digit');

    recordAction('skill_eliminate', `${cellLabel(t.cell)} ${result.skillName}消去候選 ${t.digit}`, t.cell, t.digit, gs.cellsData[t.cell].notes);
    recordElimination();

    // Stagger: wait before next target (but not after last)
    if (i < result.targets.length - 1) await wait(STAGGER);
  }

  // Wait for last digit's vanish animation to finish (0.65s)
  await wait(650);

  // Remove strike classes
  if (gs.gridEl) {
    Array.from(gs.gridEl.children).forEach((c) => {
      c.classList.remove('skill-strike', 'skill-source-pulse');
    });
  }

  // Redraw affected cells to reflect data changes
  const affectedCells = new Set(result.targets.map((t) => t.cell));
  for (const cellIdx of affectedCells) {
    const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement | undefined;
    if (cellEl) updateCellDisplay(cellEl, gs.cellsData[cellIdx]);
  }

  // Phase 3: Done — show count + exit
  showFeedback(`−${result.targets.length} 候選`, 'success');
  exitSkillMode();

  const { saveGameStatus } = await import('../../game/core');
  saveGameStatus();
}

/** Reset skill state. Called by core.ts on game reset. */
export function resetSkillState(): void {
  exitSkillMode();
}

/** Apply grid class. Called after initGame renders grid. */
export function applyGridSkillClass(): void {
  // No persistent class needed — skill mode is session-only now
}

// Legacy re-exports for core.ts compatibility
export function evaluateLockedSkill(): void { /* no-op — skill mode is now on-demand */ }
export function toggleSkillMode(): void { /* no-op — removed toggle button */ }
export function handleCandidateProbeTap(): void { /* no-op — replaced by long-press */ }
export function castLockedSkill(): Promise<void> { return castSkill(); }
