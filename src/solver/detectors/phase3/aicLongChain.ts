import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { buildLinkGraph } from '../../helpers/links';
import { findAIC } from '../../helpers/chains';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * AIC Long Chain:
 * Same logic as standard AIC, but allows chain search up to 14 nodes,
 * enabling discovery of deeper logical deductions.
 */
export function detectAicLongChain(board: SolverBoard): DetectionResult | null {
  if (board.emptyCells.length < 4) return null;

  const graph = buildLinkGraph(board);
  const result = findAIC(
    graph,
    (a, b) => board.seesCell(a, b),
    (cells) => board.commonPeers(cells),
    (cell, d) => board.hasCandidate(cell, d),
    14,
  );

  if (!result) return null;

  const chain = result.chain;
  const patternCells = [...new Set(chain.map((n) => n.cell))];
  const chainDesc = chain.map((n) => `${cellRef(n.cell)}(${n.digit})`).join('-');

  return {
    technique: 'aic_long_chain',
    actions: result.eliminations.map((e) => ({ kind: 'eliminate', cell: e.cell, digit: e.digit })),
    patternCells,
    description: `AIC Long Chain: ${chainDesc}, eliminate ${result.eliminations.length} candidates`,
  };
}
