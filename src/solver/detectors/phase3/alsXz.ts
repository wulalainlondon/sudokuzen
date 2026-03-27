import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit, popcount } from '../../helpers/bitmask';
import { findAllALS } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * ALS-XZ（几乎锁定集 XZ 规则）：
 * 找两个ALS（A和B），它们共享一个受限公共数字x（x在A和B中的候选格互相全部可见）。
 * 对于另一个公共数字z，从同时看到A和B中所有z候选格的外部格消去z。
 */
export function detectAlsXz(board: SolverBoard): DetectionResult | null {
  const allALS = findAllALS(board);
  if (allALS.length < 2) return null;

  for (let i = 0; i < allALS.length; i++) {
    const alsA = allALS[i];
    for (let j = i + 1; j < allALS.length; j++) {
      const alsB = allALS[j];

      // ALS must not overlap
      if (alsA.cells.some((c) => alsB.cells.includes(c))) continue;

      const commonDigits = alsA.candidates & alsB.candidates;
      if (popcount(commonDigits) < 2) continue;

      const cDigits = bitsToDigits(commonDigits);

      // Try each common digit as restricted common x
      for (const x of cDigits) {
        const xBit = digitBit(x);
        const aCellsX = alsA.cells.filter((c) => (board.candidates[c] & xBit) !== 0);
        const bCellsX = alsB.cells.filter((c) => (board.candidates[c] & xBit) !== 0);

        // Restricted common: every cell in aCellsX must see every cell in bCellsX
        let restricted = true;
        for (const a of aCellsX) {
          for (const b of bCellsX) {
            if (!board.seesCell(a, b)) {
              restricted = false;
              break;
            }
          }
          if (!restricted) break;
        }
        if (!restricted) continue;

        // For each other common digit z, eliminate z from cells seeing all z-cells in both ALS
        for (const z of cDigits) {
          if (z === x) continue;
          const zBit = digitBit(z);
          const aCellsZ = alsA.cells.filter((c) => (board.candidates[c] & zBit) !== 0);
          const bCellsZ = alsB.cells.filter((c) => (board.candidates[c] & zBit) !== 0);
          const allZCells = [...aCellsZ, ...bCellsZ];

          const peers = board.commonPeers(allZCells);
          const actions: DetectionAction[] = [];
          for (const cell of peers) {
            if (alsA.cells.includes(cell) || alsB.cells.includes(cell)) continue;
            if (board.hasCandidate(cell, z)) {
              actions.push({ kind: 'eliminate', cell, digit: z });
            }
          }

          if (actions.length > 0) {
            const patternCells = [...alsA.cells, ...alsB.cells];
            return {
              technique: 'als_xz',
              actions,
              patternCells,
              description: `ALS-XZ：ALS_A{${alsA.cells.map(cellRef).join(',')}} 与 ALS_B{${alsB.cells.map(cellRef).join(',')}}，受限公共数 ${x}，消去数字 ${z} 共 ${actions.length} 处`,
            };
          }
        }
      }
    }
  }

  return null;
}
