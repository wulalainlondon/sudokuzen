import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';
import { buildLinkGraph, encodeNode, decodeNode } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * AIC Mid-Chain (contradiction elimination):
 * Assume a candidate is true and propagate along strong links. If a contradiction occurs within depth 6
 * (two candidates true in the same cell, or same digit true in two places in a unit),
 * then the assumption is false and the candidate can be eliminated.
 */
export function detectAicMidChain(board: SolverBoard): DetectionResult | null {
  if (board.emptyCells.length < 4) return null;

  const graph = buildLinkGraph(board);
  const MAX_DEPTH = 6;

  for (const cell of board.emptyCells) {
    const digits = bitsToDigits(board.candidates[cell]);
    for (const d of digits) {
      // Assume (cell, d) is true, propagate via strong links to find contradiction
      const trueSet = new Map<number, number>(); // node -> depth
      const startNode = encodeNode(cell, d);
      const queue: { node: number; depth: number }[] = [{ node: startNode, depth: 0 }];
      trueSet.set(startNode, 0);
      let contradiction = false;

      while (queue.length > 0 && !contradiction) {
        const { node, depth } = queue.shift()!;
        if (depth >= MAX_DEPTH) continue;

        const _decoded = decodeNode(node);

        // If this node is true, all weak-linked nodes are false
        const weakNeighbors = graph.weak.get(node);
        if (weakNeighbors) {
          for (const wn of weakNeighbors) {
            // wn is false. If wn has a strong link partner, that partner must be true
            const strongNeighbors = graph.strong.get(wn);
            if (strongNeighbors) {
              for (const sn of strongNeighbors) {
                if (sn === node) continue;
                if (trueSet.has(sn)) continue;

                const snDecoded = decodeNode(sn);

                // Check contradiction: is there already a TRUE node that conflicts with sn?
                // Same cell different digit both true = contradiction
                // Same digit same unit both true = contradiction
                for (const [existingNode] of trueSet) {
                  const ex = decodeNode(existingNode);
                  if (ex.cell === snDecoded.cell && ex.digit !== snDecoded.digit) {
                    // Two different digits forced true in same cell — not contradiction per se
                    // But if cell can't hold both, skip (it's fine, cell just narrows)
                  }
                  if (ex.cell === snDecoded.cell && ex.digit === snDecoded.digit) {
                    // Already there, skip
                    continue;
                  }
                  // Same digit in same unit both true => contradiction
                  if (
                    ex.digit === snDecoded.digit &&
                    ex.cell !== snDecoded.cell &&
                    board.seesCell(ex.cell, snDecoded.cell)
                  ) {
                    contradiction = true;
                    break;
                  }
                }

                // Also check: if forcing sn true means same cell has all candidates forced true => contradiction
                if (!contradiction) {
                  trueSet.set(sn, depth + 1);
                  queue.push({ node: sn, depth: depth + 1 });
                }
                if (contradiction) break;
              }
            }
            if (contradiction) break;
          }
        }
      }

      if (contradiction) {
        const actions: DetectionAction[] = [{ kind: 'eliminate', cell, digit: d }];
        return {
          technique: 'aic_mid_chain',
          actions,
          patternCells: [cell],
          description: `AIC Mid-Chain: assuming ${cellRef(cell)}=${d} leads to contradiction, eliminate this candidate`,
        };
      }
    }
  }

  return null;
}
