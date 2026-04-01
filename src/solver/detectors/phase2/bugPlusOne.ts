import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * BUG+1 (Bivalue Universal Grave +1):
 * All empty cells have exactly 2 candidates, except one cell with 3 candidates.
 * In that exception cell, the extra digit appearing 3 times in some unit is the correct fill value.
 * (Otherwise the board would fall into a BUG deadly pattern -> multiple solutions.)
 */
export function detectBugPlusOne(board: SolverBoard): DetectionResult | null {
  const empty = board.emptyCells;
  if (empty.length < 3) return null;

  let triCell = -1;
  for (const cell of empty) {
    const cnt = board.candidateCount(cell);
    if (cnt === 2) continue;
    if (cnt === 3 && triCell === -1) {
      triCell = cell;
    } else {
      // More than one non-bivalue cell, or cell with >3 candidates -> not BUG+1
      return null;
    }
  }
  if (triCell === -1) return null;

  // Find which digit in the exception cell appears 3 times in some unit
  const triDigits = bitsToDigits(board.candidates[triCell]);
  const units = SolverBoard.CELL_UNITS[triCell]; // [rowUnit, colUnit, boxUnit]

  for (const d of triDigits) {
    for (const unitIdx of units) {
      const count = board.digitCellsInUnit(unitIdx, d).length;
      if (count === 3) {
        // This digit is the one to fill
        return {
          technique: 'bug_plus_one',
          actions: [{ kind: 'fill', cell: triCell, digit: d }],
          patternCells: empty,
          description: `BUG+1: all empty cells bivalue, only ${cellRef(triCell)} has 3 candidates. Digit ${d} appears 3 times in a unit, fill ${d}`,
        };
      }
    }
  }
  return null;
}
