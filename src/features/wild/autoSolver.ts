// Auto-solver preprocessor for World mode.
// Given a puzzle and a set of auto-cast technique keys, solves as far as possible
// using only those techniques, producing a "bottleneck state" for the player.

// Uses a lightweight solver that applies techniques in order:
// naked_single → hidden_single → locked_candidates → naked_pair → hidden_pair
// → naked_triple → hidden_triple
// Stops when no auto-cast technique can make progress.

interface SolverCell {
  value: number;
  candidates: Set<number>;
}

type SolverGrid = SolverCell[];

// ── Grid setup ──────────────────────────────────────────────────────

function initGrid(puzzle: number[], solution: number[]): SolverGrid {
  const grid: SolverGrid = [];
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0) {
      grid.push({ value: puzzle[i], candidates: new Set() });
    } else {
      grid.push({ value: 0, candidates: new Set() });
    }
  }
  // Fill candidates
  for (let i = 0; i < 81; i++) {
    if (grid[i].value !== 0) continue;
    for (let d = 1; d <= 9; d++) {
      if (canPlace(grid, i, d)) grid[i].candidates.add(d);
    }
  }
  return grid;
}

function canPlace(grid: SolverGrid, idx: number, digit: number): boolean {
  const row = Math.floor(idx / 9), col = idx % 9;
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let c = 0; c < 9; c++) { if (grid[row * 9 + c].value === digit) return false; }
  for (let r = 0; r < 9; r++) { if (grid[r * 9 + col].value === digit) return false; }
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r * 9 + c].value === digit) return false;
    }
  }
  return true;
}

function placeDigit(grid: SolverGrid, idx: number, digit: number): void {
  grid[idx].value = digit;
  grid[idx].candidates.clear();
  // Remove from peers
  const row = Math.floor(idx / 9), col = idx % 9;
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let c = 0; c < 9; c++) grid[row * 9 + c].candidates.delete(digit);
  for (let r = 0; r < 9; r++) grid[r * 9 + col].candidates.delete(digit);
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) grid[r * 9 + c].candidates.delete(digit);
  }
}

// ── Technique solvers (return true if progress made) ────────────────

function solveNakedSingles(grid: SolverGrid): boolean {
  let progress = false;
  for (let i = 0; i < 81; i++) {
    if (grid[i].value === 0 && grid[i].candidates.size === 1) {
      const digit = [...grid[i].candidates][0];
      placeDigit(grid, i, digit);
      progress = true;
    }
  }
  return progress;
}

function solveHiddenSingles(grid: SolverGrid): boolean {
  let progress = false;
  const units = getAllUnits();
  for (const unit of units) {
    for (let d = 1; d <= 9; d++) {
      const cells = unit.filter(i => grid[i].value === 0 && grid[i].candidates.has(d));
      if (cells.length === 1) {
        placeDigit(grid, cells[0], d);
        progress = true;
      }
    }
  }
  return progress;
}

function solveLockedCandidates(grid: SolverGrid): boolean {
  let progress = false;
  // Pointing: candidates in a box confined to one row/col → eliminate from rest of row/col
  for (let box = 0; box < 9; box++) {
    const br = Math.floor(box / 3) * 3, bc = (box % 3) * 3;
    const boxCells: number[] = [];
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) boxCells.push(r * 9 + c);

    for (let d = 1; d <= 9; d++) {
      const cells = boxCells.filter(i => grid[i].value === 0 && grid[i].candidates.has(d));
      if (cells.length < 2) continue;

      const rows = new Set(cells.map(i => Math.floor(i / 9)));
      const cols = new Set(cells.map(i => i % 9));

      if (rows.size === 1) {
        const row = [...rows][0];
        for (let c = 0; c < 9; c++) {
          const idx = row * 9 + c;
          if (!boxCells.includes(idx) && grid[idx].candidates.delete(d)) progress = true;
        }
      }
      if (cols.size === 1) {
        const col = [...cols][0];
        for (let r = 0; r < 9; r++) {
          const idx = r * 9 + col;
          if (!boxCells.includes(idx) && grid[idx].candidates.delete(d)) progress = true;
        }
      }
    }
  }
  // Claiming: candidates in a row/col confined to one box → eliminate from rest of box
  for (let line = 0; line < 9; line++) {
    for (const lineType of ['row', 'col'] as const) {
      for (let d = 1; d <= 9; d++) {
        const cells: number[] = [];
        for (let i = 0; i < 9; i++) {
          const idx = lineType === 'row' ? line * 9 + i : i * 9 + line;
          if (grid[idx].value === 0 && grid[idx].candidates.has(d)) cells.push(idx);
        }
        if (cells.length < 2) continue;
        const boxes = new Set(cells.map(i => {
          const r = Math.floor(i / 9), c = i % 9;
          return Math.floor(r / 3) * 3 + Math.floor(c / 3);
        }));
        if (boxes.size === 1) {
          const box = [...boxes][0];
          const br = Math.floor(box / 3) * 3, bc = (box % 3) * 3;
          for (let r = br; r < br + 3; r++) {
            for (let c = bc; c < bc + 3; c++) {
              const idx = r * 9 + c;
              if (!cells.includes(idx) && grid[idx].candidates.delete(d)) progress = true;
            }
          }
        }
      }
    }
  }
  return progress;
}

