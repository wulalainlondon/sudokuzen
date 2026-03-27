import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Two-String Kite（雙線風箏）：
 * 對於數字 d，在某行有一組共軛對，在某列有一組共軛對，
 * 兩組共軛對各有一端在同一宮中。
 * 另外兩端（不在共享宮中的端點）的交叉格可消去 d。
 */
export function detectTwoStringKite(board: SolverBoard): DetectionResult | null {
  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    // 收集行共軛對
    const rowPairs: { cells: [number, number]; row: number }[] = [];
    for (let r = 0; r < 9; r++) {
      const cells = board.digitCellsInUnit(r, d); // unitIdx 0..8 = rows
      if (cells.length === 2) {
        rowPairs.push({ cells: [cells[0], cells[1]], row: r });
      }
    }

    // 收集列共軛對
    const colPairs: { cells: [number, number]; col: number }[] = [];
    for (let c = 0; c < 9; c++) {
      const cells = board.digitCellsInUnit(9 + c, d); // unitIdx 9..17 = cols
      if (cells.length === 2) {
        colPairs.push({ cells: [cells[0], cells[1]], col: c });
      }
    }

    for (const rp of rowPairs) {
      for (const cp of colPairs) {
        // 嘗試每種端點配對
        for (const [rShared, rFree] of [
          [rp.cells[0], rp.cells[1]],
          [rp.cells[1], rp.cells[0]],
        ] as [number, number][]) {
          for (const [cShared, cFree] of [
            [cp.cells[0], cp.cells[1]],
            [cp.cells[1], cp.cells[0]],
          ] as [number, number][]) {
            // rShared 和 cShared 必須在同一宮中
            if (SolverBoard.CELL_BOX[rShared] !== SolverBoard.CELL_BOX[cShared]) continue;

            // rFree 和 cFree 不能是同一格
            if (rFree === cFree) continue;

            // 4 格應互不相同
            if (rShared === cShared || rShared === cFree || rFree === cShared) continue;

            // 消去目標：rFree 所在行 與 cFree 所在列 的交叉格
            const targetRow = SolverBoard.CELL_ROW[rFree];
            const targetCol = SolverBoard.CELL_COL[cFree];
            const target = targetRow * 9 + targetCol;

            if (target === rFree || target === cFree) continue;
            if (!board.hasCandidate(target, d)) continue;

            const actions: DetectionAction[] = [{ kind: 'eliminate', cell: target, digit: d }];

            return {
              technique: 'two_string_kite',
              actions,
              patternCells: [rShared, rFree, cShared, cFree],
              description: `雙線風箏：數字 ${d}，行對 ${cellRef(rShared)}–${cellRef(rFree)} 與列對 ${cellRef(cShared)}–${cellRef(cFree)} 透過宮連接，消去 ${cellRef(target)} 的 ${d}`,
            };
          }
        }
      }
    }
  }
  return null;
}
