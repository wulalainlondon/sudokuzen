import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function _cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * X-Cycle / Simple Coloring:
 * For digit d, build a coloring graph from conjugate pairs. Alternate A/B colors.
 * Rule 1 (same-color conflict): If two same-color cells see each other -> that color is all false, eliminate d from all cells of that color.
 * Rule 2 (both-color visible): If a cell sees one A-color and one B-color cell -> eliminate d from that cell.
 */
export function detectXCycleSimpleColoring(board: SolverBoard): DetectionResult | null {
  const allPairs = findConjugatePairs(board);

  for (let d = 1; d <= 9; d++) {
    const bit = digitBit(d);
    const pairs = allPairs.filter((p) => p.digit === d);
    if (pairs.length === 0) continue;

    // Build adjacency list
    const adj = new Map<number, Set<number>>();
    for (const p of pairs) {
      if (!adj.has(p.cellA)) adj.set(p.cellA, new Set());
      if (!adj.has(p.cellB)) adj.set(p.cellB, new Set());
      adj.get(p.cellA)!.add(p.cellB);
      adj.get(p.cellB)!.add(p.cellA);
    }

    // BFS color each connected component
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

      // Rule 1: same-color conflict
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
              description: `Simple Coloring (same-color conflict): digit ${d}, same-color cells see each other, eliminate ${actions.length} candidates`,
            };
          }
        }
      }

      // Rule 2: cell sees both colors
      const actions: DetectionAction[] = [];
      for (const cell of board.emptyCells) {
        if ((board.candidates[cell] & bit) === 0) continue;
        if (color.has(cell)) continue; // already in coloring graph

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
          description: `Simple Coloring (both-color visible): digit ${d}, external cell sees both colors, eliminate ${actions.length} candidates`,
        };
      }
    }
  }
  return null;
}