function solveNakedSubsets(grid: SolverGrid, size: 2 | 3): boolean {
  let progress = false;
  const units = getAllUnits();
  for (const unit of units) {
    const emptyCells = unit.filter(i => grid[i].value === 0);
    const combos = combinations(emptyCells, size);
    for (const combo of combos) {
      const union = new Set<number>();
      for (const i of combo) for (const d of grid[i].candidates) union.add(d);
      if (union.size !== size) continue;
      // Eliminate union digits from other cells in unit
      for (const i of emptyCells) {
        if (combo.includes(i)) continue;
        for (const d of union) {
          if (grid[i].candidates.delete(d)) progress = true;
        }
      }
    }
  }
  return progress;
}

function solveHiddenSubsets(grid: SolverGrid, size: 2 | 3): boolean {
  let progress = false;
  const units = getAllUnits();
  for (const unit of units) {
    const emptyCells = unit.filter(i => grid[i].value === 0);
    // Find digits that still need placing
    const missingDigits: number[] = [];
    for (let d = 1; d <= 9; d++) {
      if (!unit.some(i => grid[i].value === d)) missingDigits.push(d);
    }
    const digitCombos = combinations(missingDigits, size);
    for (const digits of digitCombos) {
      // Find cells that contain ANY of these digits
      const cells = emptyCells.filter(i => digits.some(d => grid[i].candidates.has(d)));
      if (cells.length !== size) continue;
      // Remove all OTHER candidates from these cells
      for (const i of cells) {
        for (const d of [...grid[i].candidates]) {
          if (!digits.includes(d)) {
            if (grid[i].candidates.delete(d)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getAllUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: number[] = [];
    for (let c = 0; c < 9; c++) row.push(r * 9 + c);
    units.push(row);
  }
  for (let c = 0; c < 9; c++) {
    const col: number[] = [];
    for (let r = 0; r < 9; r++) col.push(r * 9 + c);
    units.push(col);
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    const box: number[] = [];
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) box.push(r * 9 + c);
    units.push(box);
  }
  return units;
}

function combinations<T>(arr: T[], size: number): T[][] {
  if (size === 1) return arr.map(x => [x]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const rest = combinations(arr.slice(i + 1), size - 1);
    for (const combo of rest) result.push([arr[i], ...combo]);
  }
  return result;
}

// ── Solver dispatch ─────────────────────────────────────────────────

// Technique keys in solve order. Each maps to a solver function.
const SOLVER_STEPS: { key: string; fn: (grid: SolverGrid) => boolean }[] = [
  { key: 'naked_single',      fn: solveNakedSingles },
  { key: 'hidden_single',     fn: solveHiddenSingles },
  { key: 'locked_candidates', fn: solveLockedCandidates },
  { key: 'naked_pair',        fn: (g) => solveNakedSubsets(g, 2) },
  { key: 'hidden_pair',       fn: (g) => solveHiddenSubsets(g, 2) },
  { key: 'naked_triple',      fn: (g) => solveNakedSubsets(g, 3) },
  { key: 'hidden_triple',     fn: (g) => solveHiddenSubsets(g, 3) },
];

/**
 * Auto-solve a puzzle using only the given technique keys.
 * Returns the partially-solved puzzle array (0 = unsolved cell) and
 * the candidate notes for each unsolved cell.
 */
export function autoSolve(
  puzzle: number[],
  solution: number[],
  autoCastKeys: Set<string>,
): { partialPuzzle: number[]; notes: number[][] } {
  const grid = initGrid(puzzle, solution);

  // Only use solvers whose key is in autoCastKeys
  const activeSolvers = SOLVER_STEPS.filter(s => autoCastKeys.has(s.key));

  // Iterate until no solver makes progress
  let changed = true;
  while (changed) {
    changed = false;
    for (const solver of activeSolvers) {
      if (solver.fn(grid)) {
        changed = true;
        // After any progress, restart from the simplest solver
        break;
      }
    }
  }

  // Extract result
  const partialPuzzle = grid.map(c => c.value);
  const notes = grid.map(c => c.value === 0 ? [...c.candidates].sort() : []);
  return { partialPuzzle, notes };
}
