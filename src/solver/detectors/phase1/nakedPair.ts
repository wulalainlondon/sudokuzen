import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { popcount, bitsToDigits } from '../../helpers/bitmask';
import { combinations } from '../../helpers/combinations';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

function unitName(unitIdx: number): string {
  if (unitIdx < 9) return `Row ${unitIdx + 1}`;
  if (unitIdx < 18) return `Col ${unitIdx - 9 + 1}`;
  return `Box ${unitIdx - 18 + 1}`;
}

export function detectNakedPair(board: SolverBoard): DetectionResult | null {
  for (let u = 0; u < 27; u++) {
    const unit = SolverBoard.ALL_UNITS[u];
    const emptyCells = unit.filter((c) => board.values[c] === 0);
    if (emptyCells.length < 3) continue; // need pair + at least 1 cell to eliminate from

    for (const pair of combinations(emptyCells, 2)) {
      const union = board.candidates[pair[0]] | board.candidates[pair[1]];
      if (popcount(union) !== 2) continue;

      const digits = bitsToDigits(union);
      const pairSet = new Set(pair);
      const actions: DetectionAction[] = [];
      for (const c of emptyCells) {
        if (pairSet.has(c)) continue;
        for (const d of digits) {
          if (board.hasCandidate(c, d)) {
            actions.push({ kind: 'eliminate', cell: c, digit: d });
          }
        }
      }
      if (actions.length > 0) {
        const digitStr = digits.join(',');
        return {
          technique: 'naked_pair',
          actions,
          patternCells: pair,
          description: `Naked Pair {${digitStr}} in ${unitName(u)} at ${pair.map(cellRef).join(', ')}, eliminate ${digitStr} from other cells`,
        };
      }
    }
  }
  return null;
}
