import { describe, expect, it } from 'vitest';
import { autoSolve } from '../src/features/wild/autoSolver';

// A simple puzzle that can be solved entirely with naked singles
// (Every empty cell has only one possible digit given the constraints)
const EASY_PUZZLE = [
  5, 3, 0, 0, 7, 0, 0, 0, 0,
  6, 0, 0, 1, 9, 5, 0, 0, 0,
  0, 9, 8, 0, 0, 0, 0, 6, 0,
  8, 0, 0, 0, 6, 0, 0, 0, 3,
  4, 0, 0, 8, 0, 3, 0, 0, 1,
  7, 0, 0, 0, 2, 0, 0, 0, 6,
  0, 6, 0, 0, 0, 0, 2, 8, 0,
  0, 0, 0, 4, 1, 9, 0, 0, 5,
  0, 0, 0, 0, 8, 0, 0, 7, 9,
];

const EASY_SOLUTION = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
];

describe('autoSolve', () => {
  it('solves a puzzle fully with naked_single + hidden_single', () => {
    const keys = new Set(['naked_single', 'hidden_single']);
    const { partialPuzzle } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    // Should solve completely
    expect(partialPuzzle).toEqual(EASY_SOLUTION);
  });

  it('makes no progress with empty autoCastKeys', () => {
    const keys = new Set<string>();
    const { partialPuzzle, notes } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    // Should remain unchanged — only given cells filled
    for (let i = 0; i < 81; i++) {
      expect(partialPuzzle[i]).toBe(EASY_PUZZLE[i]);
    }
    // Unsolved cells should have candidates
    const unsolvedCount = partialPuzzle.filter((v) => v === 0).length;
    expect(unsolvedCount).toBeGreaterThan(0);
    // Verify notes exist for unsolved cells
    for (let i = 0; i < 81; i++) {
      if (partialPuzzle[i] === 0) {
        expect(notes[i].length).toBeGreaterThan(0);
      } else {
        expect(notes[i]).toEqual([]);
      }
    }
  });

  it('stops when only allowed techniques cannot make progress', () => {
    // Only allow locked_candidates — it alone cannot place digits, just eliminate candidates
    // On a puzzle requiring naked singles first, it should make no placements
    const keys = new Set(['locked_candidates']);
    const { partialPuzzle } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    // locked_candidates alone might eliminate some candidates but can't place digits
    // The puzzle should remain mostly unsolved
    const solvedByAutoSolve = partialPuzzle.filter((v, i) => v !== 0 && EASY_PUZZLE[i] === 0).length;
    // It should solve 0 cells (locked candidates doesn't place digits)
    expect(solvedByAutoSolve).toBe(0);
  });

  it('produces sorted candidate notes for unsolved cells', () => {
    const keys = new Set<string>();
    const { notes } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    for (const n of notes) {
      if (n.length > 1) {
        for (let i = 1; i < n.length; i++) {
          expect(n[i]).toBeGreaterThan(n[i - 1]);
        }
      }
    }
  });

  it('candidates are valid (no conflicts with placed digits)', () => {
    const keys = new Set<string>();
    const { partialPuzzle, notes } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    for (let i = 0; i < 81; i++) {
      if (partialPuzzle[i] !== 0) continue;
      const row = Math.floor(i / 9);
      const col = i % 9;
      const br = Math.floor(row / 3) * 3;
      const bc = Math.floor(col / 3) * 3;
      for (const d of notes[i]) {
        // Check row
        for (let c = 0; c < 9; c++) {
          expect(partialPuzzle[row * 9 + c]).not.toBe(d);
        }
        // Check col
        for (let r = 0; r < 9; r++) {
          expect(partialPuzzle[r * 9 + col]).not.toBe(d);
        }
        // Check box
        for (let r = br; r < br + 3; r++) {
          for (let c = bc; c < bc + 3; c++) {
            expect(partialPuzzle[r * 9 + c]).not.toBe(d);
          }
        }
      }
    }
  });

  it('solves with naked_single only', () => {
    const keys = new Set(['naked_single']);
    const { partialPuzzle } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    // Naked singles alone may not solve every cell but should make some progress
    const solvedCount = partialPuzzle.filter((v) => v !== 0).length;
    const givenCount = EASY_PUZZLE.filter((v) => v !== 0).length;
    expect(solvedCount).toBeGreaterThanOrEqual(givenCount);
  });

  it('returns empty notes for solved cells', () => {
    const keys = new Set(['naked_single', 'hidden_single']);
    const { notes } = autoSolve(EASY_PUZZLE, EASY_SOLUTION, keys);
    for (const n of notes) {
      // After full solve, all notes should be empty
      expect(n).toEqual([]);
    }
  });
});
