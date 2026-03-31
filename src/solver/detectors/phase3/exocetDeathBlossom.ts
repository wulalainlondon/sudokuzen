import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit, popcount } from '../../helpers/bitmask';
import { findAllALS } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Exocet / Death Blossom（飞数/死亡绽放）：
 *
 * Exocet (Junior Exocet)：
 *   Base: 两格在同一宫、同一行（或列），联合候选 2-4 位（base digits）。
 *   Target: 两格分别在 base 的两列（或两行）上、同 band 不同宫。
 *   Cross-line 约束：band 内非 base 行（或列）中，每个 base digit
 *   只能出现在 target 所在的列（或行），确保 base digits 必须流向 target。
 *   消去：target 格中非 base digit 的候选。
 *
 * Death Blossom：
 *   茎格有 N 个候选，每个候选指向一个 ALS 花瓣，
 *   花瓣公共非茎数字可从公共 peer 消去。
 */
export function detectExocetDeathBlossom(board: SolverBoard): DetectionResult | null {
  const exocetResult = tryExocet(board);
  if (exocetResult) return exocetResult;
  return tryDeathBlossomCompact(board);
}

// ── Junior Exocet ──────────────────────────────────────────────────

function tryExocet(board: SolverBoard): DetectionResult | null {
  // Try row-based Exocet (base cells share a row)
  const rowResult = tryExocetOrientation(board, 'row');
  if (rowResult) return rowResult;
  // Try column-based Exocet (base cells share a column)
  return tryExocetOrientation(board, 'col');
}

