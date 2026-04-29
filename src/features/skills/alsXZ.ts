import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { findALSXZInCells } from './alsHelper';

const META = {
  id: 'als_xz',
  get name() {
    return t('skills.alsXZName');
  },
  subtitle: 'ALS-XZ',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 12) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '12' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const result = findALSXZInCells(selectedCells, cells);
  if (!result) return makeEmptyPreview(META, t('skills.noALSXZ'));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    sourceCells: [...result.a.cells, ...result.b.cells],
    targets: result.elims,
  };
}

function execute(cells: CellData[], preview: SkillPreview): SkillPreview {
  if (!preview.valid) return { ...preview, valid: false };
  const removed: LitCandidate[] = [];
  for (const tgt of preview.targets) {
    const d = cells[tgt.cell];
    if (!d || d.value !== 0) continue;
    const idx = d.notes.indexOf(tgt.digit);
    if (idx < 0) continue;
    d.notes.splice(idx, 1);
    removed.push(tgt);
  }
  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : t('skills.noElimTargets'),
  };
}

export const alsXZSkill: SkillDetector = { ...META, evaluate, execute };
