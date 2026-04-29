// Shared utilities for Almost Locked Set (ALS) detection and analysis.

import type { CellData } from '../../game/state';
import type { LitCandidate } from './types';
import { cellsSeeEachOther } from './types';

export interface ALS {
  cells: number[];
  digits: Set<number>; // |digits| = |cells| + 1
}

function inSameUnit(cells: number[]): boolean {
  if (cells.length <= 1) return true;
  const r0 = Math.floor(cells[0] / 9),
    c0 = cells[0] % 9;
  const b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
  const sameRow = cells.every((c) => Math.floor(c / 9) === r0);
  const sameCol = cells.every((c) => c % 9 === c0);
  const sameBox = cells.every((c) => {
    const r = Math.floor(c / 9),
      col = c % 9;
    return Math.floor(r / 3) * 3 + Math.floor(col / 3) === b0;
  });
  return sameRow || sameCol || sameBox;
}

/** Try to form an ALS from the given cell indices. Returns null if not a valid ALS. */
export function tryALS(cellIndices: number[], boardCells: CellData[]): ALS | null {
  if (cellIndices.length === 0) return null;
  if (!inSameUnit(cellIndices)) return null;
  const digits = new Set<number>();
  for (const c of cellIndices) {
    const cell = boardCells[c];
    if (!cell || cell.value !== 0 || cell.notes.length === 0) return null;
    for (const d of cell.notes) digits.add(d);
  }
  if (digits.size !== cellIndices.length + 1) return null;
  return { cells: cellIndices, digits };
}

/**
 * True if digit X in ALS A and ALS B are "restricted common":
 * every X-candidate cell in A sees every X-candidate cell in B.
 */
export function isRestrictedCommon(a: ALS, b: ALS, digit: number, boardCells: CellData[]): boolean {
  const aCells = a.cells.filter((c) => boardCells[c]?.notes.includes(digit));
  const bCells = b.cells.filter((c) => boardCells[c]?.notes.includes(digit));
  if (aCells.length === 0 || bCells.length === 0) return false;
  for (const ac of aCells) {
    for (const bc of bCells) {
      if (!cellsSeeEachOther(ac, bc)) return false;
    }
  }
  return true;
}

/** Compute eliminations: cells seeing all Z-candidates in A AND all Z-candidates in B eliminate Z. */
export function alsXZEliminations(
  a: ALS,
  b: ALS,
  z: number,
  boardCells: CellData[],
  allAlsCells: Set<number>,
): LitCandidate[] {
  const aZCells = a.cells.filter((c) => boardCells[c]?.notes.includes(z));
  const bZCells = b.cells.filter((c) => boardCells[c]?.notes.includes(z));
  if (aZCells.length === 0 || bZCells.length === 0) return [];
  const targets: LitCandidate[] = [];
  for (let p = 0; p < 81; p++) {
    if (allAlsCells.has(p)) continue;
    if (!boardCells[p] || boardCells[p].value !== 0) continue;
    if (!boardCells[p].notes.includes(z)) continue;
    if (aZCells.every((c) => cellsSeeEachOther(p, c)) && bZCells.every((c) => cellsSeeEachOther(p, c))) {
      targets.push({ cell: p, digit: z });
    }
  }
  return targets;
}

/** Check ALS-XZ for two ALS; return eliminations or null. */
export function checkALSXZ(a: ALS, b: ALS, boardCells: CellData[]): LitCandidate[] | null {
  const commonDigits = [...a.digits].filter((d) => b.digits.has(d));
  if (commonDigits.length < 2) return null;
  const allAlsCells = new Set([...a.cells, ...b.cells]);
  for (const x of commonDigits) {
    if (!isRestrictedCommon(a, b, x, boardCells)) continue;
    for (const z of commonDigits) {
      if (z === x) continue;
      const elims = alsXZEliminations(a, b, z, boardCells, allAlsCells);
      if (elims.length > 0) return elims;
    }
  }
  return null;
}

/**
 * Try all two-way splits of `cells` into valid ALS pairs, return first ALS-XZ hit.
 * Limits to cells.length ≤ 13 to keep search tractable.
 */
export function findALSXZInCells(
  cells: number[],
  boardCells: CellData[],
): { a: ALS; b: ALS; elims: LitCandidate[] } | null {
  const n = cells.length;
  if (n > 13) return null;
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const aCells: number[] = [],
      bCells: number[] = [];
    for (let i = 0; i < n; i++) ((mask >> i) & 1 ? aCells : bCells).push(cells[i]);
    if (aCells.length > 6 || bCells.length > 6) continue; // ALS size cap
    const a = tryALS(aCells, boardCells);
    if (!a) continue;
    const b = tryALS(bCells, boardCells);
    if (!b) continue;
    const elims = checkALSXZ(a, b, boardCells);
    if (elims && elims.length > 0) return { a, b, elims };
  }
  return null;
}

