// Conjugate pairs and strong/weak link graph for chain-based techniques

import { SolverBoard } from '../board';

export interface ConjugatePair {
  digit: number;
  cellA: number;
  cellB: number;
  unitIdx: number;
}

/** Find all conjugate pairs (digit has exactly 2 positions in a unit) */
export function findConjugatePairs(board: SolverBoard): ConjugatePair[] {
  const pairs: ConjugatePair[] = [];
  for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(unitIdx, d);
      if (cells.length === 2) {
        pairs.push({ digit: d, cellA: cells[0], cellB: cells[1], unitIdx });
      }
    }
  }
  return pairs;
}

export interface SLPartner {
  digit: number;
  partnerCell: number;
  unitType: 'row' | 'col' | 'box';
}

/** All conjugate pair partners for a given cell (one entry per digit+unit combo) */
export function getConjugatePartnersForCell(cellIdx: number, board: SolverBoard): SLPartner[] {
  return findConjugatePairs(board)
    .filter((p) => p.cellA === cellIdx || p.cellB === cellIdx)
    .map((p) => ({
      digit: p.digit,
      partnerCell: p.cellA === cellIdx ? p.cellB : p.cellA,
      unitType: (p.unitIdx < 9 ? 'row' : p.unitIdx < 18 ? 'col' : 'box') as 'row' | 'col' | 'box',
    }));
}

// Node encoding for link graph: cell * 9 + (digit - 1)
export function encodeNode(cell: number, digit: number): number {
  return cell * 9 + (digit - 1);
}
export function decodeNode(node: number): { cell: number; digit: number } {
  return { cell: Math.floor(node / 9), digit: (node % 9) + 1 };
}

export interface LinkGraph {
  strong: Map<number, Set<number>>; // node → strongly linked nodes
  weak: Map<number, Set<number>>; // node → weakly linked nodes
}

/** Build strong and weak link graph for all (cell, digit) nodes */
export function buildLinkGraph(board: SolverBoard): LinkGraph {
  const strong = new Map<number, Set<number>>();
  const weak = new Map<number, Set<number>>();

  function addLink(map: Map<number, Set<number>>, a: number, b: number) {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  }

  // Strong links from conjugate pairs
  const pairs = findConjugatePairs(board);
  for (const p of pairs) {
    addLink(strong, encodeNode(p.cellA, p.digit), encodeNode(p.cellB, p.digit));
  }

  // Strong links within bivalue cells (if one candidate is false, the other must be true)
  for (const cell of board.bivalueCells) {
    const cands = board.candidates[cell];
    const d1 = cands & -cands;
    const d2 = cands ^ d1;
    const dig1 = Math.log2(d1) | 0;
    const dig2 = Math.log2(d2) | 0;
    addLink(strong, encodeNode(cell, dig1), encodeNode(cell, dig2));
  }

  // Weak links: same digit in same unit (both can't be true)
  for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(unitIdx, d);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          addLink(weak, encodeNode(cells[i], d), encodeNode(cells[j], d));
        }
      }
    }
  }

  // Weak links: same cell different digits (both can't be true in same cell)
  for (const cell of board.emptyCells) {
    const cands = board.candidates[cell];
    const digits: number[] = [];
    let m = cands;
    while (m) {
      const b = m & -m;
      digits.push(Math.log2(b) | 0);
      m ^= b;
    }
    for (let i = 0; i < digits.length; i++) {
      for (let j = i + 1; j < digits.length; j++) {
        addLink(weak, encodeNode(cell, digits[i]), encodeNode(cell, digits[j]));
      }
    }
  }

  return { strong, weak };
}
