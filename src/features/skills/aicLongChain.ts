import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { findAICForHints } from './chainHelper';

const META = {
  id: 'aic_long_chain',
  get name() {
    return t('skills.aicLongChainName');
  },
  subtitle: 'AIC Long Chain',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 14) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '14' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const result = findAICForHints(cells, selectedCells, 14);
  if (!result) return makeEmptyPreview(META, t('skills.noAICLongChain'));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    sourceCells: result.patternCells,
    targets: result.targets,
    chainPath: result.chainPath,
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

export const aicLongChainSkill: SkillDetector = { ...META, evaluate, execute };
