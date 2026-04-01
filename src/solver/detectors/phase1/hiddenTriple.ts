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

export function detectHiddenTriple(board: SolverBoard): DetectionResult | null {
  for (let u = 0; u < 27; u++) {
    // Find digits that appear in 2 or 3 cells in this unit
    const digitCells: Map<number, number[]> = new Map();
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(u, d);
      if (cells.length >= 2 && cells.length <= 3) {
        digitCells.set(d, cells);
      }
    }

    const eligibleDigits = [...digitCells.keys()];
    if (eligibleDigits.length < 3) continue;

    for (const triple of combinations(eligibleDigits, 3)) {
      // Collect all cells that contain any of the 3 digits
      const cellSet = new Set<number>();
      for (const d of triple) {
        for (const c of digitCells.get(d)!) {
          cellSet.add(c);
        }
      }

      // Hidden triple: exactly 3 cells contain these 3 digits
      if (cellSet.size !== 3) continue;

      const patternCells = [...cellSet].sort((a, b) => a - b);
      const keepMask = digitBit(triple[0]) | digitBit(triple[1]) | digitBit(triple[2]);
      const actions: DetectionAction[] = [];

      for (const c of patternCells) {
        const removeMask = board.candidates[c] & ~keepMask;
        if (removeMask === 0) continue;
        for (const d of bitsToDigits(removeMask)) {
          actions.push({ kind: 'eliminate', cell: c, digit: d });
        }
      }

      if (actions.length > 0) {
        const digitStr = triple.join(',');
        return {
          technique: 'hidden_triple',
          actions,
          patternCells,
          description: `Hidden Triple {${digitStr}} in ${unitName(u)} at ${patternCells.map(cellRef).join(', ')}, eliminate candidates other than ${digitStr} from these cells`,
        };
      }
    }
  }
  return null;
}
