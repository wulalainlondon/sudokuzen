// SolverBoard — immutable snapshot optimized for technique detection.
// Candidates stored as bitmasks for O(1) set operations.

import { popcount, digitBit } from './helpers/bitmask';

// ── Static lookup tables (computed once) ────────────────────────────

const ROW_CELLS: number[][] = [];
const COL_CELLS: number[][] = [];
const BOX_CELLS: number[][] = [];
const ALL_UNITS: number[][] = [];
const PEERS: number[][] = [];
const CELL_ROW = new Uint8Array(81);
const CELL_COL = new Uint8Array(81);
const CELL_BOX = new Uint8Array(81);
const CELL_UNITS: number[][] = [];

// Init static tables
for (let r = 0; r < 9; r++) {
  const row: number[] = [];
  for (let c = 0; c < 9; c++) row.push(r * 9 + c);
  ROW_CELLS.push(row);
}
for (let c = 0; c < 9; c++) {
  const col: number[] = [];
  for (let r = 0; r < 9; r++) col.push(r * 9 + c);
  COL_CELLS.push(col);
}
for (let br = 0; br < 3; br++) {
  for (let bc = 0; bc < 3; bc++) {
    const box: number[] = [];
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        box.push((br * 3 + dr) * 9 + (bc * 3 + dc));
      }
    }
    BOX_CELLS.push(box);
  }
}

ALL_UNITS.push(...ROW_CELLS, ...COL_CELLS, ...BOX_CELLS);

for (let i = 0; i < 81; i++) {
  CELL_ROW[i] = Math.floor(i / 9);
  CELL_COL[i] = i % 9;
  CELL_BOX[i] = Math.floor(CELL_ROW[i] / 3) * 3 + Math.floor(CELL_COL[i] / 3);
  CELL_UNITS.push([CELL_ROW[i], 9 + CELL_COL[i], 18 + CELL_BOX[i]]);
}

for (let i = 0; i < 81; i++) {
  const peerSet = new Set<number>();
  for (const unitIdx of CELL_UNITS[i]) {
    for (const cell of ALL_UNITS[unitIdx]) {
      if (cell !== i) peerSet.add(cell);
    }
  }
  PEERS.push([...peerSet]);
}

// ── SolverBoard ─────────────────────────────────────────────────────

export class SolverBoard {
  readonly values: Uint8Array;
  readonly candidates: Uint16Array;
  readonly fixed: Uint8Array;
  readonly emptyCells: number[];
  readonly bivalueCells: number[];

  static readonly ROW_CELLS = ROW_CELLS;
  static readonly COL_CELLS = COL_CELLS;
  static readonly BOX_CELLS = BOX_CELLS;
  static readonly ALL_UNITS = ALL_UNITS;
  static readonly PEERS = PEERS;
  static readonly CELL_ROW = CELL_ROW;
  static readonly CELL_COL = CELL_COL;
  static readonly CELL_BOX = CELL_BOX;
  static readonly CELL_UNITS = CELL_UNITS;

  constructor(values: number[], candidateArrays: number[][]) {
    this.values = new Uint8Array(81);
    this.candidates = new Uint16Array(81);
    this.fixed = new Uint8Array(81);
    this.emptyCells = [];
    this.bivalueCells = [];

    for (let i = 0; i < 81; i++) {
      this.values[i] = values[i];
      if (values[i] !== 0) {
        this.fixed[i] = 1;
        this.candidates[i] = 0;
      } else {
        let mask = 0;
        for (const d of candidateArrays[i]) mask |= digitBit(d);
        this.candidates[i] = mask;
        this.emptyCells.push(i);
        if (popcount(mask) === 2) this.bivalueCells.push(i);
      }
    }
  }

  /** Build from the game's CellData[] — auto-computes candidates if notes are empty */
  static fromGameState(cells: { value: number; fixed: boolean; notes: number[] }[]): SolverBoard {
    const values: number[] = [];
    const candidateArrays: number[][] = [];

    for (let i = 0; i < 81; i++) {
      values.push(cells[i].value);
      if (cells[i].value !== 0) {
        candidateArrays.push([]);
      } else if (cells[i].notes && cells[i].notes.length > 0) {
        candidateArrays.push(cells[i].notes);
      } else {
        // Auto-compute candidates from constraints
        const used = new Set<number>();
        for (const p of PEERS[i]) {
          if (cells[p].value !== 0) used.add(cells[p].value);
        }
        // Also check own row/col/box for filled values
        if (cells[i].value !== 0) used.add(cells[i].value);
        const cands: number[] = [];
        for (let d = 1; d <= 9; d++) {
          if (!used.has(d)) cands.push(d);
        }
        candidateArrays.push(cands);
      }
    }

    return new SolverBoard(values, candidateArrays);
  }

  candidateCount(idx: number): number {
    return popcount(this.candidates[idx]);
  }

  hasCandidate(idx: number, d: number): boolean {
    return (this.candidates[idx] & digitBit(d)) !== 0;
  }

  seesCell(a: number, b: number): boolean {
    return CELL_ROW[a] === CELL_ROW[b] || CELL_COL[a] === CELL_COL[b] || CELL_BOX[a] === CELL_BOX[b];
  }

  /** Cells that see ALL given cells */
  commonPeers(cells: number[]): number[] {
    if (cells.length === 0) return [];
    let result = new Set(PEERS[cells[0]]);
    for (let i = 1; i < cells.length; i++) {
      const peerSet = new Set(PEERS[cells[i]]);
      result = new Set([...result].filter((c) => peerSet.has(c)));
    }
    return [...result];
  }

  /** Cells in a unit that have digit d as candidate */
  digitCellsInUnit(unitIdx: number, d: number): number[] {
    const bit = digitBit(d);
    return ALL_UNITS[unitIdx].filter((i) => (this.candidates[i] & bit) !== 0);
  }
}
