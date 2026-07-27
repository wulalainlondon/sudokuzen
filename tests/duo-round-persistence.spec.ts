// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CellData } from '../src/game/state';
import {
  __DUO_ROUND_KEY,
  clearDuoRoundSnapshot,
  loadDuoRoundSnapshot,
  restoreDuoCells,
  saveDuoRoundSnapshot,
} from '../src/features/duo/duoRoundPersistence';

function emptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('duo round persistence', () => {
  beforeEach(() => localStorage.clear());

  it('restores only the matching room, role and puzzle seed', () => {
    saveDuoRoundSnapshot({
      roomId: 'r1',
      role: 'host',
      puzzleSeed: 42,
      startedAtMs: 1000,
      seconds: 12,
      errors: 1,
      cells: Array.from({ length: 81 }, (_, i) => ({ value: i === 0 ? 5 : 0, notes: i === 1 ? [2, 3] : [] })),
      moves: [{ t: 500, cell: 0, val: 5, ok: true }],
    });
    expect(loadDuoRoundSnapshot('r1', 'host', 42)?.seconds).toBe(12);
    expect(loadDuoRoundSnapshot('r2', 'host', 42)).toBeNull();
    expect(loadDuoRoundSnapshot('r1', 'guest', 42)).toBeNull();
    expect(loadDuoRoundSnapshot('r1', 'host', 43)).toBeNull();
  });

  it('rejects invalid saved digits while restoring correct cells and notes', () => {
    const puzzle = Array(81).fill(0);
    const solution = Array(81).fill(1);
    solution[0] = 5;
    solution[1] = 7;
    saveDuoRoundSnapshot({
      roomId: 'r1',
      role: 'guest',
      puzzleSeed: 9,
      startedAtMs: 1000,
      seconds: 8,
      errors: 0,
      cells: Array.from({ length: 81 }, (_, i) => ({
        value: i === 0 ? 5 : i === 1 ? 9 : 0,
        notes: i === 2 ? [9, 2, 2, 12] : [],
      })),
      moves: [],
    });
    const snapshot = loadDuoRoundSnapshot('r1', 'guest', 9)!;
    const cells = emptyCells();
    expect(restoreDuoCells(cells, puzzle, solution, snapshot)).toBe(1);
    expect(cells[0].value).toBe(5);
    expect(cells[1].value).toBe(0);
    expect(cells[2].notes).toEqual([2, 9]);
  });

  it('clears the active snapshot', () => {
    localStorage.setItem(__DUO_ROUND_KEY, '{}');
    clearDuoRoundSnapshot();
    expect(localStorage.getItem(__DUO_ROUND_KEY)).toBeNull();
  });
});
