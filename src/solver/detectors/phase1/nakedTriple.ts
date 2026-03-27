import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { popcount, bitsToDigits } from '../../helpers/bitmask';
import { combinations } from '../../helpers/combinations';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

function unitName(unitIdx: number): string {
  if (unitIdx < 9) return `第 ${unitIdx + 1} 行`;
  if (unitIdx < 18) return `第 ${unitIdx - 9 + 1} 列`;
  return `第 ${unitIdx - 18 + 1} 宮`;
}

export function detectNakedTriple(board: SolverBoard): DetectionResult | null {
  for (let u = 0; u < 27; u++) {
    const unit = SolverBoard.ALL_UNITS[u];
    const emptyCells = unit.filter((c) => board.values[c] === 0);
    if (emptyCells.length < 4) continue; // need triple + at least 1 to eliminate from

    for (const triple of combinations(emptyCells, 3)) {
      const union = board.candidates[triple[0]] | board.candidates[triple[1]] | board.candidates[triple[2]];
      if (popcount(union) !== 3) continue;

      const digits = bitsToDigits(union);
      const tripleSet = new Set(triple);
      const actions: DetectionAction[] = [];
      for (const c of emptyCells) {
        if (tripleSet.has(c)) continue;
        for (const d of digits) {
          if (board.hasCandidate(c, d)) {
            actions.push({ kind: 'eliminate', cell: c, digit: d });
          }
        }
      }
      if (actions.length > 0) {
        const digitStr = digits.join(',');
        return {
          technique: 'naked_triple',
          actions,
          patternCells: triple,
          description: `${unitName(u)}的 Naked Triple {${digitStr}} 在 ${triple.map(cellRef).join('、')}，消去同單元其他格的 ${digitStr}`,
        };
      }
    }
  }
  return null;
}
