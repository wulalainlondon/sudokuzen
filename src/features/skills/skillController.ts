// Skill mode controller — cell-based selection + numpad↔panel swap.
// Long-press a cell to enter skill mode. System auto-detects patterns.

import { gs } from '../../game/state';
import type { SkillModeState } from '../../game/state';
import { showFeedback } from '../../ui/feedback';
import { updateCellDisplay } from '../../game/board';
import { cellLabel } from '../../game/utils';
import { recordElimination } from '../stats';
import { registerSkill, evaluateAllSkills, getSkillById } from './skillRegistry';
import { nakedSingleSkill } from './nakedSingle';
import { hiddenSingleSkill } from './hiddenSingle';
import { lockedCandidatesSkill } from './lockedCandidates';
import { nakedPairSkill } from './nakedPair';
import { hiddenPairSkill } from './hiddenPair';
import { nakedTripleSkill } from './nakedTriple';
import { hiddenTripleSkill } from './hiddenTriple';
import { xWingSkill } from './xWing';
import { swordfishSkill } from './swordfish';
import { jellyfishSkill } from './jellyfish';
import { xyWingSkill } from './xyWing';
import { xyzWingSkill } from './xyzWing';
import { wWingSkill } from './wWing';
import { uniqueRectangleSkill } from './uniqueRectangle';
import { remotePairsSkill } from './remotePairs';
import { skyscraperSkill } from './skyscraper';
import { twoStringKiteSkill } from './twoStringKite';
import { emptyRectangleSkill } from './emptyRectangle';
import { finnedXWingSkill } from './finnedXWing';
import { bugPlusOneSkill } from './bugPlusOne';
import type { SkillPreview } from './types';
import { getChoreography } from './castChoreography';

// ── Register skills (order = evaluation priority) ────────────────────
// Quick-cast singles (evaluated first for speed)
registerSkill(nakedSingleSkill);
registerSkill(hiddenSingleSkill);

// Lv1 — Phase 1 techniques (3-7)
registerSkill(lockedCandidatesSkill);
registerSkill(nakedPairSkill);
registerSkill(nakedTripleSkill);
registerSkill(hiddenPairSkill);
registerSkill(hiddenTripleSkill);

// Lv2 — Phase 2 techniques
registerSkill(xWingSkill);
registerSkill(swordfishSkill);
registerSkill(jellyfishSkill);
registerSkill(xyWingSkill);
registerSkill(xyzWingSkill);
registerSkill(wWingSkill);
registerSkill(uniqueRectangleSkill);
registerSkill(remotePairsSkill);
registerSkill(skyscraperSkill);
registerSkill(twoStringKiteSkill);
registerSkill(emptyRectangleSkill);
registerSkill(finnedXWingSkill);
registerSkill(bugPlusOneSkill);

// ── State ────────────────────────────────────────────────────────────

function sm(): SkillModeState {
  const s = gs.skillMode;
  if (!s) throw new Error('gs.skillMode is not initialised');
  return s;
}

let _preview: SkillPreview | null = null;

// ── UI refs ──────────────────────────────────────────────────────────

function getNumpad(): HTMLElement | null {
  return document.getElementById('numpad');
}
function getSkillPanel(): HTMLElement | null {
  return document.getElementById('skill-panel');
}

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
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
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

