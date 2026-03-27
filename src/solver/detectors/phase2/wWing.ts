import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * W-Wing：
 * 兩個相同的雙值格 {a,b}（不互相看到），透過數字 a（或 b）的強鏈連接。
 * 強鏈的一端看到第一個雙值格，另一端看到第二個雙值格。
 * 可從兩個雙值格的公共 peers 中消去另一個數字 b（或 a）。
 */
export function detectWWing(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;
  const conjugates = findConjugatePairs(board);

  for (let i = 0; i < bivals.length; i++) {
    for (let j = i + 1; j < bivals.length; j++) {
      const c1 = bivals[i];
      const c2 = bivals[j];
      if (board.candidates[c1] !== board.candidates[c2]) continue;
      // 兩格不應互相看到（否則就是 naked pair）
      if (board.seesCell(c1, c2)) continue;

      const digits = bitsToDigits(board.candidates[c1]);
      const [a, b] = digits;

      // 嘗試用每個數字的強鏈連接
      for (const linkDigit of [a, b]) {
        const elimDigit = linkDigit === a ? b : a;

        // 找一條強鏈：其一端看到 c1，另一端看到 c2
        for (const pair of conjugates) {
          if (pair.digit !== linkDigit) continue;
          const { cellA, cellB } = pair;

          const aSeesC1 = board.seesCell(cellA, c1) && cellA !== c1 && cellA !== c2;
          const bSeesC2 = board.seesCell(cellB, c2) && cellB !== c1 && cellB !== c2;
          const aSeesC2 = board.seesCell(cellA, c2) && cellA !== c1 && cellA !== c2;
          const bSeesC1 = board.seesCell(cellB, c1) && cellB !== c1 && cellB !== c2;

          if ((aSeesC1 && bSeesC2) || (aSeesC2 && bSeesC1)) {
            // 消去 elimDigit 從 c1 和 c2 的公共 peers
            const commonPeers = board.commonPeers([c1, c2]);
            const actions: DetectionAction[] = [];
            for (const cell of commonPeers) {
              if (board.hasCandidate(cell, elimDigit)) {
                actions.push({ kind: 'eliminate', cell, digit: elimDigit });
              }
            }
            if (actions.length === 0) continue;

            return {
              technique: 'w_wing',
              actions,
              patternCells: [c1, c2, cellA, cellB],
              description: `W-Wing：雙值格 ${cellRef(c1)} 與 ${cellRef(c2)}{${a},${b}}，透過數字 ${linkDigit} 的強鏈 ${cellRef(cellA)}–${cellRef(cellB)} 連接，消去候選數 ${elimDigit} 共 ${actions.length} 處`,
            };
          }
        }
      }
    }
  }
  return null;
}
