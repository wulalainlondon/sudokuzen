import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit, popcount } from '../../helpers/bitmask';
import { findAllALS, type AlmostLockedSet } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * ALS-XY (Doubly Restricted Common ALS):
 * Two ALS share two restricted common digits x and y.
 * For digit z in ALS_A not in {x,y}, eliminate z from external cells that see all z-candidate cells in ALS_A.
 * Same applies to ALS_B.
 */
export function detectAlsXy(board: SolverBoard): DetectionResult | null {
  const allALS = findAllALS(board);
  if (allALS.length < 2) return null;

  for (let i = 0; i < allALS.length; i++) {
    const alsA = allALS[i];
    for (let j = i + 1; j < allALS.length; j++) {
      const alsB = allALS[j];

      // No overlap
      if (alsA.cells.some((c) => alsB.cells.includes(c))) continue;

      const commonDigits = alsA.candidates & alsB.candidates;
      if (popcount(commonDigits) < 2) continue;

      const cDigits = bitsToDigits(commonDigits);

      // Find two digits that are both restricted commons
      for (let xi = 0; xi < cDigits.length; xi++) {
        for (let yi = xi + 1; yi < cDigits.length; yi++) {
          const x = cDigits[xi];
          const y = cDigits[yi];

          if (!isRestrictedCommon(board, alsA, alsB, x)) continue;
          if (!isRestrictedCommon(board, alsA, alsB, y)) continue;

          const xyMask = digitBit(x) | digitBit(y);
          const actions: DetectionAction[] = [];
          const allCells = [...alsA.cells, ...alsB.cells];

          // Eliminate non-{x,y} digits from ALS_A visible to external cells
          for (const als of [alsA, alsB]) {
            const nonXY = als.candidates & ~xyMask;
            const zDigits = bitsToDigits(nonXY);

            for (const z of zDigits) {
              const zBit = digitBit(z);
              const zCells = als.cells.filter((c) => (board.candidates[c] & zBit) !== 0);
              const peers = board.commonPeers(zCells);

              for (const cell of peers) {
                if (allCells.includes(cell)) continue;
                if (board.hasCandidate(cell, z)) {
                  actions.push({ kind: 'eliminate', cell, digit: z });
                }
              }
            }
          }

          if (actions.length > 0) {
            // Deduplicate actions
            const seen = new Set<string>();
            const uniqueActions = actions.filter((a) => {
              const key = `${a.cell}:${a.digit}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            return {
              technique: 'als_xy',
              actions: uniqueActions,
              patternCells: allCells,
              description: `ALS-XY: ALS_A{${alsA.cells.map(cellRef).join(',')}} and ALS_B{${alsB.cells.map(cellRef).join(',')}}, doubly restricted common digits ${x},${y}, eliminate ${uniqueActions.length} candidates`,
            };
          }
        }
      }
    }
  }

  return null;
}

function isRestrictedCommon(board: SolverBoard, alsA: AlmostLockedSet, alsB: AlmostLockedSet, d: number): boolean {
  const bit = digitBit(d);
  const aCells = alsA.cells.filter((c) => (board.candidates[c] & bit) !== 0);
  const bCells = alsB.cells.filter((c) => (board.candidates[c] & bit) !== 0);
  for (const a of aCells) {
    for (const b of bCells) {
      if (!board.seesCell(a, b)) return false;
    }
  }
  return true;
}
