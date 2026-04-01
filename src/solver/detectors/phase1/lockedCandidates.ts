import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';

function _cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

export function detectLockedCandidates(board: SolverBoard): DetectionResult | null {
  // Type 1: Pointing — digit in box confined to one row/col → eliminate from row/col outside box
  for (let box = 0; box < 9; box++) {
    const unitIdx = 18 + box;
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(unitIdx, d);
      if (cells.length < 2) continue;

      // Check if all in same row
      const rows = new Set(cells.map((c) => SolverBoard.CELL_ROW[c]));
      if (rows.size === 1) {
        const row = [...rows][0];
        const cellSet = new Set(cells);
        const actions: DetectionAction[] = [];
        for (const c of SolverBoard.ROW_CELLS[row]) {
          if (!cellSet.has(c) && board.hasCandidate(c, d)) {
            actions.push({ kind: 'eliminate', cell: c, digit: d });
          }
        }
        if (actions.length > 0) {
          return {
            technique: 'locked_candidates',
            actions,
            patternCells: cells,
            description: `Box ${box + 1} digit ${d} confined to Row ${row + 1} (Pointing), eliminate ${d} outside box in same row`,
          };
        }
      }

      // Check if all in same col
      const cols = new Set(cells.map((c) => SolverBoard.CELL_COL[c]));
      if (cols.size === 1) {
        const col = [...cols][0];
        const cellSet = new Set(cells);
        const actions: DetectionAction[] = [];
        for (const c of SolverBoard.COL_CELLS[col]) {
          if (!cellSet.has(c) && board.hasCandidate(c, d)) {
            actions.push({ kind: 'eliminate', cell: c, digit: d });
          }
        }
        if (actions.length > 0) {
          return {
            technique: 'locked_candidates',
            actions,
            patternCells: cells,
            description: `Box ${box + 1} digit ${d} confined to Col ${col + 1} (Pointing), eliminate ${d} outside box in same col`,
          };
        }
      }
    }
  }

  // Type 2: Claiming — digit in row/col confined to one box → eliminate from box outside row/col
  for (let line = 0; line < 18; line++) {
    const isRow = line < 9;
    const lineIdx = isRow ? line : line - 9;
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(line, d);
      if (cells.length < 2) continue;

      const boxes = new Set(cells.map((c) => SolverBoard.CELL_BOX[c]));
      if (boxes.size === 1) {
        const box = [...boxes][0];
        const cellSet = new Set(cells);
        const actions: DetectionAction[] = [];
        for (const c of SolverBoard.BOX_CELLS[box]) {
          if (!cellSet.has(c) && board.hasCandidate(c, d)) {
            actions.push({ kind: 'eliminate', cell: c, digit: d });
          }
        }
        if (actions.length > 0) {
          const lineName = isRow ? `Row ${lineIdx + 1}` : `Col ${lineIdx + 1}`;
          return {
            technique: 'locked_candidates',
            actions,
            patternCells: cells,
            description: `${lineName} digit ${d} confined to Box ${box + 1} (Claiming), eliminate ${d} outside line in same box`,
          };
        }
      }
    }
  }

  return null;
}
