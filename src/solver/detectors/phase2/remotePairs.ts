import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Remote Pairs（遠程數對）：
 * 找一條由相同雙值格 {a,b} 組成的鏈，相鄰格互相看到。
 * 鏈中距離為偶數的兩格（同奇偶性），可從其公共 peers 中消去 a 和 b。
 */
export function detectRemotePairs(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;

  // 按候選遮罩分組
  const maskMap = new Map<number, number[]>();
  for (const cell of bivals) {
    const m = board.candidates[cell];
    if (!maskMap.has(m)) maskMap.set(m, []);
    maskMap.get(m)!.push(cell);
  }

  for (const [mask, cells] of maskMap) {
    if (cells.length < 4) continue; // 至少需要 4 格形成有效遠程數對
    const digits = bitsToDigits(mask);
    const [a, b] = digits;

    // 建立鄰接表（互相看到的同候選雙值格）
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

    // BFS 從每個格出發，找偶數距離的配對
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

      // 找偶數距離 >= 4 的配對
      for (const [cell, d] of dist) {
        if (cell <= start) continue; // 避免重複
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

        // 重建路徑作為 patternCells
        const path = reconstructPath(start, cell, dist, adj);

        return {
          technique: 'remote_pairs',
          actions,
          patternCells: path,
          description: `遠程數對：{${a},${b}} 鏈 ${path.map(cellRef).join('→')}，距離 ${d}，消去 ${actions.length} 個候選`,
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
