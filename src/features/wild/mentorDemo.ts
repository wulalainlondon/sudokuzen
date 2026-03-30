// Mentor demo — 弈塵's power demonstration on first World entry.
// Uses real Exocet puzzle [17] with full candidate visualization.
// Shows: 領域展開 → singles sweep → mid-tier eliminations → exocet freeze.

import { renderGrid, updateCellDisplay } from '../../game/board';
import { gs } from '../../game/state';

// ── Real puzzle: exocet_death_blossom.json[17] ──────────────────────
// Path: 明眼×4 → 暗眼×10 → 明眼×5 → 暗眼×3 → [卡住]
//       → 封鎖×4 → 藏雙×1 → 隱流×1 → 天劫×3 → ✗

const DEMO_PUZZLE = [0,4,2,0,6,0,0,0,0,0,0,0,0,0,0,8,0,0,0,5,0,2,4,0,0,0,0,0,0,8,0,0,0,1,0,0,0,0,0,7,0,0,0,0,9,0,0,0,0,9,2,0,3,0,4,6,9,0,1,0,3,0,0,0,0,1,0,0,0,6,0,0,0,8,0,0,3,4,0,0,1];
const DEMO_SOLUTION = [8,4,2,3,6,9,5,1,7,6,9,3,5,7,1,8,4,2,1,5,7,2,4,8,9,6,3,9,2,8,4,5,3,1,7,6,3,1,4,7,8,6,2,5,9,5,7,6,1,9,2,4,3,8,4,6,9,8,1,7,3,2,5,7,3,1,9,2,5,6,8,4,2,8,5,6,3,4,7,9,1];

// ── Solver with candidate tracking ──────────────────────────────────

interface SolverCell {
  value: number;
  candidates: Set<number>;
  fixed: boolean;
}

interface SolveStep {
  type: 'fill';
  technique: string;
  label: string;
  cellIdx: number;
  digit: number;
  eliminations: { cellIdx: number; digit: number }[]; // candidates removed in this step
}

function getPeers(idx: number): number[] {
  const r = Math.floor(idx / 9), c = idx % 9;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const peers = new Set<number>();
  for (let i = 0; i < 9; i++) { peers.add(r * 9 + i); peers.add(i * 9 + c); }
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) peers.add((br + dr) * 9 + (bc + dc));
  peers.delete(idx);
  return [...peers];
}

function getUnits(): { cells: number[]; name: string }[] {
  const units: { cells: number[]; name: string }[] = [];
  for (let r = 0; r < 9; r++) units.push({ cells: Array.from({ length: 9 }, (_, c) => r * 9 + c), name: `R${r + 1}` });
  for (let c = 0; c < 9; c++) units.push({ cells: Array.from({ length: 9 }, (_, r) => r * 9 + c), name: `C${c + 1}` });
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    const cells: number[] = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push((br + dr) * 9 + (bc + dc));
    units.push({ cells, name: `B${b + 1}` });
  }
  return units;
}

function initSolverGrid(puzzle: number[]): SolverCell[] {
  const grid: SolverCell[] = puzzle.map(v => ({ value: v, candidates: new Set<number>(), fixed: v !== 0 }));
  for (let i = 0; i < 81; i++) {
    if (grid[i].value !== 0) continue;
    for (let d = 1; d <= 9; d++) {
      if (getPeers(i).every(p => grid[p].value !== d)) grid[i].candidates.add(d);
    }
  }
  return grid;
}

function placeDigit(grid: SolverCell[], idx: number, digit: number): { cellIdx: number; digit: number }[] {
  const elims: { cellIdx: number; digit: number }[] = [];
  grid[idx].value = digit;
  grid[idx].candidates.clear();
  for (const p of getPeers(idx)) {
    if (grid[p].candidates.delete(digit)) {
      elims.push({ cellIdx: p, digit });
    }
  }
  return elims;
}

