import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * XY-Chain:
 * A chain of bivalue cells where adjacent cells share one candidate.
 * If the first cell has {a,b} and the last has {c,a}, cells seeing both ends can eliminate candidate a.
 */
export function detectXyChain(board: SolverBoard): DetectionResult | null {
  const bivals = board.bivalueCells;
  if (bivals.length < 3) return null;

  // Build adjacency for bivalue cells
  const adj = new Map<number, number[]>();
  for (const cell of bivals) {
    adj.set(cell, []);
  }
  for (let i = 0; i < bivals.length; i++) {
    for (let j = i + 1; j < bivals.length; j++) {
      const a = bivals[i],
        b = bivals[j];
      if (!board.seesCell(a, b)) continue;
      // Must share exactly one candidate
      const common = board.candidates[a] & board.candidates[b];
      if (common !== 0 && (common & (common - 1)) === 0) {
        // Exactly one common digit
        adj.get(a)!.push(b);
        adj.get(b)!.push(a);
      }
    }
  }

  const MAX_CHAIN = 8;

  // DFS from each bivalue cell
  for (const start of bivals) {
    const [a, b] = bitsToDigits(board.candidates[start]);

    // Try chain starting with digit a (so the "entering" digit is b, exiting is a at start)
    for (const startDigit of [a, b]) {
      const result = dfsChain(board, adj, start, startDigit, [start], MAX_CHAIN);
      if (result) return result;
    }
  }

  return null;
}

function dfsChain(
  board: SolverBoard,
  adj: Map<number, number[]>,
  start: number,
  exitDigit: number, // the digit at start that we want to match at end
  chain: number[],
  maxLen: number,
): DetectionResult | null {
  const current = chain[chain.length - 1];
  const [d1, d2] = bitsToDigits(board.candidates[current]);

  // The "entering" digit from previous link determines which digit "exits" to next
  let currentExit: number;
  if (chain.length === 1) {
    // At start, the exit digit is the other one
    currentExit = d1 === exitDigit ? d2 : d1;
  } else {
    const prev = chain[chain.length - 2];
    const shared = board.candidates[prev] & board.candidates[current];
    const enteringDigit = Math.log2(shared) | 0;
    currentExit = d1 === enteringDigit ? d2 : d1;
  }

  // Check if we can close: chain end's exit digit = start's exit digit
  if (chain.length >= 3 && currentExit === exitDigit) {
    // Eliminate exitDigit from cells seeing both start and end
    const peers = board.commonPeers([start, current]);
    const actions: DetectionAction[] = [];
    const chainSet = new Set(chain);
    for (const cell of peers) {
      if (chainSet.has(cell)) continue;
      if (board.hasCandidate(cell, exitDigit)) {
        actions.push({ kind: 'eliminate', cell, digit: exitDigit });
      }
    }
    if (actions.length > 0) {
      return {
        technique: 'xy_chain',
        actions,
        patternCells: [...chain],
        description: `XY-Chain: chain ${chain.map(cellRef).join('-')}, eliminate candidate ${exitDigit} in ${actions.length} cells`,
      };
    }
  }

  if (chain.length >= maxLen) return null;

  // Extend chain
  const neighbors = adj.get(current) || [];
  for (const next of neighbors) {
    if (chain.includes(next)) continue;
    // The link digit between current and next must be currentExit
    const common = board.candidates[current] & board.candidates[next];
    const linkDigit = Math.log2(common) | 0;
    if (linkDigit !== currentExit) continue;

    const result = dfsChain(board, adj, start, exitDigit, [...chain, next], maxLen);
    if (result) return result;
  }

  return null;
}
