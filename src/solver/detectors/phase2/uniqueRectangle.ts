import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Unique Rectangle Type 1:
 * Find 4 cells forming a rectangle across two boxes (spanning 2 rows and 2 columns).
 * Three cells have exactly candidates {a,b}, the fourth has {a,b} plus extra candidates.
 * To avoid a deadly rectangle (multiple solutions), eliminate {a,b} from the fourth cell.
 */
export function detectUniqueRectangle(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  // Group bivalue cells by candidate mask
  const maskMap = new Map<number, number[]>();
  for (const cell of bivals) {
    const m = board.candidates[cell];
    if (!maskMap.has(m)) maskMap.set(m, []);
    maskMap.get(m)!.push(cell);
  }

  for (const [mask, cells] of maskMap) {
    if (cells.length < 3) continue;
    const digits = bitsToDigits(mask);
    const [a, b] = digits;

    // Try to find 3 bivalue cells forming 3 corners of a rectangle
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        for (let k = j + 1; k < cells.length; k++) {
          const trio = [cells[i], cells[j], cells[k]];
          const rows = new Set(trio.map((c) => SolverBoard.CELL_ROW[c]));
          const cols = new Set(trio.map((c) => SolverBoard.CELL_COL[c]));

          // Rectangle must span exactly 2 rows and 2 columns
          if (rows.size !== 2 || cols.size !== 2) continue;

          const rowArr = [...rows];
          const colArr = [...cols];

          // Find the 4th corner
          const allCorners: number[] = [];
          for (const r of rowArr) {
            for (const c of colArr) {
              allCorners.push(r * 9 + c);
            }
          }

          const fourth = allCorners.find((c) => !trio.includes(c));
          if (fourth === undefined) continue;

          // The 4th cell must be empty and contain candidates a and b
          if (board.values[fourth] !== 0 && board.candidates[fourth] === 0) continue;
          if (!board.hasCandidate(fourth, a) || !board.hasCandidate(fourth, b)) continue;

          // Must have extra candidates (can't also be just {a,b})
          if (board.candidates[fourth] === mask) continue;

          // All 4 cells must span 2 boxes
          const boxes = new Set(allCorners.map((c) => SolverBoard.CELL_BOX[c]));
          if (boxes.size !== 2) continue;

          // Type 1: eliminate a and b from the 4th cell
          const actions: DetectionAction[] = [];
          actions.push({ kind: 'eliminate', cell: fourth, digit: a });
          actions.push({ kind: 'eliminate', cell: fourth, digit: b });

          return {
            technique: 'unique_rectangle',
            actions,
            patternCells: allCorners,
            description: `Unique Rectangle Type 1: ${allCorners.map(cellRef).join(', ')} form {${a},${b}} rectangle, eliminate {${a},${b}} from ${cellRef(fourth)} to avoid multiple solutions`,
          };
        }
      }
    }
  }
  return null;
}