function generateSolveSteps(puzzle: number[]): SolveStep[] {
  const grid = initSolverGrid(puzzle);
  const units = getUnits();
  const steps: SolveStep[] = [];

  let changed = true;
  while (changed) {
    changed = false;

    // Naked singles
    for (let i = 0; i < 81; i++) {
      if (grid[i].value !== 0 || grid[i].candidates.size !== 1) continue;
      const digit = [...grid[i].candidates][0];
      const elims = placeDigit(grid, i, digit);
      steps.push({ type: 'fill', technique: 'naked_single', label: '明眼', cellIdx: i, digit, eliminations: elims });
      changed = true;
    }
    if (changed) continue;

    // Hidden singles
    for (const unit of units) {
      for (let d = 1; d <= 9; d++) {
        const cells = unit.cells.filter(c => grid[c].value === 0 && grid[c].candidates.has(d));
        if (cells.length !== 1) continue;
        if (unit.cells.some(c => grid[c].value === d)) continue;
        const idx = cells[0];
        // Eliminate other candidates from this cell first
        const selfElims: { cellIdx: number; digit: number }[] = [];
        for (const c of [...grid[idx].candidates]) {
          if (c !== d) { grid[idx].candidates.delete(c); selfElims.push({ cellIdx: idx, digit: c }); }
        }
        const peerElims = placeDigit(grid, idx, d);
        steps.push({ type: 'fill', technique: 'hidden_single', label: '暗眼', cellIdx: idx, digit: d, eliminations: [...selfElims, ...peerElims] });
        changed = true;
      }
    }
  }

  // After singles exhaust: add placeholder steps for mid-tier and exocet
  // Using the REAL technique counts from puzzle metadata
  const remaining: number[] = [];
  for (let i = 0; i < 81; i++) if (grid[i].value === 0) remaining.push(i);

  // Real path: 封鎖×4 → 藏雙×1 → 隱流×1 → 天劫×3
  const midLabels = ['封鎖', '封鎖', '封鎖', '封鎖', '藏雙', '隱流'];
  const exocetCount = 3;

  // Distribute remaining cells: mid-tier gets some, exocet gets the rest
  const midCellCount = Math.min(remaining.length - exocetCount * 2, Math.floor(remaining.length * 0.6));
  const exocetCellStart = midCellCount;

  // Mid-tier steps: each technique "unlocks" a batch of cells
  let cellCursor = 0;
  for (let m = 0; m < midLabels.length && cellCursor < midCellCount; m++) {
    const batchSize = Math.ceil((midCellCount - cellCursor) / (midLabels.length - m));
    const batch = remaining.slice(cellCursor, cellCursor + batchSize);
    const elims: { cellIdx: number; digit: number }[] = [];
    for (const idx of batch) {
      // Simulate: eliminate wrong candidates, then fill
      for (const c of [...grid[idx].candidates]) {
        if (c !== DEMO_SOLUTION[idx]) elims.push({ cellIdx: idx, digit: c });
      }
      grid[idx].value = DEMO_SOLUTION[idx];
      grid[idx].candidates.clear();
    }
    if (batch.length > 0) {
      steps.push({
        type: 'fill', technique: 'mid_tier', label: midLabels[m],
        cellIdx: batch[0], digit: DEMO_SOLUTION[batch[0]],
        eliminations: elims,
      });
    }
    cellCursor += batchSize;
  }

  // Exocet steps (will be shown as attempts, last one freezes)
  for (let e = 0; e < exocetCount; e++) {
    const start = exocetCellStart + e * Math.ceil((remaining.length - exocetCellStart) / exocetCount);
    const end = exocetCellStart + (e + 1) * Math.ceil((remaining.length - exocetCellStart) / exocetCount);
    const batch = remaining.slice(start, Math.min(end, remaining.length));
    steps.push({
      type: 'fill', technique: 'exocet', label: '天劫',
      cellIdx: batch[0] ?? remaining[remaining.length - 1],
      digit: 0,
      eliminations: [],
    });
  }

  return steps;
}

// ── Animation ────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function findNoteSpan(cellEl: HTMLElement, digit: number): HTMLElement | null {
  return cellEl.querySelector(`.note-num[data-digit="${digit}"]`) as HTMLElement | null;
}

const TECH_COLORS: Record<string, string> = {
  '明眼': '#74b9ff',
  '暗眼': '#a29bfe',
  '封鎖': '#00cec9',
  '雙契': '#ffb142',
  '藏雙': '#fd79a8',
  '編織': '#55efc4',
  '隱流': '#81ecec',
  '天劫': '#ff3333',
};

