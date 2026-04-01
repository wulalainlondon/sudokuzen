// Shared fish detection — parameterized by size (2=X-Wing, 3=Swordfish, 4=Jellyfish)

import { SolverBoard } from '../board';
import { digitBit } from './bitmask';
import { combinations } from './combinations';
import type { DetectionAction, DetectionResult, TechniqueName } from '../types';

function _cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

const FISH_NAMES: Record<number, { name: TechniqueName; label: string }> = {
  2: { name: 'x_wing', label: 'X-Wing' },
  3: { name: 'swordfish', label: 'Swordfish' },
  4: { name: 'jellyfish', label: 'Jellyfish' },
};

const FINNED_NAMES: Record<number, { name: TechniqueName; label: string }> = {
  2: { name: 'finned_x_wing', label: 'Finned X-Wing' },
  3: { name: 'finned_swordfish', label: 'Finned Swordfish' },
  4: { name: 'finned_jellyfish', label: 'Finned Jellyfish' },
};

/**
 * Detect a basic fish of given size for all digits.
 * Checks rows as base, cols as cover (and vice versa).
 */
export function detectFish(board: SolverBoard, size: number): DetectionResult | null {
  const meta = FISH_NAMES[size];
  if (!meta) return null;

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    // Try rows as base lines
    const result = tryFish(board, d, bit, size, SolverBoard.ROW_CELLS, SolverBoard.COL_CELLS, 'row', meta);
    if (result) return result;

    // Try cols as base lines
    const result2 = tryFish(board, d, bit, size, SolverBoard.COL_CELLS, SolverBoard.ROW_CELLS, 'col', meta);
    if (result2) return result2;
  }
  return null;
}

function tryFish(
  board: SolverBoard,
  d: number,
  bit: number,
  size: number,
  baseLines: number[][],
  coverLines: number[][],
  baseType: 'row' | 'col',
  meta: { name: TechniqueName; label: string },
): DetectionResult | null {
  // Find base lines where digit d appears in 2..size positions
  const eligibleBases: { lineIdx: number; positions: number[] }[] = [];
  for (let li = 0; li < 9; li++) {
    const cells = baseLines[li].filter((i) => (board.candidates[i] & bit) !== 0);
    if (cells.length >= 2 && cells.length <= size) {
      eligibleBases.push({ lineIdx: li, positions: cells });
    }
  }
  if (eligibleBases.length < size) return null;

  for (const combo of combinations(eligibleBases, size)) {
    // Collect all cover line indices used
    const coverSet = new Set<number>();
    const patternCells: number[] = [];
    for (const base of combo) {
      for (const cell of base.positions) {
        const coverIdx = baseType === 'row' ? SolverBoard.CELL_COL[cell] : SolverBoard.CELL_ROW[cell];
        coverSet.add(coverIdx);
        patternCells.push(cell);
      }
    }
    if (coverSet.size !== size) continue; // not a valid fish

    // Find eliminations: digit d in cover lines but NOT in base lines
    const baseSet = new Set(combo.map((b) => b.lineIdx));
    const actions: DetectionAction[] = [];
    for (const ci of coverSet) {
      for (const cell of coverLines[ci]) {
        if ((board.candidates[cell] & bit) === 0) continue;
        const cellBase = baseType === 'row' ? SolverBoard.CELL_ROW[cell] : SolverBoard.CELL_COL[cell];
        if (baseSet.has(cellBase)) continue;
        actions.push({ kind: 'eliminate', cell, digit: d });
      }
    }
    if (actions.length === 0) continue;

    return {
      technique: meta.name,
      actions,
      patternCells,
      description: `${meta.label}: digit ${d} forms a ${size}-line fish, eliminate ${actions.length} candidates`,
    };
  }
  return null;
}

/**
 * Detect a finned fish of given size.
 */
export function detectFinnedFish(board: SolverBoard, size: number): DetectionResult | null {
  const meta = FINNED_NAMES[size];
  if (!meta) return null;

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);
    const result = tryFinnedFish(board, d, bit, size, SolverBoard.ROW_CELLS, SolverBoard.COL_CELLS, 'row', meta);
    if (result) return result;
    const result2 = tryFinnedFish(board, d, bit, size, SolverBoard.COL_CELLS, SolverBoard.ROW_CELLS, 'col', meta);
    if (result2) return result2;
  }
  return null;
}

function tryFinnedFish(
  board: SolverBoard,
  d: number,
  bit: number,
  size: number,
  baseLines: number[][],
  coverLines: number[][],
  baseType: 'row' | 'col',
  meta: { name: TechniqueName; label: string },
): DetectionResult | null {
  // Find base lines where digit d appears in 2..size+1 positions
  const eligibleBases: { lineIdx: number; positions: number[] }[] = [];
  for (let li = 0; li < 9; li++) {
    const cells = baseLines[li].filter((i) => (board.candidates[i] & bit) !== 0);
    if (cells.length >= 2 && cells.length <= size + 1) {
      eligibleBases.push({ lineIdx: li, positions: cells });
    }
  }
  if (eligibleBases.length < size) return null;

  for (const combo of combinations(eligibleBases, size)) {
    const coverSet = new Set<number>();
    const allCells: number[] = [];
    for (const base of combo) {
      for (const cell of base.positions) {
        coverSet.add(baseType === 'row' ? SolverBoard.CELL_COL[cell] : SolverBoard.CELL_ROW[cell]);
        allCells.push(cell);
      }
    }
    // A finned fish has exactly size+1 cover lines (one fin)
    if (coverSet.size !== size + 1) continue;

    // Find which cells are fins (not covered by the size cover lines)
    // Try each subset of size cover lines
    const coverArr = [...coverSet];
    for (const coverCombo of combinations(coverArr, size)) {
      const mainCovers = new Set(coverCombo);
      const fins: number[] = [];
      const patternCells: number[] = [];
      for (const cell of allCells) {
        const ci = baseType === 'row' ? SolverBoard.CELL_COL[cell] : SolverBoard.CELL_ROW[cell];
        if (mainCovers.has(ci)) {
          patternCells.push(cell);
        } else {
          fins.push(cell);
        }
      }
      if (fins.length === 0 || fins.length > 2) continue;

      // Eliminations: cells that see ALL fins AND are in cover lines but not base lines
      const finPeers = board.commonPeers(fins);
      const finPeerSet = new Set(finPeers);
      const baseSet = new Set(combo.map((b) => b.lineIdx));
      const actions: DetectionAction[] = [];

      for (const ci of mainCovers) {
        for (const cell of coverLines[ci]) {
          if ((board.candidates[cell] & bit) === 0) continue;
          const cellBase = baseType === 'row' ? SolverBoard.CELL_ROW[cell] : SolverBoard.CELL_COL[cell];
          if (baseSet.has(cellBase)) continue;
          if (!finPeerSet.has(cell)) continue;
          actions.push({ kind: 'eliminate', cell, digit: d });
        }
      }
      if (actions.length === 0) continue;

      return {
        technique: meta.name,
        actions,
        patternCells: [...patternCells, ...fins],
        description: `${meta.label}: digit ${d} finned fish, eliminate ${actions.length} candidates`,
      };
    }
  }
  return null;
}
