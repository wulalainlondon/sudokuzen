import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function _cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Template:
 * For each digit d, generate all valid placement patterns (templates) using backtracking.
 * If a cell has d in ALL templates -> fill d.
 * If a cell has d in ZERO templates -> eliminate d.
 * Only processes digits with <= 25 empty positions for performance.
 */
export function detectTemplate(board: SolverBoard): DetectionResult | null {
  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    // Cells that already have d placed
    const placedCells: number[] = [];
    const emptyCandCells: number[] = [];

    for (let i = 0; i < 81; i++) {
      if (board.values[i] === d) {
        placedCells.push(i);
      } else if (board.values[i] === 0 && (board.candidates[i] & bit) !== 0) {
        emptyCandCells.push(i);
      }
    }

    if (emptyCandCells.length === 0) continue;
    if (emptyCandCells.length > 25) continue;

    // Need to place d in exactly (9 - placedCells.length) more cells
    const needed = 9 - placedCells.length;
    if (needed <= 0) continue;

    // Which rows/cols/boxes still need d
    const rowNeeds = new Uint8Array(9);
    const colNeeds = new Uint8Array(9);
    const boxNeeds = new Uint8Array(9);
    rowNeeds.fill(1);
    colNeeds.fill(1);
    boxNeeds.fill(1);

    for (const c of placedCells) {
      rowNeeds[SolverBoard.CELL_ROW[c]] = 0;
      colNeeds[SolverBoard.CELL_COL[c]] = 0;
      boxNeeds[SolverBoard.CELL_BOX[c]] = 0;
    }

    // Candidate positions grouped by row (for rows that still need d)
    const rowPositions: number[][] = [];
    for (let r = 0; r < 9; r++) {
      if (rowNeeds[r] === 0) continue;
      const positions = emptyCandCells.filter((c) => SolverBoard.CELL_ROW[c] === r);
      if (positions.length === 0) continue; // Shouldn't happen in valid puzzle
      rowPositions.push(positions);
    }

    if (rowPositions.length !== needed) continue;

    // Generate all valid templates by backtracking
    const templates: number[][] = [];
    const MAX_TEMPLATES = 500;

    function backtrack(rowIdx: number, usedCols: number, usedBoxes: number, current: number[]): void {
      if (templates.length >= MAX_TEMPLATES) return;
      if (rowIdx === rowPositions.length) {
        templates.push([...current]);
        return;
      }

      for (const cell of rowPositions[rowIdx]) {
        const col = SolverBoard.CELL_COL[cell];
        const box = SolverBoard.CELL_BOX[cell];

        if ((usedCols & (1 << col)) !== 0) continue;
        if ((usedBoxes & (1 << box)) !== 0) continue;

        current.push(cell);
        backtrack(rowIdx + 1, usedCols | (1 << col), usedBoxes | (1 << box), current);
        current.pop();
      }
    }

    backtrack(0, 0, 0, []);

    if (templates.length === 0 || templates.length >= MAX_TEMPLATES) continue;

    // Count how many templates include each candidate cell
    const cellCount = new Map<number, number>();
    for (const c of emptyCandCells) cellCount.set(c, 0);

    for (const tmpl of templates) {
      for (const c of tmpl) {
        cellCount.set(c, (cellCount.get(c) || 0) + 1);
      }
    }

    const actions: DetectionAction[] = [];
    const patternCells: number[] = [];

    for (const [cell, count] of cellCount) {
      if (count === 0) {
        // d never appears here in any template → eliminate
        actions.push({ kind: 'eliminate', cell, digit: d });
        patternCells.push(cell);
      } else if (count === templates.length) {
        // d appears here in every template → fill
        actions.push({ kind: 'fill', cell, digit: d });
        patternCells.push(cell);
      }
    }

    if (actions.length > 0) {
      return {
        technique: 'template',
        actions,
        patternCells,
        description: `Template: digit ${d}, ${templates.length} valid templates, ${actions.length} conclusions`,
      };
    }
  }

  return null;
}
