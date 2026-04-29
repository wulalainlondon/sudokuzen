// Shared BFS constraint propagation for forcing chain techniques.

import type { CellData } from '../../game/state';

function buildFCUnits(): number[][] {
  const us: number[][] = [];
  for (let r = 0; r < 9; r++) us.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) us.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3,
      bc = (b % 3) * 3;
    const u: number[] = [];
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) u.push(r * 9 + c);
    us.push(u);
  }
  return us;
}

const FC_UNITS = buildFCUnits();

const FC_UNITS_OF: number[][][] = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9),
    c = i % 9,
    b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  return [FC_UNITS[r], FC_UNITS[9 + c], FC_UNITS[18 + b]];
});

const FC_PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>();
  for (const u of FC_UNITS_OF[i]) for (const c of u) if (c !== i) s.add(c);
  return [...s];
});

export interface PropagationResult {
  /** Encoded (cell*9 + digit-1) pairs that were eliminated during propagation. */
  eliminated: Set<number>;
  contradiction: boolean;
}

/**
 * Propagate the assumption that `pivotCell` = `pivotDigit`.
 * Applies naked-single and hidden-single cascades.
 * Returns all eliminated (cell, digit) pairs encoded as cell*9 + (digit-1).
 */
export function propagateAssignment(cells: CellData[], pivotCell: number, pivotDigit: number): PropagationResult {
  if (cells[pivotCell]?.value !== 0) {
    return { eliminated: new Set(), contradiction: cells[pivotCell]?.value !== pivotDigit };
  }

  const notes: number[][] = cells.map((c) => (c.value !== 0 ? [] : [...c.notes]));
  const placed = new Int32Array(81);
  for (let i = 0; i < 81; i++) if (cells[i].value !== 0) placed[i] = cells[i].value;

  const elim = new Set<number>();
  let contradiction = false;
  const queue: [number, number][] = [[pivotCell, pivotDigit]];
  const queued = new Set<number>();
  queued.add(pivotCell * 9 + (pivotDigit - 1));

  while (queue.length > 0 && !contradiction) {
    const [cell, digit] = queue.shift()!;
    if (placed[cell] !== 0) {
      if (placed[cell] !== digit) contradiction = true;
      continue;
    }
    placed[cell] = digit;
    for (const d of notes[cell]) {
      if (d !== digit) elim.add(cell * 9 + (d - 1));
    }
    notes[cell] = [];

    for (const peer of FC_PEERS[cell]) {
      if (placed[peer] !== 0) continue;
      const idx = notes[peer].indexOf(digit);
      if (idx < 0) continue;
      notes[peer].splice(idx, 1);
      elim.add(peer * 9 + (digit - 1));
      if (notes[peer].length === 0) {
        contradiction = true;
        break;
      }
      if (notes[peer].length === 1) {
        const k = peer * 9 + (notes[peer][0] - 1);
        if (!queued.has(k)) {
          queued.add(k);
          queue.push([peer, notes[peer][0]]);
        }
      }
      // Check hidden singles in ALL units of peer for `digit` (peer may belong to units
      // not shared with `cell`, so they would be missed by the per-cell unit sweep below).
      for (const peerUnit of FC_UNITS_OF[peer]) {
        const poss = peerUnit.filter((c) => placed[c] === 0 && notes[c].includes(digit));
        if (poss.length === 0 && !peerUnit.some((c) => placed[c] === digit)) {
          contradiction = true;
          break;
        }
        if (poss.length === 1) {
          const k2 = poss[0] * 9 + (digit - 1);
          if (!queued.has(k2)) {
            queued.add(k2);
            queue.push([poss[0], digit]);
          }
        }
      }
      if (contradiction) break;
    }
    if (contradiction) break;

    for (const unit of FC_UNITS_OF[cell]) {
      for (let d = 1; d <= 9; d++) {
        const positions = unit.filter((c) => placed[c] === 0 && notes[c].includes(d));
        if (positions.length === 0 && !unit.some((c) => placed[c] === d)) {
          contradiction = true;
          break;
        }
        if (positions.length === 1 && placed[positions[0]] === 0) {
          const k = positions[0] * 9 + (d - 1);
          if (!queued.has(k)) {
            queued.add(k);
            queue.push([positions[0], d]);
          }
        }
      }
      if (contradiction) break;
    }
  }

  return { eliminated: elim, contradiction };
}

/**
 * Intersect an array of Sets; returns the set of elements present in all.
 * If `sets` is empty, returns an empty set.
 */
export function intersectSets<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set();
  const result = new Set(sets[0]);
  for (const s of sets.slice(1)) {
    for (const v of result) if (!s.has(v)) result.delete(v);
  }
  return result;
}

/** Decode an encoded (cell, digit) pair. */
export function decodeFC(encoded: number): { cell: number; digit: number } {
  return { cell: Math.floor(encoded / 9), digit: (encoded % 9) + 1 };
}

/** Collect LitCandidates from an intersection set, filtering already-solved cells. */
export function encodeToTargets(cells: CellData[], common: Set<number>): { cell: number; digit: number }[] {
  const targets: { cell: number; digit: number }[] = [];
  for (const enc of common) {
    const { cell, digit } = decodeFC(enc);
    if (!cells[cell] || cells[cell].value !== 0) continue;
    if (!cells[cell].notes.includes(digit)) continue;
    targets.push({ cell, digit });
  }
  return targets;
}
