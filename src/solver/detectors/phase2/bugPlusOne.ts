import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * BUG+1（雙值全盤缺陷 +1）：
 * 所有未填格都恰好有 2 個候選，除了一格有 3 個候選。
 * 在那個例外格中，出現 3 次於某單元的那個額外數字就是正確填入值。
 * （若非如此，盤面會陷入 BUG 致命模式 → 多解。）
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
      // 多於一個非雙值格，或有 >3 候選的格 → 不是 BUG+1
      return null;
    }
  }
  if (triCell === -1) return null;

  // 找例外格中哪個數字在某單元中出現 3 次
  const triDigits = bitsToDigits(board.candidates[triCell]);
  const units = SolverBoard.CELL_UNITS[triCell]; // [rowUnit, colUnit, boxUnit]

  for (const d of triDigits) {
    for (const unitIdx of units) {
      const count = board.digitCellsInUnit(unitIdx, d).length;
      if (count === 3) {
        // 這個數字就是要填的
        return {
          technique: 'bug_plus_one',
          actions: [{ kind: 'fill', cell: triCell, digit: d }],
          patternCells: empty,
          description: `BUG+1：所有空格皆雙值，僅 ${cellRef(triCell)} 有 3 候選。數字 ${d} 在單元中出現 3 次，填入 ${d}`,
        };
      }
    }
  }
  return null;
}
