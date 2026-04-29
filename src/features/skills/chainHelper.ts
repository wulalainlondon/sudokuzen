// Shared utilities for chain-based skill validation (AIC, XY-Chain, Coloring).

import type { CellData } from '../../game/state';
import type { LitCandidate } from './types';
import { cellsSeeEachOther, getCommonPeers } from './types';

export function encodeNode(cell: number, digit: number): number {
  return cell * 9 + (digit - 1);
}

export function decodeNode(node: number): { cell: number; digit: number } {
  return { cell: Math.floor(node / 9), digit: (node % 9) + 1 };
}

// All 27 board units (9 rows, 9 cols, 9 boxes)
function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, i) => r * 9 + i));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, i) => i * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3,
      bc = (b % 3) * 3;
    const u: number[] = [];
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) u.push(r * 9 + c);
    units.push(u);
  }
  return units;
}

const UNITS = buildUnits();

/** True if cells a and b form a conjugate pair for digit d in any shared unit. */
export function isConjugatePair(a: number, b: number, d: number, cells: CellData[]): boolean {
  const rowA = Math.floor(a / 9),
    colA = a % 9;
  const rowB = Math.floor(b / 9),
    colB = b % 9;
  const boxA = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);
  const boxB = Math.floor(rowB / 3) * 3 + Math.floor(colB / 3);

  if (rowA !== rowB && colA !== colB && boxA !== boxB) return false;

  function countInUnit(unit: number[]): number {
    return unit.filter((c) => cells[c]?.value === 0 && cells[c].notes.includes(d)).length;
  }

  if (rowA === rowB && countInUnit(UNITS[rowA]) === 2) return true;
  if (colA === colB && countInUnit(UNITS[9 + colA]) === 2) return true;
  if (boxA === boxB && countInUnit(UNITS[18 + boxA]) === 2) return true;
  return false;
}

interface LinkGraph {
  strong: Map<number, Set<number>>;
  weak: Map<number, Set<number>>;
}

export function buildLinkGraph(cells: CellData[]): LinkGraph {
  const strong = new Map<number, Set<number>>();
  const weak = new Map<number, Set<number>>();

  function add(map: Map<number, Set<number>>, a: number, b: number) {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  }

  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const pos = unit.filter((c) => cells[c]?.value === 0 && cells[c].notes.includes(d));
      if (pos.length === 2) add(strong, encodeNode(pos[0], d), encodeNode(pos[1], d));
      for (let i = 0; i < pos.length; i++)
        for (let j = i + 1; j < pos.length; j++) add(weak, encodeNode(pos[i], d), encodeNode(pos[j], d));
    }
  }

  for (let c = 0; c < 81; c++) {
    const cell = cells[c];
    if (!cell || cell.value !== 0 || cell.notes.length < 2) continue;
    if (cell.notes.length === 2) add(strong, encodeNode(c, cell.notes[0]), encodeNode(c, cell.notes[1]));
    for (let i = 0; i < cell.notes.length; i++)
      for (let j = i + 1; j < cell.notes.length; j++)
        add(weak, encodeNode(c, cell.notes[i]), encodeNode(c, cell.notes[j]));
  }

  return { strong, weak };
}

export interface AICResult {
  patternCells: number[];
  targets: LitCandidate[];
  chainPath: { cell: number; digit: number }[];
}

/**
 * Find a valid AIC chain on the board that includes all hint cells.
 * Returns the first found AIC whose patternCells ⊇ hintCells.
 */
export function findAICForHints(cells: CellData[], hintCells: number[], maxLength: number): AICResult | null {
  if (hintCells.length < 2) return null;
  const { strong, weak } = buildLinkGraph(cells);
  const hintSet = new Set(hintCells);

  // BFS from hint cell nodes first for faster convergence
  const startNodes: number[] = [];
  for (const c of hintCells) {
    const cell = cells[c];
    if (!cell || cell.value !== 0) continue;
    for (const d of cell.notes) {
      const n = encodeNode(c, d);
      if (strong.has(n)) startNodes.push(n);
    }
  }
  // Fallback: try all strong-linked nodes
  for (const [n] of strong) {
    if (!startNodes.includes(n)) startNodes.push(n);
  }

  for (const startNode of startNodes) {
    const { cell: startCell, digit } = decodeNode(startNode);
    const queue: { node: number; chain: number[]; nextStrong: boolean }[] = [
      { node: startNode, chain: [startNode], nextStrong: true },
    ];

    while (queue.length > 0) {
      const state = queue.shift()!;
      const { node, chain, nextStrong } = state;
      if (chain.length > maxLength) continue;

      const neighbors = (nextStrong ? strong : weak).get(node);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (chain.includes(next)) continue;
        const newChain = [...chain, next];

        if (newChain.length >= 4 && nextStrong) {
          const { cell: endCell, digit: endDigit } = decodeNode(next);
          if (digit === endDigit && cellsSeeEachOther(startCell, endCell)) {
            const patternCells = [...new Set(newChain.map((n) => decodeNode(n).cell))];
            if ([...hintSet].every((c) => patternCells.includes(c))) {
              const chainSet = new Set(patternCells);
              const targets: LitCandidate[] = getCommonPeers([startCell, endCell])
                .filter((p) => !chainSet.has(p) && cells[p]?.value === 0 && cells[p].notes.includes(digit))
                .map((p) => ({ cell: p, digit }));
              if (targets.length > 0) return { patternCells, targets, chainPath: newChain.map((n) => decodeNode(n)) };
            }
          }
        }
        if (newChain.length < maxLength) queue.push({ node: next, chain: newChain, nextStrong: !nextStrong });
      }
    }
  }
  return null;
}
