import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { buildLinkGraph, decodeNode } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Discontinuous Nice Loop:
 * A closed alternating inference chain with a discontinuity at the starting node.
 * If the strong link from the start ultimately returns to itself, the starting state is proven.
 * Type 1: Start node proven true (fill).
 * Type 2: Start node proven false (eliminate).
 */
export function detectDiscontinuousNiceLoop(board: SolverBoard): DetectionResult | null {
  if (board.emptyCells.length < 4) return null;

  const graph = buildLinkGraph(board);
  const strongMap = graph.strong;
  const weakMap = graph.weak;
  const MAX_LENGTH = 10;

  // For each candidate node, try to find a loop back to it
  for (const [startNode] of strongMap) {
    const startDecoded = decodeNode(startNode);
    if (!board.hasCandidate(startDecoded.cell, startDecoded.digit)) continue;

    // BFS: alternating strong-weak, starting with strong from startNode
    type State = { node: number; path: number[]; nextStrong: boolean };
    const queue: State[] = [];
    const visited = new Set<string>();

    // Start: follow strong links from startNode
    const strongNeighbors = strongMap.get(startNode);
    if (!strongNeighbors) continue;

    for (const sn of strongNeighbors) {
      queue.push({ node: sn, path: [startNode, sn], nextStrong: false });
    }

    while (queue.length > 0) {
      const { node, path, nextStrong } = queue.shift()!;
      if (path.length > MAX_LENGTH) continue;

      const key = `${node}-${nextStrong}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const linkMap = nextStrong ? strongMap : weakMap;
      const neighbors = linkMap.get(node);
      if (!neighbors) continue;

      for (const next of neighbors) {
        // Check loop closure: next links back to startNode
        if (next === startNode && path.length >= 4) {
          // Discontinuous nice loop found
          // If closing link is weak and we need strong → start node is TRUE (type 1)
          // If closing link is strong and we need weak → start node is FALSE (type 2)
          if (nextStrong) {
            // We needed a strong link to close. If startNode is in strong neighbors of node,
            // it's a continuous loop. If it's a weak link back, it's discontinuous type 2.
            const weakN = weakMap.get(node);
            if (weakN && weakN.has(startNode)) {
              // Weak link available but we needed strong → discontinuity
              // This proves startNode is TRUE
              const actions: DetectionAction[] = [{ kind: 'fill', cell: startDecoded.cell, digit: startDecoded.digit }];
              return {
                technique: 'discontinuous_nice_loop',
                actions,
                patternCells: [...new Set(path.map((n) => decodeNode(n).cell))],
                description: `Discontinuous Nice Loop: loop proves ${cellRef(startDecoded.cell)}=${startDecoded.digit}`,
              };
            }
          } else {
            // We needed a weak link. If it's available as weak → continuous.
            // If only strong available → discontinuous type 1
            const strongN = strongMap.get(node);
            if (strongN && strongN.has(startNode)) {
              // Strong link back but we needed weak → start node is FALSE
              const actions: DetectionAction[] = [
                { kind: 'eliminate', cell: startDecoded.cell, digit: startDecoded.digit },
              ];
              return {
                technique: 'discontinuous_nice_loop',
                actions,
                patternCells: [...new Set(path.map((n) => decodeNode(n).cell))],
                description: `Discontinuous Nice Loop: loop proves eliminate candidate ${startDecoded.digit} from ${cellRef(startDecoded.cell)}`,
              };
            }
          }
        }

        if (path.includes(next)) continue;
        if (path.length < MAX_LENGTH) {
          queue.push({ node: next, path: [...path, next], nextStrong: !nextStrong });
        }
      }
    }
  }

  return null;
}
