import { describe, expect, it } from 'vitest';
import { nakedTripleSkill } from '../src/features/skills/nakedTriple';
import type { CellData } from '../src/game/state';

function buildEmptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('naked triple skill', () => {
  it('detects naked triple in a row', () => {
    const cells = buildEmptyCells();
    // Row 0: cells 0,1,2 have subsets of {2,5,8}
    cells[0].notes = [2, 5];
    cells[1].notes = [5, 8];
    cells[2].notes = [2, 8];
    // Other cells in row 0 have some of those digits
    cells[3].notes = [2, 3, 7];
    cells[5].notes = [5, 6];

    const preview = nakedTripleSkill.evaluate([0, 1, 2], cells);
    expect(preview.valid).toBe(true);
    expect(preview.skillId).toBe('naked_triple');
    expect(preview.digits).toEqual([2, 5, 8]);
    expect(preview.sourceCells).toEqual([0, 1, 2]);
    expect(preview.targets).toContainEqual({ cell: 3, digit: 2 });
    expect(preview.targets).toContainEqual({ cell: 5, digit: 5 });
  });

  it('rejects when union has more than 3 digits', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [2, 5];
    cells[1].notes = [5, 8];
    cells[2].notes = [2, 9]; // 9 makes union = {2,5,8,9} → 4 digits
    expect(nakedTripleSkill.evaluate([0, 1, 2], cells).valid).toBe(false);
  });

  it('rejects with only 2 cells selected', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [2, 5];
    cells[1].notes = [5, 8];
    expect(nakedTripleSkill.evaluate([0, 1], cells).valid).toBe(false);
  });

  it('executes correctly', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [2, 5];
    cells[1].notes = [5, 8];
    cells[2].notes = [2, 8];
    cells[3].notes = [2, 3, 7];

    const preview = nakedTripleSkill.evaluate([0, 1, 2], cells);
    const result = nakedTripleSkill.execute(cells, preview);
    expect(result.valid).toBe(true);
    expect(cells[3].notes).toEqual([3, 7]); // 2 removed
  });
});
