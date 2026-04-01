import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * XY-Wing:
 * Pivot cell {a,b}, wing1 {a,c} sees pivot, wing2 {b,c} sees pivot.
 * Cells that see both wings can eliminate candidate c.
 */
export function detectXYWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  for (const pivot of bivals) {
    const pivotCands = board.candidates[pivot];
    const [a, b] = bitsToDigits(pivotCands);

    for (let wi = 0; wi < bivals.length; wi++) {
      const wing1 = bivals[wi];
      if (wing1 === pivot) continue;
      if (!board.seesCell(pivot, wing1)) continue;
      const w1Cands = board.candidates[wing1];

      // wing1 must contain a but not b, with an extra digit c
      let sharedWithPivot: number;
      let c1: number;
      const w1Digits = bitsToDigits(w1Cands);
      if (w1Digits.includes(a) && !w1Digits.includes(b)) {
        sharedWithPivot = a;
        c1 = w1Digits[0] === a ? w1Digits[1] : w1Digits[0];
      } else if (w1Digits.includes(b) && !w1Digits.includes(a)) {
        sharedWithPivot = b;
        c1 = w1Digits[0] === b ? w1Digits[1] : w1Digits[0];
      } else {
        continue;
      }

      const otherPivotDigit = sharedWithPivot === a ? b : a;
      const c = c1;

      // Find wing2: contains otherPivotDigit and c, sees pivot
      for (let wj = wi + 1; wj < bivals.length; wj++) {
        const wing2 = bivals[wj];
        if (wing2 === pivot) continue;
        if (!board.seesCell(pivot, wing2)) continue;
        const w2Cands = board.candidates[wing2];
        const w2Digits = bitsToDigits(w2Cands);
        if (!w2Digits.includes(otherPivotDigit) || !w2Digits.includes(c)) continue;

        // Eliminate: cells that see both wing1 and wing2 and have candidate c
        const commonPeers = board.commonPeers([wing1, wing2]);
        const actions: DetectionAction[] = [];
        for (const cell of commonPeers) {
          if (cell === pivot) continue;
          if (board.hasCandidate(cell, c)) {
            actions.push({ kind: 'eliminate', cell, digit: c });
          }
        }
        if (actions.length === 0) continue;

        return {
          technique: 'xy_wing',
          actions,
          patternCells: [pivot, wing1, wing2],
          description: `XY-Wing: pivot ${cellRef(pivot)}{${a},${b}}, wings ${cellRef(wing1)} and ${cellRef(wing2)}, eliminate candidate ${c} in ${actions.length} cells`,
        };
      }
    }
  }
  return null;
}
