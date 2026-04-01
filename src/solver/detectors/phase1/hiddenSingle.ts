import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

function unitName(unitIdx: number): string {
  if (unitIdx < 9) return `Row ${unitIdx + 1}`;
  if (unitIdx < 18) return `Col ${unitIdx - 9 + 1}`;
  return `Box ${unitIdx - 18 + 1}`;
}

export function detectHiddenSingle(board: SolverBoard): DetectionResult | null {
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(u, d);
      if (cells.length === 1) {
        const idx = cells[0];
        return {
          technique: 'hidden_single',
          actions: [{ kind: 'fill', cell: idx, digit: d }],
          patternCells: [idx],
          description: `${cellRef(idx)} is a Hidden Single in ${unitName(u)}, digit ${d} appears only in this cell`,
        };
      }
    }
  }
  return null;
}