/**
 * Try all three-way splits for ALS-XY.
 * X restricted between A-B, Y restricted between B-C, Z eliminable from A+C common peers.
 */
export function findALSXYInCells(
  cells: number[],
  boardCells: CellData[],
): { a: ALS; b: ALS; c: ALS; elims: LitCandidate[] } | null {
  const n = cells.length;
  if (n > 12) return null;
  for (let mask1 = 1; mask1 < (1 << n) - 2; mask1++) {
    const aCells: number[] = [],
      rest1: number[] = [];
    for (let i = 0; i < n; i++) ((mask1 >> i) & 1 ? aCells : rest1).push(cells[i]);
    if (aCells.length > 5 || rest1.length < 2) continue;
    const a = tryALS(aCells, boardCells);
    if (!a) continue;
    const m = rest1.length;
    for (let mask2 = 1; mask2 < (1 << m) - 1; mask2++) {
      const bCells: number[] = [],
        cCells: number[] = [];
      for (let i = 0; i < m; i++) ((mask2 >> i) & 1 ? bCells : cCells).push(rest1[i]);
      if (bCells.length > 5 || cCells.length > 5) continue;
      const b = tryALS(bCells, boardCells);
      if (!b) continue;
      const c = tryALS(cCells, boardCells);
      if (!c) continue;
      // Find X (restricted A-B) and Y (restricted B-C)
      const abCommon = [...a.digits].filter((d) => b.digits.has(d));
      const bcCommon = [...b.digits].filter((d) => c.digits.has(d));
      for (const x of abCommon) {
        if (!isRestrictedCommon(a, b, x, boardCells)) continue;
        for (const y of bcCommon) {
          if (y === x) continue;
          if (!isRestrictedCommon(b, c, y, boardCells)) continue;
          // Z must appear in both A and C (not X or Y)
          const acCommon = [...a.digits].filter((d) => c.digits.has(d) && d !== x && d !== y);
          const allAlsCells = new Set([...a.cells, ...b.cells, ...c.cells]);
          for (const z of acCommon) {
            const elims = alsXZEliminations(a, c, z, boardCells, allAlsCells);
            if (elims.length > 0) return { a, b, c, elims };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Find an ALS chain of length chainLen from selected cells.
 * Chain: A0 --X1--> A1 --X2--> A2 --X3--> ... with Z in A[0] and A[last].
 */
export function findALSChainInCells(
  cells: number[],
  boardCells: CellData[],
  minChain: number,
): { chain: ALS[]; elims: LitCandidate[] } | null {
  const n = cells.length;
  if (n > 14) return null;

  // First, enumerate all valid ALS subsets
  const allALS: ALS[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const sub: number[] = [];
    for (let i = 0; i < n; i++) if ((mask >> i) & 1) sub.push(cells[i]);
    if (sub.length > 6) continue;
    const als = tryALS(sub, boardCells);
    if (als) allALS.push(als);
  }

  if (allALS.length < minChain) return null;

  // BFS over ALS sequences; track explicit RCC digit per link
  // Rules: r_i (RCC between A[i] and A[i+1]) must differ from r_{i+1}, and Z ∉ any RCC
  type State = { chain: ALS[]; used: number[]; rccs: number[] };
  const queue: State[] = allALS.map((a, i) => ({ chain: [a], used: [i], rccs: [] }));

  while (queue.length > 0) {
    const { chain, used, rccs } = queue.shift()!;
    const last = chain[chain.length - 1];
    const lastRCC = rccs.length > 0 ? rccs[rccs.length - 1] : -1;

    if (chain.length >= minChain) {
      const first = chain[0];
      const allAlsCells = new Set(chain.flatMap((als) => als.cells));
      const rccSet = new Set(rccs);
      // Z must be in first and last ALS, and must not coincide with any RCC digit
      const zCandidates = [...first.digits].filter((d) => last.digits.has(d) && !rccSet.has(d));
      for (const z of zCandidates) {
        const elims = alsXZEliminations(first, last, z, boardCells, allAlsCells);
        if (elims.length > 0) return { chain, elims };
      }
    }

    if (chain.length >= 6) continue;

    for (let i = 0; i < allALS.length; i++) {
      if (used.includes(i)) continue;
      const next = allALS[i];
      const existingCells = new Set(chain.flatMap((als) => als.cells));
      if (next.cells.some((c) => existingCells.has(c))) continue;
      // Try all valid RCC choices (different from previous RCC) to keep BFS complete
      const commonDigits = [...last.digits].filter((d) => next.digits.has(d) && d !== lastRCC);
      for (const rcc of commonDigits) {
        if (!isRestrictedCommon(last, next, rcc, boardCells)) continue;
        queue.push({ chain: [...chain, next], used: [...used, i], rccs: [...rccs, rcc] });
      }
    }
  }

  return null;
}
