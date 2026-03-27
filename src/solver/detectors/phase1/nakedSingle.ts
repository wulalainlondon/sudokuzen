import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

export function detectNakedSingle(board: SolverBoard): DetectionResult | null {
  for (const idx of board.emptyCells) {
    if (board.candidateCount(idx) === 1) {
      const digit = bitsToDigits(board.candidates[idx])[0];
      return {
        technique: 'naked_single',
        actions: [{ kind: 'fill', cell: idx, digit }],
        patternCells: [idx],
        description: `${cellRef(idx)} 為裸單，唯一候選為 ${digit}`,
      };
    }
  }
  return null;
}
