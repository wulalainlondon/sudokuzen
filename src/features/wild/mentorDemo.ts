// Mentor demo — 弈塵's power demonstration on first World entry.
// Uses real Exocet puzzle [17] with REAL solver step-by-step.
// Every elimination shown is genuine — no fake steps.

import { renderGrid, updateCellDisplay } from '../../game/board';
import { gs } from '../../game/state';

// ── Real puzzle: exocet_death_blossom.json[17] ──────────────────────

const DEMO_PUZZLE = [0,4,2,0,6,0,0,0,0,0,0,0,0,0,0,8,0,0,0,5,0,2,4,0,0,0,0,0,0,8,0,0,0,1,0,0,0,0,0,7,0,0,0,0,9,0,0,0,0,9,2,0,3,0,4,6,9,0,1,0,3,0,0,0,0,1,0,0,0,6,0,0,0,8,0,0,3,4,0,0,1];
const DEMO_SOLUTION = [8,4,2,3,6,9,5,1,7,6,9,3,5,7,1,8,4,2,1,5,7,2,4,8,9,6,3,9,2,8,4,5,3,1,7,6,3,1,4,7,8,6,2,5,9,5,7,6,1,9,2,4,3,8,4,6,9,8,1,7,3,2,5,7,3,1,9,2,5,6,8,4,2,8,5,6,3,4,7,9,1];

// ── Full solver with step-by-step logging ────────────────────────────

interface Elim { cellIdx: number; digit: number }

interface DemoStep {
  technique: string;       // 'naked_single' | 'hidden_single' | 'locked_candidates' | ...
  label: string;           // Chinese display name
  eliminations: Elim[];    // candidates removed (before fill)
  fills: { cellIdx: number; digit: number }[];  // cells filled
  sourceCells: number[];   // cells that form the pattern (for highlighting)
}

function getPeers(idx: number): number[] {
  const r = Math.floor(idx / 9), c = idx % 9;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const s = new Set<number>();
  for (let i = 0; i < 9; i++) { s.add(r * 9 + i); s.add(i * 9 + c); }
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) s.add((br + dr) * 9 + (bc + dc));
  s.delete(idx);
  return [...s];
}

type Grid = { value: number; cands: Set<number> }[];

function initGrid(puzzle: number[]): Grid {
  const g: Grid = puzzle.map(v => ({ value: v, cands: new Set<number>() }));
  for (let i = 0; i < 81; i++) {
    if (g[i].value !== 0) continue;
    for (let d = 1; d <= 9; d++) {
      if (getPeers(i).every(p => g[p].value !== d)) g[i].cands.add(d);
    }
  }
  return g;
}

function placeAndLog(g: Grid, idx: number, digit: number): Elim[] {
  const elims: Elim[] = [];
  g[idx].value = digit;
  g[idx].cands.clear();
  for (const p of getPeers(idx)) {
    if (g[p].cands.delete(digit)) elims.push({ cellIdx: p, digit });
  }
  return elims;
}

function getUnits(): number[][] {
  const u: number[][] = [];
  for (let r = 0; r < 9; r++) u.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) u.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    const cells: number[] = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push((br + dr) * 9 + (bc + dc));
    u.push(cells);
  }
  return u;
}

