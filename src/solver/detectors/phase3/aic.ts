import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { buildLinkGraph } from '../../helpers/links';
import { findAIC } from '../../helpers/chains';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * AIC (Alternating Inference Chain):
 * Uses alternating strong and weak links to form an inference chain (up to 8 nodes).
 * When both ends share the same digit and see each other, eliminate that candidate from common peer cells.
 */
export function detectAic(board: SolverBoard): DetectionResult | null {
  if (board.emptyCells.length < 4) return null;

  const graph = buildLinkGraph(board);
  const result = findAIC(
    graph,
    (a, b) => board.seesCell(a, b),
    (cells) => board.commonPeers(cells),
    (cell, d) => board.hasCandidate(cell, d),
    8,
  );

  if (!result) return null;

  const chain = result.chain;
  const patternCells = [...new Set(chain.map((n) => n.cell))];
  const chainDesc = chain.map((n) => `${cellRef(n.cell)}(${n.digit})`).join('-');

  return {
    technique: 'aic',
    actions: result.eliminations.map((e) => ({ kind: 'eliminate', cell: e.cell, digit: e.digit })),
    patternCells,
    description: `AIC: chain ${chainDesc}, eliminate ${result.eliminations.length} candidates`,
  };
}
