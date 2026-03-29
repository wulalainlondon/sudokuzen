import { describe, expect, it } from 'vitest';
import { lockedCandidatesSkill } from '../src/features/skills/lockedCandidates';
import type { CellData } from '../src/game/state';

function buildEmptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('locked candidates skill (cell-based)', () => {
  it('finds row-based elimination from same-box cell pair', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [9];
    cells[1].notes = [9];
    cells[5].notes = [9, 3];
    cells[7].notes = [9, 1];

    const preview = lockedCandidatesSkill.evaluate([0, 1], cells);
    expect(preview.valid).toBe(true);
    expect(preview.digits).toEqual([9]);
    expect(preview.sourceCells).toEqual([0, 1]);
    expect(preview.targets).toEqual([
      { cell: 5, digit: 9 },
      { cell: 7, digit: 9 },
    ]);
  });

  it('rejects cells not in same box', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [9];
    cells[10].notes = [9];
    expect(lockedCandidatesSkill.evaluate([0, 10], cells).valid).toBe(false);
  });

  it('rejects when candidate leaks to another row inside the same box', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [9];
    cells[1].notes = [9];
    cells[10].notes = [9]; // same box, different row -> not locked to row 1
    cells[5].notes = [9, 3];
    cells[7].notes = [9, 1];

    const preview = lockedCandidatesSkill.evaluate([0, 1], cells);
    expect(preview.valid).toBe(false);
  });

  it('allows elimination when all same-box candidates align on one row', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [9];
    cells[1].notes = [9];
    cells[2].notes = [9]; // still valid: all 9s in this box are on row 0
    cells[5].notes = [9, 3];
    cells[7].notes = [9, 1];

    const preview = lockedCandidatesSkill.evaluate([0, 1], cells);
    expect(preview.valid).toBe(true);
    expect(preview.targets).toEqual([
      { cell: 5, digit: 9 },
      { cell: 7, digit: 9 },
    ]);
  });

  it('executes by removing candidate notes', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [9];
    cells[1].notes = [9];
    cells[5].notes = [9, 3];
    cells[7].notes = [9, 1];

    const preview = lockedCandidatesSkill.evaluate([0, 1], cells);
    const result = lockedCandidatesSkill.execute(cells, preview);
    expect(result.valid).toBe(true);
    expect(cells[5].notes).toEqual([3]);
    expect(cells[7].notes).toEqual([1]);
  });
});
