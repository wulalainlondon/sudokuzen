// Almost Locked Set (ALS) finder
// An ALS is a set of N cells in a unit whose union of candidates has exactly N+1 digits.

import { SolverBoard } from '../board';
import { popcount } from './bitmask';
import { combinations } from './combinations';

export interface AlmostLockedSet {
  cells: number[];
  candidates: number; // bitmask
  unitIdx: number;
}

/** Find all ALS in the board (up to size 4 cells for performance) */
export function findAllALS(board: SolverBoard, maxSize = 4): AlmostLockedSet[] {
  const result: AlmostLockedSet[] = [];

  for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
    const emptyCells = SolverBoard.ALL_UNITS[unitIdx].filter((i) => board.values[i] === 0);
    const maxK = Math.min(maxSize, emptyCells.length);

    for (let k = 1; k <= maxK; k++) {
      for (const combo of combinations(emptyCells, k)) {
        let union = 0;
        for (const cell of combo) union |= board.candidates[cell];
        // ALS: N cells with exactly N+1 candidates
        if (popcount(union) === k + 1) {
          result.push({ cells: combo, candidates: union, unitIdx });
        }
      }
    }
  }

  return result;
}
