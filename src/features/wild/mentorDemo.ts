// Mentor demo — 弈塵's power demonstration on first World entry.
// Uses the real Exocet puzzle (index 19) to show a full solve path,
// then freezes at the final 天劫 steps.

import { renderGrid, updateCellDisplay } from '../../game/board';
import { gs } from '../../game/state';

// ── The real Exocet puzzle (baked in to avoid async loading) ─────────
// This is generated/exocet_death_blossom.json[19]
// Solve path: naked_single(46) + hidden_single(9) + locked_candidates(4) +
//             hidden_pair(1) + naked_pair(1) + naked_triple(1) + exocet(4)

const DEMO_PUZZLE = [
  6, 0, 0, 0, 4, 7, 0, 0, 9, 0, 0, 0, 2, 0, 5, 0, 6, 0, 0, 4, 0, 0, 0, 0, 0, 2, 3, 0, 0, 4, 1, 6, 2, 9, 0, 0, 9, 0, 0,
  3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 7, 0, 0, 9, 2, 0, 0, 3, 8, 0, 0, 0, 0,
  0, 0, 7,
];
const DEMO_SOLUTION = [
  6, 2, 3, 8, 4, 7, 5, 1, 9, 7, 9, 1, 2, 3, 5, 4, 6, 8, 5, 4, 8, 9, 1, 6, 7, 2, 3, 8, 3, 4, 1, 6, 2, 9, 7, 5, 9, 7, 6,
  3, 5, 4, 1, 8, 2, 2, 1, 5, 7, 9, 8, 3, 4, 6, 4, 6, 2, 5, 7, 3, 8, 9, 1, 1, 5, 7, 6, 8, 9, 2, 3, 4, 3, 8, 9, 4, 2, 1,
  6, 5, 7,
];

// ── Solver for demo (deterministic, step-by-step) ────────────────────

interface DemoStep {
  type:
    | 'naked_single'
    | 'hidden_single'
    | 'locked_candidates'
    | 'naked_pair'
    | 'hidden_pair'
    | 'naked_triple'
    | 'exocet';
  label: string;
  cells: number[]; // cells involved
  fillCells?: { idx: number; digit: number }[]; // cells to fill
  elimCells?: { idx: number; digit: number }[]; // candidates to eliminate
}

function getPeers(idx: number): Set<number> {
  const r = Math.floor(idx / 9),
    c = idx % 9;
  const br = Math.floor(r / 3) * 3,
    bc = Math.floor(c / 3) * 3;
  const peers = new Set<number>();
  for (let i = 0; i < 9; i++) {
    peers.add(r * 9 + i);
    peers.add(i * 9 + c);
  }
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) peers.add((br + dr) * 9 + (bc + dc));
  peers.delete(idx);
  return peers;
}

function getCandidates(grid: number[], idx: number): Set<number> {
  if (grid[idx] !== 0) return new Set();
  const cands = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const p of getPeers(idx)) cands.delete(grid[p]);
  return cands;
}

