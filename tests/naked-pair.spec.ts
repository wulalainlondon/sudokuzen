import { describe, expect, it } from 'vitest';
import { nakedPairSkill } from '../src/features/skills/nakedPair';
import type { CellData } from '../src/game/state';

function buildEmptyCells(): CellData[] {
  return Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [], isError: false }));
}

describe('naked pair skill (cell-based)', () => {
  it('detects naked pair and eliminates from peers', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7];
    cells[1].notes = [3, 7];
    cells[2].notes = [3, 5, 8];
    cells[5].notes = [7, 2];

    const preview = nakedPairSkill.evaluate([0, 1], cells);
    expect(preview.valid).toBe(true);
    expect(preview.skillId).toBe('naked_pair');
    expect(preview.digits).toEqual([3, 7]);
    expect(preview.targets).toEqual([
      { cell: 2, digit: 3 },
      { cell: 5, digit: 7 },
    ]);
  });

  it('rejects when cells have more than 2 candidates', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7, 9];
    cells[1].notes = [3, 7];
    expect(nakedPairSkill.evaluate([0, 1], cells).valid).toBe(false);
  });

  it('rejects cells not in same unit', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7];
    cells[19].notes = [3, 7];
    expect(nakedPairSkill.evaluate([0, 19], cells).valid).toBe(false);
  });

  it('executes correctly', () => {
    const cells = buildEmptyCells();
    cells[0].notes = [3, 7];
    cells[1].notes = [3, 7];
    cells[2].notes = [3, 5, 8];
    cells[5].notes = [7, 2];

    const preview = nakedPairSkill.evaluate([0, 1], cells);
    const result = nakedPairSkill.execute(cells, preview);
    expect(result.valid).toBe(true);
    expect(cells[2].notes).toEqual([5, 8]);
    expect(cells[5].notes).toEqual([2]);
  });
});
