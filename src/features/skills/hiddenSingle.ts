// Hidden Single quick-cast detector.
// A cell has multiple candidates, but one digit appears only once in its row, col, or box.
// Player selects the cell, then picks the digit they believe is the hidden single.
// System validates → eliminates other candidates → cell auto-fills.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, getUnitCells } from './types';

const META = {
  id: 'hidden_single',
  name: '暗眼',
  subtitle: 'Hidden Single',
  sweepDirection: 'inward' as const,
};

type UnitType = 'row' | 'col' | 'box';

const UNIT_LABELS: Record<UnitType, (n: number) => string> = {
  row: (n) => `第 ${n + 1} 列`,
  col: (n) => `第 ${n + 1} 欄`,
  box: (n) => `第 ${n + 1} 宮`,
};

/** Find hidden singles for a cell: digits that appear only in this cell within some unit. */
function findHiddenSingles(idx: number, cells: CellData[]): { digit: number; unitType: UnitType; unitIndex: number }[] {
  const cell = cells[idx];
  if (!cell || cell.value !== 0 || cell.notes.length < 2) return [];

  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);

  const results: { digit: number; unitType: UnitType; unitIndex: number }[] = [];

  const units: { type: UnitType; index: number }[] = [
    { type: 'row', index: row },
    { type: 'col', index: col },
    { type: 'box', index: box },
  ];

  for (const digit of cell.notes) {
    for (const unit of units) {
      const unitCells = getUnitCells(unit.type, unit.index);
      // Count how many cells in this unit have this digit as a candidate
      let count = 0;
      for (const uc of unitCells) {
        const ucData = cells[uc];
        if (ucData && ucData.value === 0 && ucData.notes.includes(digit)) {
          count++;
          if (count > 1) break;
        }
      }
      if (count === 1) {
        results.push({ digit, unitType: unit.type, unitIndex: unit.index });
        break; // One unit proof is enough for this digit
      }
    }
  }

  return results;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  // Quick cast: 1 cell selected
  if (selectedCells.length !== 1) return makeEmptyPreview(META, '');

  const idx = selectedCells[0];
  const cell = cells[idx];
  if (!cell || cell.value !== 0) return makeEmptyPreview(META, '此格已填入');
  if (cell.notes.length < 2) return makeEmptyPreview(META, '候選數不足');

  const hiddens = findHiddenSingles(idx, cells);
  if (hiddens.length === 0) return makeEmptyPreview(META, '此格無暗眼');

  // Use first found hidden single
  const best = hiddens[0];
  // Targets: all OTHER candidates in this cell (they will be eliminated)
  const targets: LitCandidate[] = cell.notes.filter((d) => d !== best.digit).map((d) => ({ cell: idx, digit: d }));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    sourceCells: [idx],
    targets,
    digits: [best.digit],
    unitLabel: UNIT_LABELS[best.unitType](best.unitIndex),
  };
}

function execute(cells: CellData[], preview: SkillPreview): SkillPreview {
  if (!preview.valid || !preview.digits?.length) return { ...preview, valid: false };
  const idx = preview.sourceCells[0];
  const cell = cells[idx];
  if (!cell || cell.value !== 0) return { ...preview, valid: false, reason: '此格已填入' };

  const removed: LitCandidate[] = [];

  for (const t of preview.targets) {
    const noteIdx = cell.notes.indexOf(t.digit);
    if (noteIdx >= 0) {
      cell.notes.splice(noteIdx, 1);
      removed.push(t);
    }
  }

  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : '沒有可消去候選',
  };
}

export const hiddenSingleSkill: SkillDetector = { ...META, evaluate, execute };
