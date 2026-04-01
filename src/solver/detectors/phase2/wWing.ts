import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * W-Wing:
 * Two identical bivalue cells {a,b} (not seeing each other), linked by a strong link on digit a (or b).
 * One end of the strong link sees the first bivalue cell, the other end sees the second.
 * Eliminate the other digit b (or a) from common peers of the two bivalue cells.
 */
export function detectWWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;
  const conjugates = findConjugatePairs(board);

  for (let i = 0; i < bivals.length; i++) {
    for (let j = i + 1; j < bivals.length; j++) {
      const c1 = bivals[i];
      const c2 = bivals[j];
      if (board.candidates[c1] !== board.candidates[c2]) continue;
      // Two cells must not see each other (otherwise it's a naked pair)
      if (board.seesCell(c1, c2)) continue;

      const digits = bitsToDigits(board.candidates[c1]);
      const [a, b] = digits;

      // Try linking via each digit's strong link
      for (const linkDigit of [a, b]) {
        const elimDigit = linkDigit === a ? b : a;

        // Find a strong link where one end sees c1 and the other sees c2
        for (const pair of conjugates) {
          if (pair.digit !== linkDigit) continue;
          const { cellA, cellB } = pair;

          const aSeesC1 = board.seesCell(cellA, c1) && cellA !== c1 && cellA !== c2;
          const bSeesC2 = board.seesCell(cellB, c2) && cellB !== c1 && cellB !== c2;
          const aSeesC2 = board.seesCell(cellA, c2) && cellA !== c1 && cellA !== c2;
          const bSeesC1 = board.seesCell(cellB, c1) && cellB !== c1 && cellB !== c2;

          if ((aSeesC1 && bSeesC2) || (aSeesC2 && bSeesC1)) {
            // Eliminate elimDigit from common peers of c1 and c2
            const commonPeers = board.commonPeers([c1, c2]);
            const actions: DetectionAction[] = [];
            for (const cell of commonPeers) {
              if (board.hasCandidate(cell, elimDigit)) {
                actions.push({ kind: 'eliminate', cell, digit: elimDigit });
              }
            }
            if (actions.length === 0) continue;

            return {
              technique: 'w_wing',
              actions,
              patternCells: [c1, c2, cellA, cellB],
              description: `W-Wing: bivalue cells ${cellRef(c1)} and ${cellRef(c2)}{${a},${b}}, linked by strong link on ${linkDigit} at ${cellRef(cellA)}-${cellRef(cellB)}, eliminate candidate ${elimDigit} in ${actions.length} cells`,
            };
          }
        }
      }
    }
  }
  return null;
}