function recordAction(
  type: string,
  detail: string,
  idx: number | null = null,
  val: number | null = null,
  notes: number[] | null = null,
): void {
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

  // Single-cell quick cast: prevSelected === -1 means no prior cell (wild mode only)
  if (prevSelected === -1) {
    const isWild = gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild';
    if (isWild && tryQuickCast(cellIdx)) return;
    // Outside wild or quick cast didn't match — ignore single-cell long-press
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

/** Quick-cast entry: single cell, no previous selection needed.
 *  Used for naked_single / hidden_single in wild mode.
 *  Returns true if a quick cast was initiated. */
export function tryQuickCast(cellIdx: number): boolean {
  const cell = gs.cellsData[cellIdx];
  if (!cell || cell.value !== 0) return false;

  // Check if this cell qualifies for any single-cell skill
  const preview = evaluateAllSkills([cellIdx], gs.cellsData);
  if (!preview.valid) return false;

  // Only quick-cast for singles skills
  if (preview.skillId !== 'naked_single' && preview.skillId !== 'hidden_single') return false;

  const skill = sm();
  skill.enabled = true;
  skill.selectedCells = [cellIdx];
  _preview = preview;
  skill.preview = preview;

  // Skip panel — go straight to cast
  if (navigator.vibrate) navigator.vibrate(10);
  doQuickCast();
  return true;
}

async function doQuickCast(): Promise<void> {
  const skill = sm();
  if (!_preview?.valid) {
    exitSkillMode();
    return;
  }

  const detector = getSkillById(_preview.skillId);
  if (!detector) {
    exitSkillMode();
    return;
  }

  const result = detector.execute(gs.cellsData, _preview);
  if (!result.valid) {
    exitSkillMode();
    return;
  }

  skill.casting = true;

  // Run choreography (fast: ~250-900ms)
  const choreography = getChoreography(result.skillId);
  if (gs.gridEl) {
    await choreography({
      gridEl: gs.gridEl,
      result,
      findNoteSpan,
      wait,
      recordAction,
      recordElimination,
      cellLabel,
    });
  }

  // After quick cast, auto-fill if only 1 candidate remains
  const idx = result.sourceCells[0];
  const cellData = gs.cellsData[idx];
  if (cellData && cellData.value === 0 && cellData.notes.length <= 1) {
    const fillDigit = result.digits?.[0] ?? cellData.notes[0];
    if (fillDigit) {
      await quickCastFill(idx, fillDigit);
    }
  }

  // Redraw
  if (gs.gridEl) {
    const cellEl = gs.gridEl.children[idx] as HTMLElement | undefined;
    if (cellEl) {
      const { updateCellDisplay } = await import('../../game/board');
      updateCellDisplay(cellEl, gs.cellsData[idx]);
    }
  }

  const skillName = result.skillName;
  showFeedback(`${skillName}！`, 'success');
  exitSkillMode();

  const { saveGameStatus } = await import('../../game/core');
  saveGameStatus();
}

/** Fill a cell after quick cast, triggering normal game logic (peer note elimination, win check). */
async function quickCastFill(idx: number, digit: number): Promise<void> {
  const cellData = gs.cellsData[idx];
  cellData.value = digit;
  cellData.notes = [];
  cellData.isError = false;
  recordAction('quickcast_fill', `${cellLabel(idx)} 快斬填入 ${digit}`, idx, digit, null);

  // Auto-eliminate from peers
  const { updateCellDisplay, getUnitIndices } = await import('../../game/board');
  const { rowIndices, colIndices, boxIndices } = getUnitIndices(idx);
  const peers = new Set([...rowIndices, ...colIndices, ...boxIndices]);
  peers.delete(idx);
  for (const p of peers) {
    const pCell = gs.cellsData[p];
    if (pCell.value !== 0) continue;
    const ni = pCell.notes.indexOf(digit);
    if (ni > -1) {
      pCell.notes.splice(ni, 1);
      if (gs.gridEl) {
        const pEl = gs.gridEl.children[p] as HTMLElement;
        updateCellDisplay(pEl, pCell);
      }
      recordElimination();
    }
  }

  // Update display
  if (gs.gridEl) {
    const cellEl = gs.gridEl.children[idx] as HTMLElement;
    updateCellDisplay(cellEl, cellData);
  }
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

  // Delegate animation to per-skill choreography
  const choreography = getChoreography(result.skillId);
  if (gs.gridEl) {
    await choreography({
      gridEl: gs.gridEl,
      result,
      findNoteSpan,
      wait,
      recordAction,
      recordElimination,
      cellLabel,
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
export function evaluateLockedSkill(): void {
  /* no-op — skill mode is now on-demand */
}
export function toggleSkillMode(): void {
  /* no-op — removed toggle button */
}
export function handleCandidateProbeTap(): void {
  /* no-op — replaced by long-press */
}
export function castLockedSkill(): Promise<void> {
  return castSkill();
}
