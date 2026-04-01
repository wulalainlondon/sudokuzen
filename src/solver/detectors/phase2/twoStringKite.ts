import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Two-String Kite:
 * For digit d, one conjugate pair in a row and one in a column,
 * with one end of each pair sharing the same box.
 * The cross-cell of the other two ends (not in the shared box) can eliminate d.
 */
export function detectTwoStringKite(board: SolverBoard): DetectionResult | null {
  for (let d = 1; d <= 9; d++) {
    const _bit = digitBit(d);

    // Collect row conjugate pairs
    const rowPairs: { cells: [number, number]; row: number }[] = [];
    for (let r = 0; r < 9; r++) {
      const cells = board.digitCellsInUnit(r, d); // unitIdx 0..8 = rows
      if (cells.length === 2) {
        rowPairs.push({ cells: [cells[0], cells[1]], row: r });
      }
    }

    // Collect column conjugate pairs
    const colPairs: { cells: [number, number]; col: number }[] = [];
    for (let c = 0; c < 9; c++) {
      const cells = board.digitCellsInUnit(9 + c, d); // unitIdx 9..17 = cols
      if (cells.length === 2) {
        colPairs.push({ cells: [cells[0], cells[1]], col: c });
      }
    }

    for (const rp of rowPairs) {
      for (const cp of colPairs) {
        // Try each endpoint pairing
        for (const [rShared, rFree] of [
          [rp.cells[0], rp.cells[1]],
          [rp.cells[1], rp.cells[0]],
        ] as [number, number][]) {
          for (const [cShared, cFree] of [
            [cp.cells[0], cp.cells[1]],
            [cp.cells[1], cp.cells[0]],
          ] as [number, number][]) {
            // rShared and cShared must be in the same box
            if (SolverBoard.CELL_BOX[rShared] !== SolverBoard.CELL_BOX[cShared]) continue;

            // rFree and cFree cannot be the same cell
            if (rFree === cFree) continue;

            // All 4 cells must be distinct
            if (rShared === cShared || rShared === cFree || rFree === cShared) continue;

            // Elimination target: intersection of cFree's row and rFree's column
            const targetRow = SolverBoard.CELL_ROW[cFree];
            const targetCol = SolverBoard.CELL_COL[rFree];
            const target = targetRow * 9 + targetCol;

            if (target === rFree || target === cFree) continue;
            if (!board.hasCandidate(target, d)) continue;

            const actions: DetectionAction[] = [{ kind: 'eliminate', cell: target, digit: d }];

            return {
              technique: 'two_string_kite',
              actions,
              patternCells: [rShared, rFree, cShared, cFree],
              description: `Two-String Kite: digit ${d}, row pair ${cellRef(rShared)}-${cellRef(rFree)} and col pair ${cellRef(cShared)}-${cellRef(cFree)} linked via box, eliminate ${d} from ${cellRef(target)}`,
            };
          }
        }
      }
    }
  }
  return null;
}
