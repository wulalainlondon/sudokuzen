import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit, popcount } from '../../helpers/bitmask';
import { findAllALS } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Exocet / Death Blossom（共轭飞数/死亡绽放）：
 * Exocet：两个基格具有相同候选数并指向两个目标格，满足特定约束时可消去目标格多余候选。
 * Death Blossom：茎格有N个候选，每个候选指向一个ALS花瓣，花瓣公共非茎数字可消去。
 * 两种模式都较罕见，不匹配时快速返回null。
 */
export function detectExocetDeathBlossom(board: SolverBoard): DetectionResult | null {
  // Try Exocet first
  const exocetResult = tryExocet(board);
  if (exocetResult) return exocetResult;

  // Try Death Blossom
  return tryDeathBlossomCompact(board);
}

function tryExocet(board: SolverBoard): DetectionResult | null {
  // Exocet: two base cells in same row with same 2-3 candidates
  // pointing to two target cells in different boxes in the same band
  for (let row = 0; row < 9; row++) {
    const rowCells = SolverBoard.ROW_CELLS[row];
    const emptiesInRow = rowCells.filter((c) => board.values[c] === 0);

    for (let i = 0; i < emptiesInRow.length; i++) {
      for (let j = i + 1; j < emptiesInRow.length; j++) {
        const base1 = emptiesInRow[i];
        const base2 = emptiesInRow[j];

        // Must be in same box
        if (SolverBoard.CELL_BOX[base1] !== SolverBoard.CELL_BOX[base2]) continue;

        const cands1 = board.candidates[base1];
        const cands2 = board.candidates[base2];
        const union = cands1 | cands2;
        const count = popcount(union);
        if (count < 2 || count > 3) continue;

        // Find target cells: same row or band, different boxes
        const baseBox = SolverBoard.CELL_BOX[base1];
        const baseDigits = bitsToDigits(union);

        // Look for two target cells in other boxes in the same band
        const bandStart = Math.floor(row / 3) * 3;
        const targets: number[] = [];

        for (let tr = bandStart; tr < bandStart + 3; tr++) {
          for (const tc of SolverBoard.ROW_CELLS[tr]) {
            if (board.values[tc] !== 0) continue;
            if (SolverBoard.CELL_BOX[tc] === baseBox) continue;
            if (
              SolverBoard.CELL_COL[tc] === SolverBoard.CELL_COL[base1] ||
              SolverBoard.CELL_COL[tc] === SolverBoard.CELL_COL[base2]
            ) {
              // Target must have at least the base digits as candidates
              if ((board.candidates[tc] & union) !== 0) {
                targets.push(tc);
              }
            }
          }
        }

        if (targets.length < 2) continue;

        // Check if targets in different boxes
        for (let ti = 0; ti < targets.length; ti++) {
          for (let tj = ti + 1; tj < targets.length; tj++) {
            const t1 = targets[ti];
            const t2 = targets[tj];
            if (SolverBoard.CELL_BOX[t1] === SolverBoard.CELL_BOX[t2]) continue;

            // Eliminate non-base digits from target cells
            const actions: DetectionAction[] = [];
            for (const t of [t1, t2]) {
              const tDigits = bitsToDigits(board.candidates[t]);
              for (const d of tDigits) {
                if ((union & digitBit(d)) === 0) {
                  actions.push({ kind: 'eliminate', cell: t, digit: d });
                }
              }
            }

            if (actions.length > 0) {
              return {
                technique: 'exocet_death_blossom',
                actions,
                patternCells: [base1, base2, t1, t2],
                description: `Exocet：基格 ${cellRef(base1)},${cellRef(base2)} 指向目标 ${cellRef(t1)},${cellRef(t2)}，消去 ${actions.length} 处多余候选`,
              };
            }
          }
        }
      }
    }
  }

  return null;
}

function tryDeathBlossomCompact(board: SolverBoard): DetectionResult | null {
  const allALS = findAllALS(board, 4);
  if (allALS.length === 0) return null;

  // Stem: cell with 2-3 candidates
  const stems = board.emptyCells.filter((c) => {
    const cnt = board.candidateCount(c);
    return cnt >= 2 && cnt <= 3;
  });

  for (const stem of stems) {
    const stemDigits = bitsToDigits(board.candidates[stem]);

    // For each digit of stem, find an ALS petal containing that digit,
    // where the ALS is in a unit with the stem and doesn't contain the stem
    const petals: Map<number, (typeof allALS)[0]> = new Map();
    let foundAll = true;

    for (const d of stemDigits) {
      let found = false;
      for (const als of allALS) {
        if (als.cells.includes(stem)) continue;
        if ((als.candidates & digitBit(d)) === 0) continue;

        // ALS must share a unit with stem
        const stemUnits = SolverBoard.CELL_UNITS[stem];
        let sharesUnit = false;
        for (const unitIdx of stemUnits) {
          const unitCells = SolverBoard.ALL_UNITS[unitIdx];
          if (als.cells.every((c) => unitCells.includes(c))) {
            sharesUnit = true;
            break;
          }
        }
        if (!sharesUnit) continue;

        // The digit d must be restricted common: stem sees all d-cells in ALS
        const dCellsInALS = als.cells.filter((c) => (board.candidates[c] & digitBit(d)) !== 0);
        if (!dCellsInALS.every((c) => board.seesCell(stem, c))) continue;

        petals.set(d, als);
        found = true;
        break;
      }
      if (!found) {
        foundAll = false;
        break;
      }
    }

    if (!foundAll || petals.size !== stemDigits.length) continue;

    // Find common non-stem digits across all petals
    const petalArr = [...petals.values()];
    let commonCands = petalArr[0].candidates;
    for (let i = 1; i < petalArr.length; i++) {
      commonCands &= petalArr[i].candidates;
    }
    // Remove stem digits
    commonCands &= ~board.candidates[stem];
    if (commonCands === 0) continue;

    const zDigits = bitsToDigits(commonCands);
    const allPetalCells = petalArr.flatMap((p) => p.cells);

    for (const z of zDigits) {
      const zBit = digitBit(z);
      const zCells = allPetalCells.filter((c) => (board.candidates[c] & zBit) !== 0);
      const peers = board.commonPeers(zCells);

      const actions: DetectionAction[] = [];
      const petalCellSet = new Set(allPetalCells);
      for (const cell of peers) {
        if (cell === stem || petalCellSet.has(cell)) continue;
        if (board.hasCandidate(cell, z)) {
          actions.push({ kind: 'eliminate', cell, digit: z });
        }
      }

      if (actions.length > 0) {
        return {
          technique: 'exocet_death_blossom',
          actions,
          patternCells: [stem, ...allPetalCells],
          description: `Death Blossom：茎格 ${cellRef(stem)}，${petalArr.length} 个花瓣 ALS，消去数字 ${z} 共 ${actions.length} 处`,
        };
      }
    }
  }

  return null;
}
