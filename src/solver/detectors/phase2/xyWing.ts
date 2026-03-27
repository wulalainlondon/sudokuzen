import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * XY-Wing（XY 翼）：
 * 樞紐格 {a,b}，翼格1 {a,c} 看到樞紐，翼格2 {b,c} 看到樞紐。
 * 同時看到兩個翼格的格子可消去候選數 c。
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

      // wing1 必須包含 a 但不包含 b，且有一個額外數字 c
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

      // 找 wing2：包含 otherPivotDigit 和 c，看到 pivot
      for (let wj = wi + 1; wj < bivals.length; wj++) {
        const wing2 = bivals[wj];
        if (wing2 === pivot) continue;
        if (!board.seesCell(pivot, wing2)) continue;
        const w2Cands = board.candidates[wing2];
        const w2Digits = bitsToDigits(w2Cands);
        if (!w2Digits.includes(otherPivotDigit) || !w2Digits.includes(c)) continue;

        // 消去：同時看到 wing1 和 wing2 且含候選 c 的格子
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
          description: `XY-Wing：樞紐 ${cellRef(pivot)}{${a},${b}}，翼 ${cellRef(wing1)} 與 ${cellRef(wing2)}，消去候選數 ${c} 共 ${actions.length} 處`,
        };
      }
    }
  }
  return null;
}
