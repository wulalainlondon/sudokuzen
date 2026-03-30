// Naked Single quick-cast detector.
// When a cell has exactly 1 candidate remaining, the player can instantly fill it.
// This is a "zero-step" quick cast — tap triggers auto-detection and fill.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview } from './types';
import { makeEmptyPreview } from './types';

const META = {
  id: 'naked_single',
  name: '明眼',
  subtitle: 'Naked Single',
  sweepDirection: 'inward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  // Quick cast: only 1 cell selected
  if (selectedCells.length !== 1) return makeEmptyPreview(META, '');

  const idx = selectedCells[0];
  const cell = cells[idx];
  if (!cell || cell.value !== 0) return makeEmptyPreview(META, '此格已填入');
  if (cell.notes.length !== 1) return makeEmptyPreview(META, cell.notes.length === 0 ? '無候選數' : '候選數 > 1');

  const digit = cell.notes[0];
  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    sourceCells: [idx],
    targets: [{ cell: idx, digit }],
    digits: [digit],
    unitLabel: '唯一候選',
  };
}

function execute(cells: CellData[], preview: SkillPreview): SkillPreview {
  if (!preview.valid || preview.targets.length === 0) return { ...preview, valid: false };
  // Naked single "execute" clears other notes (should be none) — actual fill is handled by quickCastFill
  const t = preview.targets[0];
  const cell = cells[t.cell];
  if (!cell || cell.value !== 0) return { ...preview, valid: false, reason: '此格已填入' };
  // Mark notes as empty (digit will be filled by quickCastFill in controller)
  cell.notes = [];
  return { ...preview, valid: true };
}

export const nakedSingleSkill: SkillDetector = { ...META, evaluate, execute };