function tryExocetOrientation(
  board: SolverBoard,
  orientation: 'row' | 'col',
): DetectionResult | null {
  const isRow = orientation === 'row';

  // Iterate each line (row or col)
  for (let line = 0; line < 9; line++) {
    const lineCells = isRow ? SolverBoard.ROW_CELLS[line] : SolverBoard.COL_CELLS[line];
    const empties = lineCells.filter(c => board.values[c] === 0);

    // Try each pair of empty cells in the same box as base
    for (let i = 0; i < empties.length; i++) {
      for (let j = i + 1; j < empties.length; j++) {
        const b1 = empties[i];
        const b2 = empties[j];
        if (SolverBoard.CELL_BOX[b1] !== SolverBoard.CELL_BOX[b2]) continue;

        const union = board.candidates[b1] | board.candidates[b2];
        const nBase = popcount(union);
        if (nBase < 2 || nBase > 4) continue;

        const baseBox = SolverBoard.CELL_BOX[b1];
        const baseDigits = bitsToDigits(union);

        // Cross-axis positions of base cells (columns for row-based, rows for col-based)
        const cross1 = isRow ? SolverBoard.CELL_COL[b1] : SolverBoard.CELL_ROW[b1];
        const cross2 = isRow ? SolverBoard.CELL_COL[b2] : SolverBoard.CELL_ROW[b2];

        // Band: group of 3 lines
        const bandStart = Math.floor(line / 3) * 3;

        // Find target cells: in cross1/cross2 columns (or rows), same band, different boxes
        const targets: number[] = [];
        for (let ln = bandStart; ln < bandStart + 3; ln++) {
          if (ln === line) continue; // skip base line — targets shouldn't be on base line
          const lnCells = isRow ? SolverBoard.ROW_CELLS[ln] : SolverBoard.COL_CELLS[ln];
          for (const tc of lnCells) {
            if (board.values[tc] !== 0) continue;
            if (SolverBoard.CELL_BOX[tc] === baseBox) continue;
            const tcCross = isRow ? SolverBoard.CELL_COL[tc] : SolverBoard.CELL_ROW[tc];
            if (tcCross !== cross1 && tcCross !== cross2) continue;
            // Target must have at least one base digit
            if ((board.candidates[tc] & union) === 0) continue;
            targets.push(tc);
          }
        }

        if (targets.length < 2) continue;

        // Try target pairs: must be in different boxes and on different cross-axes
        for (let ti = 0; ti < targets.length; ti++) {
          for (let tj = ti + 1; tj < targets.length; tj++) {
            const t1 = targets[ti];
            const t2 = targets[tj];
            if (SolverBoard.CELL_BOX[t1] === SolverBoard.CELL_BOX[t2]) continue;

            const t1Cross = isRow ? SolverBoard.CELL_COL[t1] : SolverBoard.CELL_ROW[t1];
            const t2Cross = isRow ? SolverBoard.CELL_COL[t2] : SolverBoard.CELL_ROW[t2];
            // Targets should be on the two different cross-axes of the base
            if (t1Cross === t2Cross) continue;
            if (!((t1Cross === cross1 && t2Cross === cross2) || (t1Cross === cross2 && t2Cross === cross1))) continue;

            // ── Cross-line verification ──
            // For each non-base line in the band, check that each base digit
            // can only appear in the cross-axis columns/rows of the base cells
            // within the boxes of the targets.
            if (!verifyCrossLines(board, baseDigits, union, b1, b2, t1, t2, bandStart, line, isRow)) continue;

            // ── Build eliminations: remove non-base digits from targets ──
            const actions: DetectionAction[] = [];
            for (const t of [t1, t2]) {
              for (const d of bitsToDigits(board.candidates[t])) {
                if ((union & digitBit(d)) === 0) {
                  actions.push({ kind: 'eliminate', cell: t, digit: d });
                }
              }
            }

            if (actions.length > 0) {
              const orientLabel = isRow ? '行' : '列';
              return {
                technique: 'exocet_death_blossom',
                actions,
                patternCells: [b1, b2, t1, t2],
                description: `Exocet（${orientLabel}）：基格 ${cellRef(b1)},${cellRef(b2)}（base digits ${baseDigits.join(',')}）指向目标 ${cellRef(t1)},${cellRef(t2)}，消去 ${actions.length} 处多余候选`,
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Cross-line verification for Junior Exocet.
 *
 * For each non-base line in the band, and for each base digit d:
 *   In the target boxes, d must be confined to the cross-axis positions
 *   of the base cells (i.e., it can only appear in columns cross1/cross2
 *   for row-based, or rows cross1/cross2 for col-based).
 *
 * This ensures the base digits are "funneled" through the target cells.
 */
function verifyCrossLines(
  board: SolverBoard,
  baseDigits: number[],
  _union: number,
  b1: number,
  b2: number,
  t1: number,
  t2: number,
  bandStart: number,
  baseLine: number,
  isRow: boolean,
): boolean {
  const cross1 = isRow ? SolverBoard.CELL_COL[b1] : SolverBoard.CELL_ROW[b1];
  const cross2 = isRow ? SolverBoard.CELL_COL[b2] : SolverBoard.CELL_ROW[b2];
  const t1Box = SolverBoard.CELL_BOX[t1];
  const t2Box = SolverBoard.CELL_BOX[t2];

  for (let ln = bandStart; ln < bandStart + 3; ln++) {
    if (ln === baseLine) continue;

    const lnCells = isRow ? SolverBoard.ROW_CELLS[ln] : SolverBoard.COL_CELLS[ln];

    for (const d of baseDigits) {
      const dBit = digitBit(d);

      // Check cells in this line that are in the target boxes
      for (const cell of lnCells) {
        if (board.values[cell] !== 0) continue;
        const cellBox = SolverBoard.CELL_BOX[cell];
        if (cellBox !== t1Box && cellBox !== t2Box) continue;

        const cellCross = isRow ? SolverBoard.CELL_COL[cell] : SolverBoard.CELL_ROW[cell];

        // If this cell has base digit d as candidate,
        // it must be on cross1 or cross2 (the target columns/rows)
        if ((board.candidates[cell] & dBit) !== 0) {
          if (cellCross !== cross1 && cellCross !== cross2) {
            return false; // base digit leaks outside target columns → not a valid Exocet
          }
        }
      }
    }
  }

  return true;
}

// ── Death Blossom ──────────────────────────────────────────────────

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
