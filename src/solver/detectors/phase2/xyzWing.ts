import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit, bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * XYZ-Wing:
 * Pivot cell {a,b,c} (3 candidates), wing1 {a,c} sees pivot, wing2 {b,c} sees pivot.
 * Cells that see the pivot and both wings can eliminate candidate c.
 */
export function detectXYZWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  for (const pivot of board.emptyCells) {
    if (board.candidateCount(pivot) !== 3) continue;
    const pivotMask = board.candidates[pivot];
    const pivotDigits = bitsToDigits(pivotMask);

    // Try each pair of candidates as (a,b), the remaining one is c
    for (let ci = 0; ci < 3; ci++) {
      const c = pivotDigits[ci];
      const cBit = digitBit(c);
      const others = pivotDigits.filter((_, idx) => idx !== ci);
      const a = others[0];
      const b = others[1];

      // Find wing1 = bivalue {a,c}
      for (const wing1 of bivals) {
        if (wing1 === pivot) continue;
        if (!board.seesCell(pivot, wing1)) continue;
        const w1 = board.candidates[wing1];
        if (w1 !== (digitBit(a) | cBit)) continue;

        // Find wing2 = bivalue {b,c}
        for (const wing2 of bivals) {
          if (wing2 === pivot || wing2 === wing1) continue;
          if (!board.seesCell(pivot, wing2)) continue;
          const w2 = board.candidates[wing2];
          if (w2 !== (digitBit(b) | cBit)) continue;

          // Eliminate: cells that see pivot, wing1, and wing2 with candidate c
          const commonPeers = board.commonPeers([pivot, wing1, wing2]);
          const actions: DetectionAction[] = [];
          for (const cell of commonPeers) {
            if (board.hasCandidate(cell, c)) {
              actions.push({ kind: 'eliminate', cell, digit: c });
            }
          }
          if (actions.length === 0) continue;

          return {
            technique: 'xyz_wing',
            actions,
            patternCells: [pivot, wing1, wing2],
            description: `XYZ-Wing: pivot ${cellRef(pivot)}{${a},${b},${c}}, wings ${cellRef(wing1)} and ${cellRef(wing2)}, eliminate candidate ${c} in ${actions.length} cells`,
          };
        }
      }
    }
  }
  return null;
}
