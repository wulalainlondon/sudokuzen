import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Skyscraper:
 * For digit d, find two conjugate pairs (only 2 candidate positions in a row or column).
 * One end of each pair aligns on the same cross-line (shared baseline),
 * while the other two ends are not aligned. Eliminate d from common peers of those two free ends.
 */
export function detectSkyscraper(board: SolverBoard): DetectionResult | null {
  const allPairs = findConjugatePairs(board);

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    // Collect conjugate pairs for digit d in rows (unitIdx 0..8 = rows)
    const rowPairs = allPairs.filter((p) => p.digit === d && p.unitIdx < 9);
    // Collect conjugate pairs for digit d in columns (unitIdx 9..17 = cols)
    const colPairs = allPairs.filter((p) => p.digit === d && p.unitIdx >= 9 && p.unitIdx < 18);

    // Try row pairs -> column alignment
    const result = trySkyscraper(board, d, bit, rowPairs, 'row');
    if (result) return result;

    // Try column pairs -> row alignment
    const result2 = trySkyscraper(board, d, bit, colPairs, 'col');
    if (result2) return result2;
  }
  return null;
}

function trySkyscraper(
  board: SolverBoard,
  d: number,
  bit: number,
  pairs: { cellA: number; cellB: number; unitIdx: number }[],
  baseType: 'row' | 'col',
): DetectionResult | null {
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const p1 = pairs[i];
      const p2 = pairs[j];

      // Try 4 endpoint pairings to find a combination sharing the same cross-line
      const endpoints: [number, number, number, number][] = [
        [p1.cellA, p1.cellB, p2.cellA, p2.cellB],
        [p1.cellA, p1.cellB, p2.cellB, p2.cellA],
        [p1.cellB, p1.cellA, p2.cellA, p2.cellB],
        [p1.cellB, p1.cellA, p2.cellB, p2.cellA],
      ];

      for (const [shared1, free1, shared2, free2] of endpoints) {
        // shared1 and shared2 must be on the same cross-line
        const sameLink =
          baseType === 'row'
            ? SolverBoard.CELL_COL[shared1] === SolverBoard.CELL_COL[shared2]
            : SolverBoard.CELL_ROW[shared1] === SolverBoard.CELL_ROW[shared2];
        if (!sameLink) continue;

        // free1 and free2 must NOT be on the same cross-line (otherwise it's a plain X-Wing)
        const sameFree =
          baseType === 'row'
            ? SolverBoard.CELL_COL[free1] === SolverBoard.CELL_COL[free2]
            : SolverBoard.CELL_ROW[free1] === SolverBoard.CELL_ROW[free2];
        if (sameFree) continue;

        // Eliminate d from common peers of free1 and free2
        const commonPeers = board.commonPeers([free1, free2]);
        const actions: DetectionAction[] = [];
        for (const cell of commonPeers) {
          if ((board.candidates[cell] & bit) !== 0) {
            actions.push({ kind: 'eliminate', cell, digit: d });
          }
        }
        if (actions.length === 0) continue;

        return {
          technique: 'skyscraper',
          actions,
          patternCells: [shared1, free1, shared2, free2],
          description: `Skyscraper: digit ${d}, conjugate pairs ${cellRef(shared1)}-${cellRef(free1)} and ${cellRef(shared2)}-${cellRef(free2)}, eliminate ${actions.length} candidates`,
        };
      }
    }
  }
  return null;
}
