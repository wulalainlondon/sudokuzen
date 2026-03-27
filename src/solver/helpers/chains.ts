// AIC (Alternating Inference Chain) builder
// Finds chains of alternating strong-weak links between (cell, digit) nodes.

import { type LinkGraph, decodeNode } from './links';

export interface ChainNode {
  cell: number;
  digit: number;
  encoded: number;
}

export interface AICResult {
  chain: ChainNode[]; // alternating strong-weak: [start(strong), ..., end(strong)]
  eliminations: { cell: number; digit: number }[];
}

/**
 * Find an AIC of given max length that produces eliminations.
 * The chain alternates: node0 -strong- node1 -weak- node2 -strong- node3 ...
 * If chain starts and ends with strong links on same digit in cells that see each other,
 * that digit can be eliminated from common peers of endpoints.
 */
export function findAIC(
  graph: LinkGraph,
  seesCell: (a: number, b: number) => boolean,
  commonPeers: (cells: number[]) => number[],
  hasCand: (cell: number, digit: number) => boolean,
  maxLength: number,
): AICResult | null {
  const strongMap = graph.strong;
  const weakMap = graph.weak;

  // BFS with alternating link types
  // State: (current node, chain so far, next link type)
  type State = { node: number; chain: number[]; nextStrong: boolean };

  for (const [startNode] of strongMap) {
    const startDecoded = decodeNode(startNode);
    const queue: State[] = [{ node: startNode, chain: [startNode], nextStrong: false }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, chain, nextStrong } = queue.shift()!;
      if (chain.length > maxLength) continue;

      const key = `${node}-${nextStrong}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const linkMap = nextStrong ? strongMap : weakMap;
      const neighbors = linkMap.get(node);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (chain.includes(next)) continue;
        const newChain = [...chain, next];

        // Check if we can form a valid AIC ending
        // Chain needs: strong start, then alternating, ending with strong link
        // Minimum useful chain: 4 nodes (strong-weak-strong)
        if (newChain.length >= 4 && nextStrong) {
          // This link is strong → chain ends with strong link
          const endDecoded = decodeNode(next);

          // Type 1: same digit at both ends, cells see each other
          if (startDecoded.digit === endDecoded.digit && seesCell(startDecoded.cell, endDecoded.cell)) {
            const peers = commonPeers([startDecoded.cell, endDecoded.cell]);
            const elims = peers
              .filter((c) => hasCand(c, startDecoded.digit))
              .map((c) => ({ cell: c, digit: startDecoded.digit }));
            if (elims.length > 0) {
              return {
                chain: newChain.map((n) => ({ ...decodeNode(n), encoded: n })),
                eliminations: elims,
              };
            }
          }

          // Type 2: same cell at both ends, different digits → the cell must be one of the two endpoint digits
          if (startDecoded.cell === endDecoded.cell && startDecoded.digit !== endDecoded.digit) {
            const cell = startDecoded.cell;
            const keep = (1 << startDecoded.digit) | (1 << endDecoded.digit);
            // Eliminate all other candidates from this cell
            const elims: { cell: number; digit: number }[] = [];
            for (let d = 1; d <= 9; d++) {
              if (((1 << d) & keep) === 0 && hasCand(cell, d)) {
                elims.push({ cell, digit: d });
              }
            }
            if (elims.length > 0) {
              return {
                chain: newChain.map((n) => ({ ...decodeNode(n), encoded: n })),
                eliminations: elims,
              };
            }
          }
        }

        if (newChain.length < maxLength) {
          queue.push({ node: next, chain: newChain, nextStrong: !nextStrong });
        }
      }
    }
  }

  return null;
}