function generateRealSteps(puzzle: number[]): DemoStep[] {
  const g = initGrid(puzzle);
  const units = getUnits();
  const steps: DemoStep[] = [];

  let progress = true;
  while (progress) {
    progress = false;

    // ── Naked Singles ──
    for (let i = 0; i < 81; i++) {
      if (g[i].value !== 0 || g[i].cands.size !== 1) continue;
      const d = [...g[i].cands][0];
      const elims = placeAndLog(g, i, d);
      steps.push({ technique: 'naked_single', label: '明眼', eliminations: elims, fills: [{ cellIdx: i, digit: d }], sourceCells: [i] });
      progress = true;
    }
    if (progress) continue;

    // ── Hidden Singles ──
    for (const unit of units) {
      for (let d = 1; d <= 9; d++) {
        if (unit.some(c => g[c].value === d)) continue;
        const cells = unit.filter(c => g[c].value === 0 && g[c].cands.has(d));
        if (cells.length !== 1) continue;
        const idx = cells[0];
        const selfElims: Elim[] = [];
        for (const c of [...g[idx].cands]) {
          if (c !== d) { g[idx].cands.delete(c); selfElims.push({ cellIdx: idx, digit: c }); }
        }
        const peerElims = placeAndLog(g, idx, d);
        steps.push({ technique: 'hidden_single', label: '暗眼', eliminations: [...selfElims, ...peerElims], fills: [{ cellIdx: idx, digit: d }], sourceCells: [idx] });
        progress = true;
        break;
      }
      if (progress) break;
    }
    if (progress) continue;

    // ── Locked Candidates ──
    for (let box = 0; box < 9; box++) {
      const br = Math.floor(box / 3) * 3, bc = (box % 3) * 3;
      const boxCells: number[] = [];
      for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) boxCells.push(r * 9 + c);
      for (let d = 1; d <= 9; d++) {
        const cells = boxCells.filter(i => g[i].value === 0 && g[i].cands.has(d));
        if (cells.length < 2) continue;
        const rows = new Set(cells.map(i => Math.floor(i / 9)));
        const cols = new Set(cells.map(i => i % 9));
        const elims: Elim[] = [];
        if (rows.size === 1) {
          const row = [...rows][0];
          for (let c = 0; c < 9; c++) {
            const idx = row * 9 + c;
            if (!boxCells.includes(idx) && g[idx].cands.has(d)) { g[idx].cands.delete(d); elims.push({ cellIdx: idx, digit: d }); }
          }
        }
        if (cols.size === 1) {
          const col = [...cols][0];
          for (let r = 0; r < 9; r++) {
            const idx = r * 9 + col;
            if (!boxCells.includes(idx) && g[idx].cands.has(d)) { g[idx].cands.delete(d); elims.push({ cellIdx: idx, digit: d }); }
          }
        }
        if (elims.length > 0) {
          steps.push({ technique: 'locked_candidates', label: '封鎖', eliminations: elims, fills: [], sourceCells: cells });
          progress = true;
          break;
        }
      }
      if (progress) break;
    }
    // Claiming
    if (!progress) {
      for (let line = 0; line < 9 && !progress; line++) {
        for (const lt of ['row', 'col'] as const) {
          for (let d = 1; d <= 9; d++) {
            const cells: number[] = [];
            for (let i = 0; i < 9; i++) {
              const idx = lt === 'row' ? line * 9 + i : i * 9 + line;
              if (g[idx].value === 0 && g[idx].cands.has(d)) cells.push(idx);
            }
            if (cells.length < 2) continue;
            const boxes = new Set(cells.map(i => { const r = Math.floor(i / 9), c = i % 9; return Math.floor(r / 3) * 3 + Math.floor(c / 3); }));
            if (boxes.size !== 1) continue;
            const box = [...boxes][0];
            const br2 = Math.floor(box / 3) * 3, bc2 = (box % 3) * 3;
            const elims: Elim[] = [];
            for (let r = br2; r < br2 + 3; r++) {
              for (let c = bc2; c < bc2 + 3; c++) {
                const idx = r * 9 + c;
                if (!cells.includes(idx) && g[idx].cands.has(d)) { g[idx].cands.delete(d); elims.push({ cellIdx: idx, digit: d }); }
              }
            }
            if (elims.length > 0) {
              steps.push({ technique: 'locked_candidates', label: '封鎖', eliminations: elims, fills: [], sourceCells: cells });
              progress = true;
              break;
            }
          }
          if (progress) break;
        }
      }
    }
    if (progress) continue;

    // ── Hidden Pairs ──
    for (const unit of units) {
      const empty = unit.filter(i => g[i].value === 0);
      const missing: number[] = [];
      for (let d = 1; d <= 9; d++) if (!unit.some(i => g[i].value === d)) missing.push(d);
      for (let a = 0; a < missing.length; a++) {
        for (let b = a + 1; b < missing.length; b++) {
          const d1 = missing[a], d2 = missing[b];
          const cells = empty.filter(i => g[i].cands.has(d1) || g[i].cands.has(d2));
          if (cells.length !== 2) continue;
          const elims: Elim[] = [];
          for (const i of cells) {
            for (const c of [...g[i].cands]) {
              if (c !== d1 && c !== d2) { g[i].cands.delete(c); elims.push({ cellIdx: i, digit: c }); }
            }
          }
          if (elims.length > 0) {
            steps.push({ technique: 'hidden_pair', label: '藏雙', eliminations: elims, fills: [], sourceCells: cells });
            progress = true;
            break;
          }
        }
        if (progress) break;
      }
      if (progress) break;
    }
    if (progress) continue;

    // ── Hidden Triples ──
    for (const unit of units) {
      const empty = unit.filter(i => g[i].value === 0);
      const missing: number[] = [];
      for (let d = 1; d <= 9; d++) if (!unit.some(i => g[i].value === d)) missing.push(d);
      for (let a = 0; a < missing.length; a++) {
        for (let b = a + 1; b < missing.length; b++) {
          for (let c = b + 1; c < missing.length; c++) {
            const ds = [missing[a], missing[b], missing[c]];
            const cells = empty.filter(i => ds.some(d => g[i].cands.has(d)));
            if (cells.length !== 3) continue;
            const elims: Elim[] = [];
            for (const i of cells) {
              for (const cd of [...g[i].cands]) {
                if (!ds.includes(cd)) { g[i].cands.delete(cd); elims.push({ cellIdx: i, digit: cd }); }
              }
            }
            if (elims.length > 0) {
              steps.push({ technique: 'hidden_triple', label: '隱流', eliminations: elims, fills: [], sourceCells: cells });
              progress = true;
              break;
            }
          }
          if (progress) break;
        }
        if (progress) break;
      }
      if (progress) break;
    }
  }

  return steps;
}

