import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit, bitsToDigits } from '../../helpers/bitmask';
import { combinations } from '../../helpers/combinations';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

function unitName(unitIdx: number): string {
  if (unitIdx < 9) return `Row ${unitIdx + 1}`;
  if (unitIdx < 18) return `Col ${unitIdx - 9 + 1}`;
  return `Box ${unitIdx - 18 + 1}`;
}

export function detectHiddenPair(board: SolverBoard): DetectionResult | null {
  for (let u = 0; u < 27; u++) {
    // Find digits that appear in 2 cells in this unit
    const digitCells: Map<number, number[]> = new Map();
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(u, d);
      if (cells.length === 2) {
        digitCells.set(d, cells);
      }
    }

    const eligibleDigits = [...digitCells.keys()];
    if (eligibleDigits.length < 2) continue;

    for (const pair of combinations(eligibleDigits, 2)) {
      const cells0 = digitCells.get(pair[0])!;
      const cells1 = digitCells.get(pair[1])!;

      // Check if both digits appear in the exact same 2 cells
      if (cells0[0] !== cells1[0] || cells0[1] !== cells1[1]) continue;

      const patternCells = cells0;
      const keepMask = digitBit(pair[0]) | digitBit(pair[1]);
      const actions: DetectionAction[] = [];

      for (const c of patternCells) {
        const removeMask = board.candidates[c] & ~keepMask;
        if (removeMask === 0) continue;
        for (const d of bitsToDigits(removeMask)) {
          actions.push({ kind: 'eliminate', cell: c, digit: d });
        }
      }

      if (actions.length > 0) {
        const digitStr = pair.join(',');
        return {
          technique: 'hidden_pair',
          actions,
          patternCells,
          description: `Hidden Pair {${digitStr}} in ${unitName(u)} at ${patternCells.map(cellRef).join(', ')}, eliminate candidates other than ${digitStr} from these cells`,
        };
      }
    }
  }
  return null;
}
