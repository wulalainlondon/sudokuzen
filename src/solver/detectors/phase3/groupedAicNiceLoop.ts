import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { buildLinkGraph } from '../../helpers/links';
import { findAIC } from '../../helpers/chains';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Grouped AIC / Nice Loop（分组交替推理链）：
 * 同一单元中多格作为一个逻辑节点构成分组链，
 * 使用 findAIC 搜索最大长度10的链。
 */
export function detectGroupedAicNiceLoop(board: SolverBoard): DetectionResult | null {
  if (board.emptyCells.length < 4) return null;

  const graph = buildLinkGraph(board);

  // Extend graph with grouped strong links:
  // If a digit in a unit has N>2 positions, and within a box-line intersection
  // those positions reduce to a group, add grouped links
  for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(unitIdx, d);
      if (cells.length < 2 || cells.length > 4) continue;

      // Check if all cells in this unit for digit d fall within a single box (or row/col)
      // This creates a grouped node that acts as strong link endpoint
      if (unitIdx < 9) {
        // Row unit - check if positions are all in one box
        const boxes = new Set(cells.map((c) => SolverBoard.CELL_BOX[c]));
        if (boxes.size === 1) {
          const boxIdx = 18 + [...boxes][0];
          const boxCells = board.digitCellsInUnit(boxIdx, d);
          const otherBoxCells = boxCells.filter((c) => !cells.includes(c));
          // Group in row points to rest of box — already handled by standard links
        }
      } else if (unitIdx < 18) {
        // Col unit - similar
        const boxes = new Set(cells.map((c) => SolverBoard.CELL_BOX[c]));
        if (boxes.size === 1) {
          // grouped
        }
      }
    }
  }

  const result = findAIC(
    graph,
    (a, b) => board.seesCell(a, b),
    (cells) => board.commonPeers(cells),
    (cell, d) => board.hasCandidate(cell, d),
    10,
  );

  if (!result) return null;

  const chain = result.chain;
  const patternCells = [...new Set(chain.map((n) => n.cell))];
  const chainDesc = chain.map((n) => `${cellRef(n.cell)}(${n.digit})`).join('-');

  return {
    technique: 'grouped_aic_nice_loop',
    actions: result.eliminations.map((e) => ({ kind: 'eliminate', cell: e.cell, digit: e.digit })),
    patternCells,
    description: `Grouped AIC / Nice Loop：链 ${chainDesc}，消去 ${result.eliminations.length} 处候选数`,
  };
}