// ── Animation ────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function findNoteSpan(cellEl: HTMLElement, digit: number): HTMLElement | null {
  return cellEl.querySelector(`.note-num[data-digit="${digit}"]`) as HTMLElement | null;
}

const TECH_COLORS: Record<string, string> = {
  '領域展開': '#dfe6e9', '明眼': '#74b9ff', '暗眼': '#a29bfe',
  '封鎖': '#00cec9', '藏雙': '#fd79a8', '隱流': '#81ecec', '天劫': '#ff3333',
};

export async function runMentorDemo(): Promise<void> {
  // Setup
  document.getElementById('level-screen')?.style.setProperty('display', 'none');
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (container) container.style.display = 'flex';

  gs.currentLevel = {
    id: -1, stars: 0, difficultyName: '世界', displayName: '弈塵的最後一題',
    puzzle: DEMO_PUZZLE, solution: DEMO_SOLUTION, maxTechnique: 'exocet_death_blossom', source: 'demo',
  };
  gs.cellsData = DEMO_PUZZLE.map(v => ({ value: v, fixed: v !== 0, notes: [] as number[], isError: false }));
  gs.errors = 0; gs.seconds = 0;

  const header = container?.querySelector('header') as HTMLElement | null;
  const infoBar = container?.querySelector('.grid-info-bar') as HTMLElement | null;
  const numpadWrapper = container?.querySelector('.numpad-skill-wrapper') as HTMLElement | null;
  if (header) header.style.display = 'none';
  if (infoBar) infoBar.style.display = 'none';
  if (numpadWrapper) numpadWrapper.style.display = 'none';
  container?.classList.add('demo-backdrop');

  renderGrid();

  const techLabel = document.createElement('div');
  techLabel.id = 'demo-tech-label';
  techLabel.className = 'demo-tech-label';
  document.body.appendChild(techLabel);

  const counter = document.createElement('div');
  counter.id = 'demo-step-counter';
  counter.className = 'demo-step-counter';
  document.body.appendChild(counter);

  let filled = DEMO_PUZZLE.filter(v => v !== 0).length;
  counter.textContent = `${filled}/81`;

  await wait(600);

  // ── Phase 0: 領域展開 ──
  techLabel.textContent = '領域展開';
  techLabel.style.color = TECH_COLORS['領域展開']!;

  const solverGrid = initGrid(DEMO_PUZZLE);
  for (let i = 0; i < 81; i++) {
    if (gs.cellsData[i].value !== 0) continue;
    gs.cellsData[i].notes = [...solverGrid[i].cands].sort();
    const cellEl = gs.gridEl?.children[i] as HTMLElement | undefined;
    if (cellEl) {
      updateCellDisplay(cellEl, gs.cellsData[i]);
      cellEl.classList.add('demo-fill-flash');
      setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 250);
    }
    if (i % 6 === 0) await wait(15);
  }
  await wait(800);
  techLabel.textContent = '';

  // ── Generate REAL steps ──
  const allSteps = generateRealSteps(DEMO_PUZZLE);
  const singlesSteps = allSteps.filter(s => s.technique === 'naked_single' || s.technique === 'hidden_single');
  const midSteps = allSteps.filter(s => s.technique !== 'naked_single' && s.technique !== 'hidden_single');

  // ── Phase 1: Singles blitz ──
  for (let i = 0; i < singlesSteps.length; i++) {
    const step = singlesSteps[i];
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Eliminate candidates
    for (const e of step.eliminations) {
      const notes = gs.cellsData[e.cellIdx].notes;
      const ni = notes.indexOf(e.digit);
      if (ni >= 0) notes.splice(ni, 1);
    }

    // Fill
    for (const f of step.fills) {
      gs.cellsData[f.cellIdx].value = f.digit;
      gs.cellsData[f.cellIdx].notes = [];
      filled++;
      const cellEl = gs.gridEl?.children[f.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        updateCellDisplay(cellEl, gs.cellsData[f.cellIdx]);
        cellEl.classList.add('demo-fill-flash');
        setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 200);
      }
    }

    // Update peer displays
    const updated = new Set(step.eliminations.map(e => e.cellIdx));
    for (const idx of updated) {
      if (gs.cellsData[idx].value === 0) {
        const el = gs.gridEl?.children[idx] as HTMLElement | undefined;
        if (el) updateCellDisplay(el, gs.cellsData[idx]);
      }
    }

    counter.textContent = `${filled}/81`;
    if (i % 3 === 0) await wait(40);
  }

  await wait(500);
  techLabel.textContent = '';

  // ── Phase 2: Mid-tier techniques — show real eliminations ──
  for (const step of midSteps) {
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Highlight source cells
    for (const idx of step.sourceCells) {
      const el = gs.gridEl?.children[idx] as HTMLElement;
      if (el) el.classList.add('demo-skill-pulse');
    }
    await wait(350);

    // Mark elimination targets (amber warning)
    for (const e of step.eliminations) {
      const cellEl = gs.gridEl?.children[e.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        const span = findNoteSpan(cellEl, e.digit);
        if (span) span.classList.add('skill-noise-digit');
      }
    }
    await wait(300);

    // Strike: eliminate
    for (const e of step.eliminations) {
      const cellEl = gs.gridEl?.children[e.cellIdx] as HTMLElement | undefined;
      if (cellEl) {
        const span = findNoteSpan(cellEl, e.digit);
        if (span) { span.classList.remove('skill-noise-digit'); span.classList.add('skill-elim-digit'); }
      }
      const notes = gs.cellsData[e.cellIdx].notes;
      const ni = notes.indexOf(e.digit);
      if (ni >= 0) notes.splice(ni, 1);
    }
    await wait(250);

    // Update cell displays
    const affectedCells = new Set([...step.eliminations.map(e => e.cellIdx), ...step.sourceCells]);
    for (const idx of affectedCells) {
      if (gs.cellsData[idx].value === 0) {
        const el = gs.gridEl?.children[idx] as HTMLElement | undefined;
        if (el) updateCellDisplay(el, gs.cellsData[idx]);
      }
    }

    // Fill cells from this step
    for (const f of step.fills) {
      gs.cellsData[f.cellIdx].value = f.digit;
      gs.cellsData[f.cellIdx].notes = [];
      filled++;
      const el = gs.gridEl?.children[f.cellIdx] as HTMLElement | undefined;
      if (el) {
        updateCellDisplay(el, gs.cellsData[f.cellIdx]);
        el.classList.add('demo-fill-flash');
        setTimeout(() => el.classList.remove('demo-fill-flash'), 400);
      }
    }

    // Clean source pulse
    for (const idx of step.sourceCells) {
      const el = gs.gridEl?.children[idx] as HTMLElement;
      if (el) el.classList.remove('demo-skill-pulse');
    }

    counter.textContent = `${filled}/81`;
    await wait(600);

    // After each mid-tier, re-run singles that got unlocked
    // (candidates already updated, so check for new naked singles)
    let sweepFilled = true;
    while (sweepFilled) {
      sweepFilled = false;
      for (let i = 0; i < 81; i++) {
        if (gs.cellsData[i].value !== 0) continue;
        if (gs.cellsData[i].notes.length === 1) {
          const d = gs.cellsData[i].notes[0];
          gs.cellsData[i].value = d;
          gs.cellsData[i].notes = [];
          filled++;
          sweepFilled = true;
          // Remove from peers
          for (const p of getPeers(i)) {
            const pn = gs.cellsData[p].notes;
            const pi = pn.indexOf(d);
            if (pi >= 0) pn.splice(pi, 1);
          }
          const el = gs.gridEl?.children[i] as HTMLElement | undefined;
          if (el) {
            updateCellDisplay(el, gs.cellsData[i]);
            el.classList.add('demo-fill-flash');
            setTimeout(() => el.classList.remove('demo-fill-flash'), 200);
          }
        }
      }
      // Update all cell displays
      for (let i = 0; i < 81; i++) {
        if (gs.cellsData[i].value === 0) {
          const el = gs.gridEl?.children[i] as HTMLElement | undefined;
          if (el) updateCellDisplay(el, gs.cellsData[i]);
        }
      }
      if (sweepFilled) {
        techLabel.textContent = '明眼';
        techLabel.style.color = TECH_COLORS['明眼']!;
        counter.textContent = `${filled}/81`;
        await wait(80);
      }
    }
  }

  await wait(700);

  // ── Phase 3: 天劫 — the wall ──
  techLabel.textContent = '天劫';
  techLabel.style.color = TECH_COLORS['天劫']!;

  // Highlight all remaining empty cells with red pulse
  const emptyCells: number[] = [];
  for (let i = 0; i < 81; i++) if (gs.cellsData[i].value === 0) emptyCells.push(i);

  for (const idx of emptyCells) {
    const el = gs.gridEl?.children[idx] as HTMLElement;
    if (el) el.classList.add('demo-exocet-pulse');
  }

  // Hold the red pulse — the attempt
  await wait(1500);

  // Nothing happens. Pulse fades.
  techLabel.style.transition = 'opacity 2s';
  techLabel.style.opacity = '0.2';

  await wait(2500);

  // Clean up pulse
  for (const idx of emptyCells) {
    const el = gs.gridEl?.children[idx] as HTMLElement;
    if (el) el.classList.remove('demo-exocet-pulse');
  }

  // ── Freeze ──
  techLabel.textContent = '';
  techLabel.style.opacity = '';
  techLabel.style.transition = '';
  counter.textContent = `${filled}/81`;

  if (gs.gridEl) gs.gridEl.classList.add('demo-frozen');
  await wait(1500);

  // Cleanup
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
