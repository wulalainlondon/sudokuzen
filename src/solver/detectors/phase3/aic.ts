import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { buildLinkGraph } from '../../helpers/links';
import { findAIC } from '../../helpers/chains';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * AIC（交替推理链）：
 * 利用强弱链交替构成推理链（最多8个节点），
 * 链两端同数字且互相可见时，可消去公共同伴格的该候选数。
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
    description: `AIC：推理链 ${chainDesc}，消去 ${result.eliminations.length} 处候选数`,
  };
}