/** Generate the solve steps for the demo puzzle using only singles. */
function generateDemoSteps(puzzle: number[], solution: number[]): DemoStep[] {
  const grid = [...puzzle];
  const steps: DemoStep[] = [];
  let changed = true;

  while (changed) {
    changed = false;

    // Naked singles
    for (let i = 0; i < 81; i++) {
      if (grid[i] !== 0) continue;
      const cands = getCandidates(grid, i);
      if (cands.size === 1) {
        const digit = [...cands][0];
        grid[i] = digit;
        steps.push({
          type: 'naked_single',
          label: '明眼',
          cells: [i],
          fillCells: [{ idx: i, digit }],
        });
        changed = true;
      }
    }

    // Hidden singles
    const units: number[][] = [];
    for (let r = 0; r < 9; r++) {
      const u: number[] = [];
      for (let c = 0; c < 9; c++) u.push(r * 9 + c);
      units.push(u);
    }
    for (let c = 0; c < 9; c++) {
      const u: number[] = [];
      for (let r = 0; r < 9; r++) u.push(r * 9 + c);
      units.push(u);
    }
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3,
        bc = (b % 3) * 3;
      const u: number[] = [];
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) u.push((br + dr) * 9 + (bc + dc));
      units.push(u);
    }

    for (const unit of units) {
      for (let d = 1; d <= 9; d++) {
        const positions: number[] = [];
        let found = false;
        for (const c of unit) {
          if (grid[c] === d) {
            found = true;
            break;
          }
          if (grid[c] === 0 && getCandidates(grid, c).has(d)) positions.push(c);
        }
        if (found) continue;
        if (positions.length === 1) {
          grid[positions[0]] = d;
          steps.push({
            type: 'hidden_single',
            label: '暗眼',
            cells: [positions[0]],
            fillCells: [{ idx: positions[0], digit: d }],
          });
          changed = true;
        }
      }
    }
  }

  // After singles exhaust, add placeholder steps for mid-tier and exocet
  // Fill remaining using solution, attributing to appropriate techniques
  const midTierTechs: DemoStep[] = [
    { type: 'locked_candidates', label: '封鎖', cells: [], fillCells: [] },
    { type: 'locked_candidates', label: '封鎖', cells: [], fillCells: [] },
    { type: 'naked_pair', label: '雙契', cells: [], fillCells: [] },
    { type: 'hidden_pair', label: '藏雙', cells: [], fillCells: [] },
    { type: 'naked_triple', label: '編織', cells: [], fillCells: [] },
    { type: 'locked_candidates', label: '封鎖', cells: [], fillCells: [] },
    { type: 'locked_candidates', label: '封鎖', cells: [], fillCells: [] },
  ];

  const exocetSteps: DemoStep[] = [
    { type: 'exocet', label: '天劫', cells: [], fillCells: [] },
    { type: 'exocet', label: '天劫', cells: [], fillCells: [] },
    { type: 'exocet', label: '天劫', cells: [], fillCells: [] },
    { type: 'exocet', label: '天劫', cells: [], fillCells: [] },
  ];

  // Distribute remaining unfilled cells across mid-tier and exocet steps
  const unfilled: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) unfilled.push(i);
  }

  // First batch: mid-tier techniques solve ~65% of remaining
  const midCount = Math.floor(unfilled.length * 0.65);
  const exocetCount = unfilled.length - midCount;
  for (let i = 0; i < midCount; i++) {
    const step = midTierTechs[i % midTierTechs.length];
    const idx = unfilled[i];
    step.cells.push(idx);
    step.fillCells!.push({ idx, digit: solution[idx] });
  }

  // Last batch: exocet steps
  for (let i = 0; i < exocetCount; i++) {
    const step = exocetSteps[i % exocetSteps.length];
    const idx = unfilled[midCount + i];
    step.cells.push(idx);
    step.fillCells!.push({ idx, digit: solution[idx] });
  }

  // Add non-empty mid-tier steps
  for (const s of midTierTechs) {
    if (s.fillCells!.length > 0) steps.push(s);
  }

  // Add exocet steps
  for (const s of exocetSteps) {
    if (s.fillCells!.length > 0) steps.push(s);
  }

  return steps;
}

// ── Demo animation ────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const TECH_COLORS: Record<string, string> = {
  明眼: 'rgba(116, 185, 255, 0.5)',
  暗眼: 'rgba(162, 155, 254, 0.5)',
  封鎖: 'rgba(0, 206, 201, 0.5)',
  雙契: 'rgba(255, 177, 66, 0.5)',
  藏雙: 'rgba(253, 121, 168, 0.5)',
  編織: 'rgba(85, 239, 196, 0.5)',
  天劫: 'rgba(255, 50, 50, 0.7)',
};

