import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { popcount, digitBit, bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * XYZ-Wing（XYZ 翼）：
 * 樞紐格 {a,b,c}（3 個候選），翼格1 {a,c} 看到樞紐，翼格2 {b,c} 看到樞紐。
 * 同時看到樞紐和兩個翼格的格子可消去候選數 c。
 */
export function detectXYZWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  for (const pivot of board.emptyCells) {
    if (board.candidateCount(pivot) !== 3) continue;
    const pivotMask = board.candidates[pivot];
    const pivotDigits = bitsToDigits(pivotMask);

    // 嘗試每一對候選數字作為 (a,b)，剩下的就是 c
    for (let ci = 0; ci < 3; ci++) {
      const c = pivotDigits[ci];
      const cBit = digitBit(c);
      const others = pivotDigits.filter((_, idx) => idx !== ci);
      const a = others[0];
      const b = others[1];

      // 找 wing1 = bivalue {a,c}
      for (const wing1 of bivals) {
        if (wing1 === pivot) continue;
        if (!board.seesCell(pivot, wing1)) continue;
        const w1 = board.candidates[wing1];
        if (w1 !== (digitBit(a) | cBit)) continue;

        // 找 wing2 = bivalue {b,c}
        for (const wing2 of bivals) {
          if (wing2 === pivot || wing2 === wing1) continue;
          if (!board.seesCell(pivot, wing2)) continue;
          const w2 = board.candidates[wing2];
          if (w2 !== (digitBit(b) | cBit)) continue;

          // 消去：同時看到 pivot、wing1、wing2 且含候選 c 的格子
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
            description: `XYZ-Wing：樞紐 ${cellRef(pivot)}{${a},${b},${c}}，翼 ${cellRef(wing1)} 與 ${cellRef(wing2)}，消去候選數 ${c} 共 ${actions.length} 處`,
          };
        }
      }
    }
  }
  return null;
}
