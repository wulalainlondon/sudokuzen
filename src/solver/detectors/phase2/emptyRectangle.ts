import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Empty Rectangle:
 * For digit d, candidates in a box form an L/T shape (not filling the row-col intersection).
 * An external conjugate pair connects to that box's row or column,
 * allowing elimination of d from the target cell (cross-cell of the pair's other end and the box projection).
 */
export function detectEmptyRectangle(board: SolverBoard): DetectionResult | null {
  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    for (let box = 0; box < 9; box++) {
      const boxCells = SolverBoard.BOX_CELLS[box];
      const dCells = boxCells.filter((c) => (board.candidates[c] & bit) !== 0);
      if (dCells.length < 2) continue;

      const boxRowStart = Math.floor(box / 3) * 3;
      const boxColStart = (box % 3) * 3;

      // Check if an empty rectangle forms: a row and column where d's candidates don't occupy the intersection
      // i.e. there exists an "empty" row-col cross area
      for (let lr = 0; lr < 3; lr++) {
        for (let lc = 0; lc < 3; lc++) {
          const erRow = boxRowStart + lr;
          const erCol = boxColStart + lc;
          const _crossCell = erRow * 9 + erCol;

          // Cross cell must not have candidate d (forming the empty corner of the rectangle)
          // and d's candidates must be distributed in other columns of this row and other rows of this column
          const inSameRow = dCells.filter((c) => SolverBoard.CELL_ROW[c] === erRow);
          const inSameCol = dCells.filter((c) => SolverBoard.CELL_COL[c] === erCol);
          const _atCross = dCells.filter((c) => SolverBoard.CELL_ROW[c] === erRow && SolverBoard.CELL_COL[c] === erCol);

          // All d candidates must be on this row or this column (ER condition)
          const allOnRowOrCol = dCells.every(
            (c) => SolverBoard.CELL_ROW[c] === erRow || SolverBoard.CELL_COL[c] === erCol,
          );
          if (!allOnRowOrCol) continue;
          if (inSameRow.length === 0 || inSameCol.length === 0) continue;

          // Find conjugate pair outside box on erRow -> eliminate target on erCol
          // Find conjugate pair outside box on erCol -> eliminate target on erRow

          // Strategy: conjugate pair outside box on erCol
          const colCells = board.digitCellsInUnit(9 + erCol, d);
          const colOutside = colCells.filter((c) => SolverBoard.CELL_BOX[c] !== box);
          if (colOutside.length === 2) {
            // Do these two cells form a conjugate pair outside the box in this column?
            // Simplified: column has exactly 2 candidate cells outside the box
            // One endpoint of the conjugate pair and erRow's cross cell is the elimination target
            for (const endpoint of colOutside) {
              const otherEnd = colOutside.find((c) => c !== endpoint)!;
              // We need: endpoint is on the column outside box, projecting through the box's ER to erRow
              // Elimination target = otherEnd's row x inSameRow's column
              const targetRow = SolverBoard.CELL_ROW[otherEnd];
              for (const rowCell of inSameRow) {
                const targetCol = SolverBoard.CELL_COL[rowCell];
                const target = targetRow * 9 + targetCol;
                if (target === otherEnd) continue;
                if (SolverBoard.CELL_BOX[target] === box) continue;
                if (!board.hasCandidate(target, d)) continue;
                // Verify otherEnd and target are in the same row
                if (SolverBoard.CELL_ROW[target] !== SolverBoard.CELL_ROW[otherEnd]) continue;

                const actions: DetectionAction[] = [{ kind: 'eliminate', cell: target, digit: d }];
                return {
                  technique: 'empty_rectangle',
                  actions,
                  patternCells: [...dCells, endpoint, otherEnd],
                  description: `Empty Rectangle: digit ${d}, Box ${box + 1} forms ER, via Col ${erCol + 1} conjugate pair ${cellRef(endpoint)}-${cellRef(otherEnd)}, eliminate ${d} from ${cellRef(target)}`,
                };
              }
            }
          }

          // Strategy: conjugate pair outside box on erRow
          const rowCells = board.digitCellsInUnit(erRow, d);
          const rowOutside = rowCells.filter((c) => SolverBoard.CELL_BOX[c] !== box);
          if (rowOutside.length === 2) {
            for (const endpoint of rowOutside) {
              const otherEnd = rowOutside.find((c) => c !== endpoint)!;
              const targetCol = SolverBoard.CELL_COL[otherEnd];
              for (const colCell of inSameCol) {
                const targetRow = SolverBoard.CELL_ROW[colCell];
                const target = targetRow * 9 + targetCol;
                if (target === otherEnd) continue;
                if (SolverBoard.CELL_BOX[target] === box) continue;
                if (!board.hasCandidate(target, d)) continue;
                if (SolverBoard.CELL_COL[target] !== SolverBoard.CELL_COL[otherEnd]) continue;

                const actions: DetectionAction[] = [{ kind: 'eliminate', cell: target, digit: d }];
                return {
                  technique: 'empty_rectangle',
                  actions,
                  patternCells: [...dCells, endpoint, otherEnd],
                  description: `Empty Rectangle: digit ${d}, Box ${box + 1} forms ER, via Row ${erRow + 1} conjugate pair ${cellRef(endpoint)}-${cellRef(otherEnd)}, eliminate ${d} from ${cellRef(target)}`,
                };
              }
            }
          }
        }
      }
    }
  }
  return null;
}
