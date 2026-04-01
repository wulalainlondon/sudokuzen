import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';
import { findAllALS } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * ALS W-Wing:
 * Two bivalue cells {a,b} that don't see each other, linked through an ALS containing digit a.
 * The ALS acts as a strong link bridge: if all candidate cells of a in the ALS can see one of the two bivalue cells,
 * then digit b can be eliminated from external cells that see both bivalue cells.
 */
export function detectAlsWWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;
  if (bivals.length < 2) return null;

  const allALS = findAllALS(board, 4);
  if (allALS.length === 0) return null;

  for (let i = 0; i < bivals.length; i++) {
    for (let j = i + 1; j < bivals.length; j++) {
      const cell1 = bivals[i];
      const cell2 = bivals[j];

      // Must have same candidates
      if (board.candidates[cell1] !== board.candidates[cell2]) continue;
      // Should not see each other (otherwise it's a naked pair)
      if (board.seesCell(cell1, cell2)) continue;

      const [a, b] = bitsToDigits(board.candidates[cell1]);

      // Try each digit as the connecting digit through ALS
      for (const connectDigit of [a, b]) {
        const elimDigit = connectDigit === a ? b : a;

        // Find an ALS containing connectDigit where:
        // All connectDigit cells in ALS see cell1 OR all see cell2
        // and the ALS provides a strong link for connectDigit
        for (const als of allALS) {
          if (als.cells.includes(cell1) || als.cells.includes(cell2)) continue;
          if ((als.candidates & digitBit(connectDigit)) === 0) continue;

          const connectCells = als.cells.filter((c) => (board.candidates[c] & digitBit(connectDigit)) !== 0);

          // All connectDigit cells in ALS see cell1
          const allSeeCell1 = connectCells.every((c) => board.seesCell(c, cell1));
          // All connectDigit cells in ALS see cell2
          const allSeeCell2 = connectCells.every((c) => board.seesCell(c, cell2));

          if (!allSeeCell1 && !allSeeCell2) continue;

          // At least one end must see via ALS, the other end is the "free" wing
          // Actually for W-Wing: the ALS connects the two cells
          // Need: ALS sees cell1 for digit a, AND some link to cell2
          // Simpler: if all connect cells see cell1, we need cell2 visible from...
          // The W-Wing logic: both cells have {a,b}. ALS has strong link on 'a'.
          // If ALS's a-cells all see cell1 → cell1's a is false → cell1=b.
          // Then cell2's b can be eliminated from cells seeing cell2.
          // But we need the other direction too.
          // For full W-Wing: if ALS connects both, eliminate b from common peers.

          // Check if ALS connects to BOTH cells (some connect-cells see cell1, others see cell2)
          const seesCell1 = connectCells.filter((c) => board.seesCell(c, cell1));
          const seesCell2 = connectCells.filter((c) => board.seesCell(c, cell2));

          // Valid if all connect-cells see at least one of the bivalue cells,
          // and both bivalue cells are "seen"
          if (seesCell1.length === 0 || seesCell2.length === 0) {
            // One-sided: still valid for W-Wing if ALL see one cell
            if (allSeeCell1 || allSeeCell2) {
              // Need another connection for the other end — skip for now
              continue;
            }
            continue;
          }

          // Every connect-cell sees cell1 or cell2
          const allCovered = connectCells.every((c) => board.seesCell(c, cell1) || board.seesCell(c, cell2));
          if (!allCovered) continue;

          // Eliminate elimDigit from common peers of cell1 and cell2
          const peers = board.commonPeers([cell1, cell2]);
          const actions: DetectionAction[] = [];
          const patternSet = new Set([cell1, cell2, ...als.cells]);

          for (const peer of peers) {
            if (patternSet.has(peer)) continue;
            if (board.hasCandidate(peer, elimDigit)) {
              actions.push({ kind: 'eliminate', cell: peer, digit: elimDigit });
            }
          }

          if (actions.length > 0) {
            return {
              technique: 'als_w_wing',
              actions,
              patternCells: [...patternSet],
              description: `ALS W-Wing: bivalue cells ${cellRef(cell1)},${cellRef(cell2)}{${a},${b}}, ALS{${als.cells.map(cellRef).join(',')}} links digit ${connectDigit}, eliminate ${elimDigit} in ${actions.length} cells`,
            };
          }
        }
      }
    }
  }

  return null;
}
