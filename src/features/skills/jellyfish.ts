import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { evaluateFish } from './fishHelper';

const META = {
  id: 'jellyfish',
  get name() {
    return t('skills.jellyfishName');
  },
  subtitle: 'Jellyfish',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 4 || selectedCells.length > 16)
    return makeEmptyPreview(META, selectedCells.length < 4 ? '' : t('skills.needSelectRange', { min: '4', max: '16' }));
  return evaluateFish(selectedCells, cells, 4, META);
}

function execute(cells: CellData[], preview: SkillPreview): SkillPreview {
  if (!preview.valid) return { ...preview, valid: false };
  const removed: LitCandidate[] = [];
  for (const t of preview.targets) {
    const d = cells[t.cell];
    if (!d || d.value !== 0) continue;
    const idx = d.notes.indexOf(t.digit);
    if (idx < 0) continue;
    d.notes.splice(idx, 1);
    removed.push(t);
  }
  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : t('skills.noElimTargets'),
  };
}

export const jellyfishSkill: SkillDetector = { ...META, evaluate, execute };
