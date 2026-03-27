import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit, popcount } from '../../helpers/bitmask';
import { findAllALS, type AlmostLockedSet } from '../../helpers/als';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Death Blossom（死亡绽放）：
 * 茎格有N个候选数。对每个候选d，找一个ALS花瓣，花瓣包含d且与茎格在同一单元。
 * 所有花瓣的公共非茎数字z，可从同时看到所有花瓣中z候选格的外部格消去。
 */
export function detectDeathBlossom(board: SolverBoard): DetectionResult | null {
  const allALS = findAllALS(board, 4);
  if (allALS.length === 0) return null;

  // Index ALS by unit and digit for faster lookup
  const alsByUnitAndDigit = new Map<string, AlmostLockedSet[]>();
  for (const als of allALS) {
    const digits = bitsToDigits(als.candidates);
    // Determine which units this ALS belongs to
    const units = new Set<number>();
    for (const c of als.cells) {
      for (const u of SolverBoard.CELL_UNITS[c]) {
        units.add(u);
      }
    }
    // Only count units where ALL als cells belong
    for (const u of units) {
      const unitCells = SolverBoard.ALL_UNITS[u];
      if (als.cells.every((c) => unitCells.includes(c))) {
        for (const d of digits) {
          const key = `${u}:${d}`;
          if (!alsByUnitAndDigit.has(key)) alsByUnitAndDigit.set(key, []);
          alsByUnitAndDigit.get(key)!.push(als);
        }
      }
    }
  }

  // Stems: cells with 2-4 candidates
  const stems = board.emptyCells.filter((c) => {
    const cnt = board.candidateCount(c);
    return cnt >= 2 && cnt <= 4;
  });

  for (const stem of stems) {
    const stemDigits = bitsToDigits(board.candidates[stem]);
    const stemUnits = SolverBoard.CELL_UNITS[stem];

    // For each digit, find candidate petals
    const petalCandidates: AlmostLockedSet[][] = [];
    let possible = true;

    for (const d of stemDigits) {
      const candidates: AlmostLockedSet[] = [];
      for (const u of stemUnits) {
        const key = `${u}:${d}`;
        const alsForKey = alsByUnitAndDigit.get(key) || [];
        for (const als of alsForKey) {
          if (als.cells.includes(stem)) continue;
          // d must be restricted common: stem sees all d-cells in ALS
          const dCells = als.cells.filter((c) => (board.candidates[c] & digitBit(d)) !== 0);
          if (dCells.every((c) => board.seesCell(stem, c))) {
            candidates.push(als);
          }
        }
      }
      if (candidates.length === 0) {
        possible = false;
        break;
      }
      petalCandidates.push(candidates);
    }

    if (!possible) continue;

    // Try combinations of petals (one per digit)
    // Use DFS with pruning
    const result = findPetalCombo(board, stem, stemDigits, petalCandidates, 0, []);
    if (result) return result;
  }

  return null;
}

function findPetalCombo(
  board: SolverBoard,
  stem: number,
  stemDigits: number[],
  petalCandidates: AlmostLockedSet[][],
  idx: number,
  chosen: AlmostLockedSet[],
): DetectionResult | null {
  if (idx === stemDigits.length) {
    // Check for eliminations
    return checkEliminations(board, stem, stemDigits, chosen);
  }

  for (const petal of petalCandidates[idx]) {
    // Petals must not overlap with each other or stem
    let overlap = false;
    for (const prev of chosen) {
      if (prev.cells.some((c) => petal.cells.includes(c))) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    const result = findPetalCombo(board, stem, stemDigits, petalCandidates, idx + 1, [...chosen, petal]);
    if (result) return result;
  }

  return null;
}

function checkEliminations(
  board: SolverBoard,
  stem: number,
  stemDigits: number[],
  petals: AlmostLockedSet[],
): DetectionResult | null {
  // Find common non-stem digits across all petals
  const stemMask = board.candidates[stem];
  let commonCands = petals[0].candidates;
  for (let i = 1; i < petals.length; i++) {
    commonCands &= petals[i].candidates;
  }
  // Remove stem digits
  commonCands &= ~stemMask;
  if (commonCands === 0) return null;

  const zDigits = bitsToDigits(commonCands);
  const allPetalCells = petals.flatMap((p) => p.cells);
  const petalCellSet = new Set(allPetalCells);

  for (const z of zDigits) {
    const zBit = digitBit(z);
    const zCells = allPetalCells.filter((c) => (board.candidates[c] & zBit) !== 0);
    if (zCells.length === 0) continue;

    const peers = board.commonPeers(zCells);
    const actions: DetectionAction[] = [];

    for (const cell of peers) {
      if (cell === stem || petalCellSet.has(cell)) continue;
      if (board.hasCandidate(cell, z)) {
        actions.push({ kind: 'eliminate', cell, digit: z });
      }
    }

    if (actions.length > 0) {
      return {
        technique: 'death_blossom',
        actions,
        patternCells: [stem, ...allPetalCells],
        description: `Death Blossom：茎格 ${cellRef(stem)}{${stemDigits.join(',')}}，${petals.length} 个花瓣，消去数字 ${z} 共 ${actions.length} 处`,
      };
    }
  }

  return null;
}
