import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { buildLinkGraph } from '../../helpers/links';
import { findAIC } from '../../helpers/chains';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * AIC Long Chain（长交替推理链）：
 * 与普通AIC相同逻辑，但允许最多14个节点的长链搜索，
 * 可发现更深层的逻辑推理。
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
    description: `AIC Long Chain：长链 ${chainDesc}，消去 ${result.eliminations.length} 处候选数`,
  };
}