/** Run the full mentor demo. Returns when demo is complete. */
export async function runMentorDemo(): Promise<void> {
  // Set up the demo puzzle in the game state
  const demoLevel = {
    id: -1,
    stars: 0,
    difficultyName: '世界',
    displayName: '弈塵的最後一題',
    puzzle: DEMO_PUZZLE,
    solution: DEMO_SOLUTION,
    maxTechnique: 'exocet_death_blossom',
    source: 'demo' as string,
  };

  // Show the game screen with the demo puzzle
  document.getElementById('level-screen')?.style.setProperty('display', 'none');
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (container) container.style.display = 'flex';

  // Initialize cell data manually (don't use initGame to avoid timer/lives)
  gs.currentLevel = demoLevel;
  gs.cellsData = DEMO_PUZZLE.map((val) => ({
    value: val,
    fixed: val !== 0,
    notes: [] as number[],
    isError: false,
  }));
  gs.errors = 0;
  gs.seconds = 0;

  // Hide game chrome
  const header = container?.querySelector('header') as HTMLElement | null;
  const infoBar = container?.querySelector('.grid-info-bar') as HTMLElement | null;
  const numpadWrapper = container?.querySelector('.numpad-skill-wrapper') as HTMLElement | null;
  if (header) header.style.display = 'none';
  if (infoBar) infoBar.style.display = 'none';
  if (numpadWrapper) numpadWrapper.style.display = 'none';

  // Render grid
  renderGrid();

  // Create the technique name overlay
  const techLabel = document.createElement('div');
  techLabel.id = 'demo-tech-label';
  techLabel.className = 'demo-tech-label';
  document.body.appendChild(techLabel);

  // Create step counter
  const stepCounter = document.createElement('div');
  stepCounter.id = 'demo-step-counter';
  stepCounter.className = 'demo-step-counter';
  document.body.appendChild(stepCounter);

  await wait(800);

  // Generate solve steps
  const steps = generateDemoSteps(DEMO_PUZZLE, DEMO_SOLUTION);

  // Group steps by phase
  const singlesSteps = steps.filter((s) => s.type === 'naked_single' || s.type === 'hidden_single');
  const midSteps = steps.filter((s) => !['naked_single', 'hidden_single', 'exocet'].includes(s.type));
  const exocetSteps = steps.filter((s) => s.type === 'exocet');

  let totalFilled = DEMO_PUZZLE.filter((v) => v !== 0).length;
  stepCounter.textContent = `${totalFilled}/81`;

  // ── Phase 1: Singles blitz (fast) ──
  techLabel.textContent = '';
  for (let i = 0; i < singlesSteps.length; i++) {
    const step = singlesSteps[i];
    // Flash technique name briefly
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Fill cells
    for (const fill of step.fillCells ?? []) {
      gs.cellsData[fill.idx].value = fill.digit;
      gs.cellsData[fill.idx].fixed = false;
      const cellEl = gs.gridEl?.children[fill.idx] as HTMLElement | undefined;
      if (cellEl) {
        updateCellDisplay(cellEl, gs.cellsData[fill.idx]);
        cellEl.classList.add('demo-fill-flash');
        setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 300);
      }
      totalFilled++;
    }
    stepCounter.textContent = `${totalFilled}/81`;

    // Speed: fast for singles, batch every 2-3 steps
    if (i % 3 === 0) await wait(50);
  }

  await wait(400);
  techLabel.textContent = '';

  // ── Phase 2: Mid-tier techniques (medium speed) ──
  for (const step of midSteps) {
    techLabel.textContent = step.label;
    techLabel.style.color = TECH_COLORS[step.label] ?? '#fff';

    // Highlight source cells briefly
    for (const cellIdx of step.cells) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement;
      if (cellEl) cellEl.classList.add('demo-skill-pulse');
    }
    await wait(300);

    // Fill cells
    for (const fill of step.fillCells ?? []) {
      gs.cellsData[fill.idx].value = fill.digit;
      gs.cellsData[fill.idx].fixed = false;
      const cellEl = gs.gridEl?.children[fill.idx] as HTMLElement | undefined;
      if (cellEl) {
        updateCellDisplay(cellEl, gs.cellsData[fill.idx]);
        cellEl.classList.add('demo-fill-flash');
        setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 400);
      }
      totalFilled++;
    }
    stepCounter.textContent = `${totalFilled}/81`;

    // Clean up pulse
    for (const cellIdx of step.cells) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement;
      if (cellEl) cellEl.classList.remove('demo-skill-pulse');
    }

    await wait(500);

    // After each mid-tier, do a quick singles sweep
    techLabel.textContent = '明眼';
    techLabel.style.color = TECH_COLORS['明眼']!;
    await wait(100);
  }

  await wait(600);

  // ── Phase 3: Exocet — slow down, then freeze ──
  const exocetToShow = exocetSteps.slice(0, 3); // Show 3 successful, freeze on 4th
  const lastExocet = exocetSteps[3]; // The one that breaks him

  for (let i = 0; i < exocetToShow.length; i++) {
    const step = exocetToShow[i];
    techLabel.textContent = '天劫';
    techLabel.style.color = TECH_COLORS['天劫']!;

    // Slower, more dramatic
    for (const cellIdx of step.cells) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement;
      if (cellEl) cellEl.classList.add('demo-exocet-pulse');
    }
    await wait(600);

    for (const fill of step.fillCells ?? []) {
      gs.cellsData[fill.idx].value = fill.digit;
      gs.cellsData[fill.idx].fixed = false;
      const cellEl = gs.gridEl?.children[fill.idx] as HTMLElement | undefined;
      if (cellEl) {
        updateCellDisplay(cellEl, gs.cellsData[fill.idx]);
        cellEl.classList.add('demo-fill-flash');
        setTimeout(() => cellEl.classList.remove('demo-fill-flash'), 500);
      }
      totalFilled++;
    }
    stepCounter.textContent = `${totalFilled}/81`;

    for (const cellIdx of step.cells) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement;
      if (cellEl) cellEl.classList.remove('demo-exocet-pulse');
    }

    await wait(800 + i * 200); // Each one slower
  }

  // ── The final freeze ──
  if (lastExocet && lastExocet.cells.length > 0) {
    techLabel.textContent = '天劫';
    techLabel.style.color = TECH_COLORS['天劫']!;

    for (const cellIdx of lastExocet.cells) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement;
      if (cellEl) cellEl.classList.add('demo-exocet-pulse');
    }

    await wait(1000);

    // Pulse fades... nothing happens
    techLabel.style.transition = 'opacity 1.5s';
    techLabel.style.opacity = '0.3';

    await wait(1500);
  }

  // ── Freeze state — show remaining empty cells ──
  techLabel.textContent = '';
  techLabel.style.opacity = '';
  techLabel.style.transition = '';

  stepCounter.textContent = `${totalFilled}/81`;

  // Dim the grid slightly
  if (gs.gridEl) gs.gridEl.classList.add('demo-frozen');

  await wait(1000);

  // Clean up demo UI elements
  techLabel.remove();
  stepCounter.remove();

  // Restore game chrome (hidden for now, will be shown when real game starts)
  if (header) header.style.display = '';
  if (infoBar) infoBar.style.display = '';
  if (numpadWrapper) numpadWrapper.style.display = '';

  // Hide game container, show level screen
  if (container) container.style.display = 'none';
  document.getElementById('level-screen')?.style.setProperty('display', 'flex');

  // Clean up frozen state
  if (gs.gridEl) gs.gridEl.classList.remove('demo-frozen');

  // Clean up any remaining demo classes
  if (gs.gridEl) {
    Array.from(gs.gridEl.children).forEach((c) => {
      c.classList.remove('demo-fill-flash', 'demo-skill-pulse', 'demo-exocet-pulse');
    });
  }
}
