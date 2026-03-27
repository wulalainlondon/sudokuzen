import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { popcount, digitBit, bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Unique Rectangle Type 1（唯一矩形類型 1）：
 * 在兩個宮中找到 4 個格子形成矩形（佔兩行兩列）。
 * 其中 3 格恰好只有候選 {a,b}，第 4 格含 {a,b} 及額外候選。
 * 為避免致命矩形（多解），從第 4 格消去 {a,b}。
 */
export function detectUniqueRectangle(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  // 按候選遮罩分組雙值格
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

    // 嘗試從這些雙值格中找 3 格形成矩形的 3 個角
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        for (let k = j + 1; k < cells.length; k++) {
          const trio = [cells[i], cells[j], cells[k]];
          const rows = new Set(trio.map((c) => SolverBoard.CELL_ROW[c]));
          const cols = new Set(trio.map((c) => SolverBoard.CELL_COL[c]));

          // 矩形需要恰好 2 行 2 列
          if (rows.size !== 2 || cols.size !== 2) continue;

          const rowArr = [...rows];
          const colArr = [...cols];

          // 找第 4 個角
          const allCorners: number[] = [];
          for (const r of rowArr) {
            for (const c of colArr) {
              allCorners.push(r * 9 + c);
            }
          }

          const fourth = allCorners.find((c) => !trio.includes(c));
          if (fourth === undefined) continue;

          // 第 4 格必須是空格且包含 a 和 b
          if (board.values[fourth] !== 0 && board.candidates[fourth] === 0) continue;
          if (!board.hasCandidate(fourth, a) || !board.hasCandidate(fourth, b)) continue;

          // 必須有額外候選（不能也是 {a,b}）
          if (board.candidates[fourth] === mask) continue;

          // 4 格必須跨 2 個宮
          const boxes = new Set(allCorners.map((c) => SolverBoard.CELL_BOX[c]));
          if (boxes.size !== 2) continue;

          // Type 1：消去第 4 格中的 a 和 b
          const actions: DetectionAction[] = [];
          actions.push({ kind: 'eliminate', cell: fourth, digit: a });
          actions.push({ kind: 'eliminate', cell: fourth, digit: b });

          return {
            technique: 'unique_rectangle',
            actions,
            patternCells: allCorners,
            description: `唯一矩形 Type 1：${allCorners.map(cellRef).join('、')} 形成 {${a},${b}} 矩形，從 ${cellRef(fourth)} 消去 {${a},${b}} 以避免多解`,
          };
        }
      }
    }
  }
  return null;
}
