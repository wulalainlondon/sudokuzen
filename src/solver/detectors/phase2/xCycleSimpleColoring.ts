import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * X-Cycle / Simple Coloring（簡單著色）：
 * 對於數字 d，從共軛對建立著色圖。交替塗 A/B 兩色。
 * 規則 1（同色衝突）：若同色的兩格互相看到 → 該色全假，消去該色所有格的 d。
 * 規則 2（雙色可見）：若某格看到 A 色和 B 色各一格 → 該格消去 d。
 */
export function detectXCycleSimpleColoring(board: SolverBoard): DetectionResult | null {
  const allPairs = findConjugatePairs(board);

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);
    const pairs = allPairs.filter((p) => p.digit === d);
    if (pairs.length === 0) continue;

    // 建立鄰接表
    const adj = new Map<number, Set<number>>();
    for (const p of pairs) {
      if (!adj.has(p.cellA)) adj.set(p.cellA, new Set());
      if (!adj.has(p.cellB)) adj.set(p.cellB, new Set());
      adj.get(p.cellA)!.add(p.cellB);
      adj.get(p.cellB)!.add(p.cellA);
    }

    // BFS 著色各連通分量
    const color = new Map<number, number>(); // cell → 0 or 1
    const nodes = [...adj.keys()];

    for (const start of nodes) {
      if (color.has(start)) continue;

      const cluster: [number[], number[]] = [[], []];
      const queue: { cell: number; c: number }[] = [{ cell: start, c: 0 }];
      color.set(start, 0);
      cluster[0].push(start);

      while (queue.length > 0) {
        const { cell, c } = queue.shift()!;
        for (const neighbor of adj.get(cell) || []) {
          if (!color.has(neighbor)) {
            const nc = 1 - c;
            color.set(neighbor, nc);
            cluster[nc].push(neighbor);
            queue.push({ cell: neighbor, c: nc });
          }
        }
      }

      if (cluster[0].length + cluster[1].length < 2) continue;

      // 規則 1：同色衝突
      for (const colorIdx of [0, 1] as const) {
        const group = cluster[colorIdx];
        let conflict = false;
        for (let i = 0; i < group.length && !conflict; i++) {
          for (let j = i + 1; j < group.length && !conflict; j++) {
            if (board.seesCell(group[i], group[j])) conflict = true;
          }
        }
        if (conflict) {
          const actions: DetectionAction[] = [];
          for (const cell of group) {
            if (board.hasCandidate(cell, d)) {
              actions.push({ kind: 'eliminate', cell, digit: d });
            }
          }
          if (actions.length > 0) {
            return {
              technique: 'x_cycle_simple_coloring',
              actions,
              patternCells: [...cluster[0], ...cluster[1]],
              description: `簡單著色（同色衝突）：數字 ${d}，同色格互相看到，消去 ${actions.length} 個候選`,
            };
          }
        }
      }

      // 規則 2：格子同時看到兩色
      const actions: DetectionAction[] = [];
      for (const cell of board.emptyCells) {
        if ((board.candidates[cell] & bit) === 0) continue;
        if (color.has(cell)) continue; // 已在著色圖中

        const seesColor0 = cluster[0].some((c) => board.seesCell(cell, c));
        const seesColor1 = cluster[1].some((c) => board.seesCell(cell, c));
        if (seesColor0 && seesColor1) {
          actions.push({ kind: 'eliminate', cell, digit: d });
        }
      }
      if (actions.length > 0) {
        return {
          technique: 'x_cycle_simple_coloring',
          actions,
          patternCells: [...cluster[0], ...cluster[1]],
          description: `簡單著色（雙色可見）：數字 ${d}，外部格看到兩色，消去 ${actions.length} 個候選`,
        };
      }
    }
  }
  return null;
}
