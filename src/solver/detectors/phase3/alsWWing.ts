import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';
import { findAllALS, type AlmostLockedSet } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * ALS W-Wing（ALS 双翼）：
 * 两个双值格 {a,b}，它们不互相可见，但通过一个包含数字a的ALS连接。
 * ALS作为强链桥梁：若ALS中a的所有候选格都能看到两个双值格之一，
 * 则数字b可从同时看到两个双值格的外部格消去。
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
              description: `ALS W-Wing：双值格 ${cellRef(cell1)},${cellRef(cell2)}{${a},${b}}，ALS{${als.cells.map(cellRef).join(',')}} 连接数字 ${connectDigit}，消去 ${elimDigit} 共 ${actions.length} 处`,
            };
          }
        }
      }
    }
  }

  return null;
}
