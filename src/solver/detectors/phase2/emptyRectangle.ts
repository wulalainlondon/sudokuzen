import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Empty Rectangle（空矩形）：
 * 對於數字 d，某宮中 d 的候選格形成 L/T 形（不佔滿某行某列的交叉區域）。
 * 存在一條外部共軛對連接到該宮的某行或列，
 * 使得消去目標格（共軛對的另一端與宮投影的交叉格）的 d。
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

      // 檢查是否形成空矩形：存在某行和某列使得 d 的候選不在其交叉處
      // 即存在一個 "空" 的 row-col 交叉區域
      for (let lr = 0; lr < 3; lr++) {
        for (let lc = 0; lc < 3; lc++) {
          const erRow = boxRowStart + lr;
          const erCol = boxColStart + lc;
          const _crossCell = erRow * 9 + erCol;

          // 交叉格不能有 d 候選（形成空矩形的空角）
          // 而且 d 的候選必須分布在這一行的其他列和這一列的其他行
          const inSameRow = dCells.filter((c) => SolverBoard.CELL_ROW[c] === erRow);
          const inSameCol = dCells.filter((c) => SolverBoard.CELL_COL[c] === erCol);
          const _atCross = dCells.filter((c) => SolverBoard.CELL_ROW[c] === erRow && SolverBoard.CELL_COL[c] === erCol);

          // 所有 d 候選必須在這一行或這一列上（ER 條件）
          const allOnRowOrCol = dCells.every(
            (c) => SolverBoard.CELL_ROW[c] === erRow || SolverBoard.CELL_COL[c] === erCol,
          );
          if (!allOnRowOrCol) continue;
          if (inSameRow.length === 0 || inSameCol.length === 0) continue;

          // 在 erRow 上（宮外）找共軛對 → 消去 erCol 上的目標
          // 在 erCol 上（宮外）找共軛對 → 消去 erRow 上的目標

          // 策略：erCol 上宮外的共軛對
          const colCells = board.digitCellsInUnit(9 + erCol, d);
          const colOutside = colCells.filter((c) => SolverBoard.CELL_BOX[c] !== box);
          if (colOutside.length === 2) {
            // 這兩格形成該列在宮外的共軛對？需要整列只有這些格+宮內格
            // 簡化：該列恰好有 2 個宮外候選格
            // 共軛對端點之一與 erRow 的交叉格就是消去目標
            for (const endpoint of colOutside) {
              const otherEnd = colOutside.find((c) => c !== endpoint)!;
              // endpoint 所在行 與 erRow 行中宮內候選的行是否匹配？
              // 其實我們需要的是：endpoint 在宮外列上，通過宮的 ER 投射到 erRow
              // 消去目標 = otherEnd 所在行 × inSameRow 的列
              const targetRow = SolverBoard.CELL_ROW[otherEnd];
              for (const rowCell of inSameRow) {
                const targetCol = SolverBoard.CELL_COL[rowCell];
                const target = targetRow * 9 + targetCol;
                if (target === otherEnd) continue;
                if (SolverBoard.CELL_BOX[target] === box) continue;
                if (!board.hasCandidate(target, d)) continue;
                // 驗證 otherEnd 與 target 在同一行
                if (SolverBoard.CELL_ROW[target] !== SolverBoard.CELL_ROW[otherEnd]) continue;

                const actions: DetectionAction[] = [{ kind: 'eliminate', cell: target, digit: d }];
                return {
                  technique: 'empty_rectangle',
                  actions,
                  patternCells: [...dCells, endpoint, otherEnd],
                  description: `空矩形：數字 ${d}，宮 ${box + 1} 形成 ER，透過列 ${erCol + 1} 的共軛對 ${cellRef(endpoint)}–${cellRef(otherEnd)}，消去 ${cellRef(target)} 的 ${d}`,
                };
              }
            }
          }

          // 策略：erRow 上宮外的共軛對
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
                  description: `空矩形：數字 ${d}，宮 ${box + 1} 形成 ER，透過行 ${erRow + 1} 的共軛對 ${cellRef(endpoint)}–${cellRef(otherEnd)}，消去 ${cellRef(target)} 的 ${d}`,
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
