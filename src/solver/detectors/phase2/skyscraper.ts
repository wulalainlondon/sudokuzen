import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Skyscraper（摩天樓）：
 * 對於數字 d，找兩組共軛對（同一行或列中僅有 2 個候選位置）。
 * 兩組共軛對的一端在同一行/列上對齊（共享基線），
 * 另外兩端不在同一線上。可從這兩個非對齊端的公共 peers 中消去 d。
 */
export function detectSkyscraper(board: SolverBoard): DetectionResult | null {
  const allPairs = findConjugatePairs(board);

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);

    // 收集數字 d 在行中的共軛對（unitIdx 0..8 = rows）
    const rowPairs = allPairs.filter((p) => p.digit === d && p.unitIdx < 9);
    // 收集數字 d 在列中的共軛對（unitIdx 9..17 = cols）
    const colPairs = allPairs.filter((p) => p.digit === d && p.unitIdx >= 9 && p.unitIdx < 18);

    // 嘗試行對 → 列對齊
    const result = trySkyscraper(board, d, bit, rowPairs, 'row');
    if (result) return result;

    // 嘗試列對 → 行對齊
    const result2 = trySkyscraper(board, d, bit, colPairs, 'col');
    if (result2) return result2;
  }
  return null;
}

function trySkyscraper(
  board: SolverBoard,
  d: number,
  bit: number,
  pairs: { cellA: number; cellB: number; unitIdx: number }[],
  baseType: 'row' | 'col',
): DetectionResult | null {
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const p1 = pairs[i];
      const p2 = pairs[j];

      // 嘗試4種端點配對，尋找共享同一交叉線的組合
      const endpoints: [number, number, number, number][] = [
        [p1.cellA, p1.cellB, p2.cellA, p2.cellB],
        [p1.cellA, p1.cellB, p2.cellB, p2.cellA],
        [p1.cellB, p1.cellA, p2.cellA, p2.cellB],
        [p1.cellB, p1.cellA, p2.cellB, p2.cellA],
      ];

      for (const [shared1, free1, shared2, free2] of endpoints) {
        // shared1 和 shared2 必須在同一交叉線上
        const sameLink =
          baseType === 'row'
            ? SolverBoard.CELL_COL[shared1] === SolverBoard.CELL_COL[shared2]
            : SolverBoard.CELL_ROW[shared1] === SolverBoard.CELL_ROW[shared2];
        if (!sameLink) continue;

        // free1 和 free2 不能在同一交叉線上（否則就是普通 X-Wing）
        const sameFree =
          baseType === 'row'
            ? SolverBoard.CELL_COL[free1] === SolverBoard.CELL_COL[free2]
            : SolverBoard.CELL_ROW[free1] === SolverBoard.CELL_ROW[free2];
        if (sameFree) continue;

        // 從 free1 和 free2 的公共 peers 中消去 d
        const commonPeers = board.commonPeers([free1, free2]);
        const actions: DetectionAction[] = [];
        for (const cell of commonPeers) {
          if ((board.candidates[cell] & bit) !== 0) {
            actions.push({ kind: 'eliminate', cell, digit: d });
          }
        }
        if (actions.length === 0) continue;

        return {
          technique: 'skyscraper',
          actions,
          patternCells: [shared1, free1, shared2, free2],
          description: `摩天樓：數字 ${d} 的兩組共軛對在 ${cellRef(shared1)}–${cellRef(free1)} 與 ${cellRef(shared2)}–${cellRef(free2)}，消去 ${actions.length} 個候選`,
        };
      }
    }
  }
  return null;
}
