import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Remote Pairs:
 * Find a chain of identical bivalue cells {a,b} where adjacent cells see each other.
 * Two cells at even distance (same parity) can eliminate a and b from their common peers.
 */
export function detectRemotePairs(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  // Group by candidate mask
  const maskMap = new Map<number, number[]>();
  for (const cell of bivals) {
    const m = board.candidates[cell];
    if (!maskMap.has(m)) maskMap.set(m, []);
    maskMap.get(m)!.push(cell);
  }

  for (const [mask, cells] of maskMap) {
    if (cells.length < 4) continue; // need at least 4 cells for valid remote pairs
    const digits = bitsToDigits(mask);
    const [a, b] = digits;

    // Build adjacency list (bivalue cells with same candidates that see each other)
    const adj = new Map<number, number[]>();
    for (const c of cells) adj.set(c, []);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (board.seesCell(cells[i], cells[j])) {
          adj.get(cells[i])!.push(cells[j]);
          adj.get(cells[j])!.push(cells[i]);
        }
      }
    }

    // BFS from each cell, find even-distance pairs
    for (const start of cells) {
      const dist = new Map<number, number>();
      dist.set(start, 0);
      const queue = [start];
      let qi = 0;

      while (qi < queue.length) {
        const cur = queue[qi++];
        const d = dist.get(cur)!;
        for (const next of adj.get(cur)!) {
          if (!dist.has(next)) {
            dist.set(next, d + 1);
            queue.push(next);
          }
        }
      }

      // Find pairs at even distance >= 4
      for (const [cell, d] of dist) {
        if (cell <= start) continue; // avoid duplicates
        if (d < 4 || d % 2 !== 0) continue;

        const commonPeers = board.commonPeers([start, cell]);
        const actions: DetectionAction[] = [];
        for (const peer of commonPeers) {
          if (board.hasCandidate(peer, a)) {
            actions.push({ kind: 'eliminate', cell: peer, digit: a });
          }
          if (board.hasCandidate(peer, b)) {
            actions.push({ kind: 'eliminate', cell: peer, digit: b });
          }
        }
        if (actions.length === 0) continue;

        // Reconstruct path as patternCells
        const path = reconstructPath(start, cell, dist, adj);

        return {
          technique: 'remote_pairs',
          actions,
          patternCells: path,
          description: `Remote Pairs: {${a},${b}} chain ${path.map(cellRef).join('->')} distance ${d}, eliminate ${actions.length} candidates`,
        };
      }
    }
  }
  return null;
}

function reconstructPath(start: number, end: number, dist: Map<number, number>, adj: Map<number, number[]>): number[] {
  const path = [end];
  let cur = end;
  while (cur !== start) {
    const d = dist.get(cur)!;
    for (const prev of adj.get(cur)!) {
      if (dist.get(prev) === d - 1) {
        path.push(prev);
        cur = prev;
        break;
      }
    }
  }
  return path.reverse();
}
