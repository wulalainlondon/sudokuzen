import { describe, expect, it } from 'vitest';
import { hiddenPairSkill } from '../src/features/skills/hiddenPair';
import type { CellData } from '../src/game/state';

function buildEmptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('hidden pair skill (cell-based)', () => {
  it('detects hidden pair and eliminates extra candidates', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7, 5, 9];
    cells[1].notes = [3, 7, 2, 8];
    cells[2].notes = [1, 5, 9];

    const preview = hiddenPairSkill.evaluate([0, 1], cells);
    expect(preview.valid).toBe(true);
    expect(preview.skillId).toBe('hidden_pair');
    expect(preview.sweepDirection).toBe('inward');
    expect(preview.digits).toEqual([3, 7]);
    expect(preview.targets).toContainEqual({ cell: 0, digit: 5 });
    expect(preview.targets).toContainEqual({ cell: 0, digit: 9 });
    expect(preview.targets).toContainEqual({ cell: 1, digit: 2 });
    expect(preview.targets).toContainEqual({ cell: 1, digit: 8 });
  });

  it('rejects when both cells have only 2 candidates (naked pair)', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7];
    cells[1].notes = [3, 7];
    expect(hiddenPairSkill.evaluate([0, 1], cells).valid).toBe(false);
  });

  it('rejects when pair digits leak to other cells in ALL shared units', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7, 5];
    cells[1].notes = [3, 7, 2];
    cells[2].notes = [3, 6]; // leaks digit 3 into both row 0 and box 0

    expect(hiddenPairSkill.evaluate([0, 1], cells).valid).toBe(false);
  });

  it('executes by removing non-pair candidates', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7, 5, 9];
    cells[1].notes = [3, 7, 2];
    cells[2].notes = [1, 5, 9];

    const preview = hiddenPairSkill.evaluate([0, 1], cells);
    const result = hiddenPairSkill.execute(cells, preview);
    expect(result.valid).toBe(true);
    expect(cells[0].notes).toEqual([3, 7]);
    expect(cells[1].notes).toEqual([3, 7]);
  });
});
