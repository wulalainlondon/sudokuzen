import { describe, expect, it } from 'vitest';
import { hiddenTripleSkill } from '../src/features/skills/hiddenTriple';
import type { CellData } from '../src/game/state';

function buildEmptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('hidden triple skill', () => {
  it('detects hidden triple and eliminates extra candidates', () => {
    const cells = buildEmptyCells();
    // Row 0: cells 0, 3, 6 (different boxes, only share row)
    // Digits 2,5,8 only appear in these 3 cells within row 0
    cells[0].notes = [2, 1, 9];      // has 2 + extras
    cells[3].notes = [5, 8, 1, 9];   // has 5,8 + extras
    cells[6].notes = [2, 5, 8, 9];   // has 2,5,8 + extra
    // Other row-0 cells have NO 2, 5, or 8 — but 9 must appear elsewhere to prevent {2,5,9}
    cells[1].notes = [1, 9];          // 9 leaks → {2,5,9} is NOT hidden
    cells[2].notes = [3, 7];
    cells[4].notes = [3, 4];
    cells[5].notes = [1, 7];
    cells[7].notes = [3, 4];
    cells[8].notes = [1, 7];

    const preview = hiddenTripleSkill.evaluate([0, 3, 6], cells);
    expect(preview.valid).toBe(true);
    expect(preview.skillId).toBe('hidden_triple');
    expect(preview.digits).toEqual([2, 5, 8]);
    expect(preview.targets).toContainEqual({ cell: 0, digit: 1 });
    expect(preview.targets).toContainEqual({ cell: 0, digit: 9 });
    expect(preview.targets).toContainEqual({ cell: 3, digit: 1 });
    expect(preview.targets).toContainEqual({ cell: 3, digit: 9 });
    expect(preview.targets).toContainEqual({ cell: 6, digit: 9 });
  });

  it('rejects when hidden digits leak to other cells', () => {
    const cells = buildEmptyCells();
    // Row 0: cells 0,3,6. But digit 2 also in cell 1 → not hidden
    cells[0].notes = [2, 1, 9];
    cells[3].notes = [5, 8, 1];
    cells[6].notes = [2, 5, 8, 9];
    cells[1].notes = [2, 4];  // digit 2 leaks!
    cells[2].notes = [3, 7];
    cells[4].notes = [5, 4];  // digit 5 leaks!
    cells[5].notes = [8, 7];  // digit 8 leaks!

    expect(hiddenTripleSkill.evaluate([0, 3, 6], cells).valid).toBe(false);
  });

  it('executes correctly', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [2, 1, 6];
    cells[3].notes = [5, 8, 4];
    cells[6].notes = [2, 5, 8, 6];
    cells[1].notes = [1, 6];    // 6 leaks
    cells[2].notes = [3, 7];
    cells[4].notes = [3, 4];
    cells[5].notes = [1, 7];
    cells[7].notes = [3, 4];
    cells[8].notes = [1, 7];

    const preview = hiddenTripleSkill.evaluate([0, 3, 6], cells);
    expect(preview.valid).toBe(true);
    expect(preview.digits).toEqual([2, 5, 8]);
    const result = hiddenTripleSkill.execute(cells, preview);
    expect(result.valid).toBe(true);
    expect(cells[0].notes).toEqual([2]);
    expect(cells[3].notes).toEqual([5, 8]);
    expect(cells[6].notes).toEqual([2, 5, 8]);
  });
});