export async function runMentorDemo(): Promise<void> {
  // Setup game screen
  document.getElementById('level-screen')?.style.setProperty('display', 'none');
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (container) container.style.display = 'flex';

  gs.currentLevel = {
    id: -1, stars: 0, difficultyName: '世界', displayName: '弈塵的最後一題',
    puzzle: DEMO_PUZZLE, solution: DEMO_SOLUTION, maxTechnique: 'exocet_death_blossom', source: 'demo',
  };
  gs.cellsData = DEMO_PUZZLE.map(v => ({ value: v, fixed: v !== 0, notes: [] as number[], isError: false }));
  gs.errors = 0;
  gs.seconds = 0;

  // Hide game chrome
  const header = container?.querySelector('header') as HTMLElement | null;
  const infoBar = container?.querySelector('.grid-info-bar') as HTMLElement | null;
  const numpadWrapper = container?.querySelector('.numpad-skill-wrapper') as HTMLElement | null;
  if (header) header.style.display = 'none';
  if (infoBar) infoBar.style.display = 'none';
  if (numpadWrapper) numpadWrapper.style.display = 'none';

  // Add dark backdrop
  container?.classList.add('demo-backdrop');

  renderGrid();

  // Create technique label
  const techLabel = document.createElement('div');
  techLabel.id = 'demo-tech-label';
  techLabel.className = 'demo-tech-label';
  document.body.appendChild(techLabel);

  // Create counter
  const counter = document.createElement('div');
  counter.id = 'demo-step-counter';
  counter.className = 'demo-step-counter';
  document.body.appendChild(counter);

  let filled = DEMO_PUZZLE.filter(v => v !== 0).length;
  counter.textContent = `${filled}/81`;

  await wait(600);

  // ── Phase 0: 領域展開 — fill all candidates ──
  techLabel.textContent = '領域展開';
  techLabel.style.color = '#dfe6e9';

  const solverGrid = initSolverGrid(DEMO_PUZZLE);
  for (let i = 0; i < 81; i++) {
    if (gs.cellsData[i].value !== 0) continue;
    gs.cellsData[i].notes = [...solverGrid[i].candidates].sort();
    const cellEl = gs.gridEl?.children[i] as HTMLElement | undefined;
    if (cellEl) {
      updateCellDisplay(cellEl, gs.cellsData[i]);
      cellEl.classList.add('demo-fill-flash');
      setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 250);
    }
    if (i % 6 === 0) await wait(20);
  }

  await wait(800);
  techLabel.textContent = '';

  // ── Generate solve steps ──
  const steps = generateSolveSteps(DEMO_PUZZLE);
  const singlesSteps = steps.filter(s => s.technique === 'naked_single' || s.technique === 'hidden_single');
  const midSteps = steps.filter(s => s.technique === 'mid_tier');
  const exocetSteps = steps.filter(s => s.technique === 'exocet');

  // ── Phase 1: Singles blitz — fast candidate elimination ──
  for (let i = 0; i < singlesSteps.length; i++) {
    const step = singlesSteps[i];
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Eliminate candidates (visual)
    for (const elim of step.eliminations) {
      const cellEl = gs.gridEl?.children[elim.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        const noteSpan = findNoteSpan(cellEl, elim.digit);
        if (noteSpan) {
          noteSpan.classList.add('skill-elim-digit');
        }
        // Update data
        const notes = gs.cellsData[elim.cellIdx].notes;
        const ni = notes.indexOf(elim.digit);
        if (ni >= 0) notes.splice(ni, 1);
      }
    }

    // Fill the cell
    gs.cellsData[step.cellIdx].value = step.digit;
    gs.cellsData[step.cellIdx].notes = [];
    const cellEl = gs.gridEl?.children[step.cellIdx] as HTMLElement | undefined;
    if (cellEl) {
      updateCellDisplay(cellEl, gs.cellsData[step.cellIdx]);
      cellEl.classList.add('demo-fill-flash');
      setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 200);
    }

    // Update peer cells display (to reflect removed candidates)
    for (const elim of step.eliminations) {
      const peerEl = gs.gridEl?.children[elim.cellIdx] as HTMLElement | undefined;
      if (peerEl && gs.cellsData[elim.cellIdx].value === 0) {
        updateCellDisplay(peerEl, gs.cellsData[elim.cellIdx]);
      }
    }

    filled++;
    counter.textContent = `${filled}/81`;

    // Speed: batch 3 steps then pause briefly
    if (i % 3 === 0) await wait(40);
  }

  await wait(500);
  techLabel.textContent = '';

  // ── Phase 2: Mid-tier techniques — slower, show eliminations ──
  for (const step of midSteps) {
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Highlight elimination targets first
    for (const elim of step.eliminations) {
      const cellEl = gs.gridEl?.children[elim.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        const noteSpan = findNoteSpan(cellEl, elim.digit);
        if (noteSpan) noteSpan.classList.add('skill-noise-digit');
      }
    }
    await wait(400);

    // Strike: eliminate candidates
    for (const elim of step.eliminations) {
      const cellEl = gs.gridEl?.children[elim.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        const noteSpan = findNoteSpan(cellEl, elim.digit);
        if (noteSpan) {
          noteSpan.classList.remove('skill-noise-digit');
          noteSpan.classList.add('skill-elim-digit');
        }
        const notes = gs.cellsData[elim.cellIdx].notes;
        const ni = notes.indexOf(elim.digit);
        if (ni >= 0) notes.splice(ni, 1);
      }
    }
    await wait(200);

    // Fill cells that now have value
    // Find all cells involved in this step's eliminations and fill solved ones
    const affectedCells = new Set(step.eliminations.map(e => e.cellIdx));
    affectedCells.add(step.cellIdx);
    for (const idx of affectedCells) {
      if (gs.cellsData[idx].value === 0 && DEMO_SOLUTION[idx]) {
        // Check if this cell should be filled (only 1 candidate left or it's the step target)
        gs.cellsData[idx].value = DEMO_SOLUTION[idx];
        gs.cellsData[idx].notes = [];
        filled++;
        const cellEl = gs.gridEl?.children[idx] as HTMLElement | undefined;
        if (cellEl) {
          updateCellDisplay(cellEl, gs.cellsData[idx]);
          cellEl.classList.add('demo-fill-flash');
          setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 400);
        }
      } else if (gs.cellsData[idx].value === 0) {
        // Just update display to show reduced candidates
        const cellEl = gs.gridEl?.children[idx] as HTMLElement | undefined;
        if (cellEl) updateCellDisplay(cellEl, gs.cellsData[idx]);
      }
    }

    counter.textContent = `${filled}/81`;
    await wait(600);

    // Quick singles sweep label
    techLabel.textContent = '明眼';
    techLabel.style.color = TECH_COLORS['明眼']!;
    await wait(150);
  }

  await wait(600);

  // ── Phase 3: Exocet — slow, then freeze ──
  for (let e = 0; e < exocetSteps.length; e++) {
    techLabel.textContent = '天劫';
    techLabel.style.color = TECH_COLORS['天劫']!;

    // Pulse remaining empty cells in red
    const emptyCells: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (gs.cellsData[i].value === 0) emptyCells.push(i);
    }
    for (const idx of emptyCells) {
      const cellEl = gs.gridEl?.children[idx] as HTMLElement;
      if (cellEl) cellEl.classList.add('demo-exocet-pulse');
    }

    if (e < exocetSteps.length - 1) {
      // Successful attempt: fill some cells
      await wait(800);
      const batch = emptyCells.slice(0, Math.ceil(emptyCells.length / (exocetSteps.length - e)));
      for (const idx of batch) {
        gs.cellsData[idx].value = DEMO_SOLUTION[idx];
        gs.cellsData[idx].notes = [];
        filled++;
        const cellEl = gs.gridEl?.children[idx] as HTMLElement | undefined;
        if (cellEl) {
          updateCellDisplay(cellEl, gs.cellsData[idx]);
          cellEl.classList.add('demo-fill-flash');
          setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 500);
        }
      }
      counter.textContent = `${filled}/81`;
      // Clean pulse
      for (const idx of emptyCells) {
        const cellEl = gs.gridEl?.children[idx] as HTMLElement;
        if (cellEl) cellEl.classList.remove('demo-exocet-pulse');
      }
      await wait(600 + e * 300); // Each one slower
    } else {
      // FINAL attempt: freeze
      await wait(1200);

      // Pulse fades out
      techLabel.style.transition = 'opacity 2s';
      techLabel.style.opacity = '0.2';

      await wait(2000);

      // Clean up pulse
      for (const idx of emptyCells) {
        const cellEl = gs.gridEl?.children[idx] as HTMLElement;
        if (cellEl) cellEl.classList.remove('demo-exocet-pulse');
      }
    }
  }

  // ── Freeze ──
  techLabel.textContent = '';
  techLabel.style.opacity = '';
  techLabel.style.transition = '';
  counter.textContent = `${filled}/81`;

  if (gs.gridEl) gs.gridEl.classList.add('demo-frozen');
  await wait(1500);

  // Clean up
  techLabel.remove();
  counter.remove();
  container?.classList.remove('demo-backdrop');
  if (header) header.style.display = '';
  if (infoBar) infoBar.style.display = '';
  if (numpadWrapper) numpadWrapper.style.display = '';
  if (container) container.style.display = 'none';
  document.getElementById('level-screen')?.style.setProperty('display', 'flex');
  if (gs.gridEl) {
    gs.gridEl.classList.remove('demo-frozen');
    Array.from(gs.gridEl.children).forEach(c => {
      c.classList.remove('demo-fill-flash', 'demo-skill-pulse', 'demo-exocet-pulse');
    });
  }
}
