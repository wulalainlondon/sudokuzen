import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { propagateAssignment, intersectSets, encodeToTargets } from './forcingHelper';

const META = {
  id: 'forcing_chain_net',
  get name() {
    return t('skills.forcingChainNetName');
  },
  subtitle: 'Forcing Chain Net',
  sweepDirection: 'inward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 16) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '16' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  // Try each selected cell as pivot (more candidates = more interesting)
  const pivots = [...selectedCells].sort((a, b) => (cells[b]?.notes.length ?? 0) - (cells[a]?.notes.length ?? 0));

  for (const pivot of pivots) {
    const pivotNotes = cells[pivot]?.notes ?? [];
    if (pivotNotes.length < 2) continue;

    const results = pivotNotes.map((d) => propagateAssignment(cells, pivot, d));
    const feasibleElims = results.filter((r) => !r.contradiction).map((r) => r.eliminated);

    if (feasibleElims.length === 0) continue;

    const common = intersectSets(feasibleElims);

    // Add impossible-branch digits as direct eliminations on the pivot
    for (let i = 0; i < pivotNotes.length; i++) {
      if (results[i].contradiction) common.add(pivot * 9 + (pivotNotes[i] - 1));
    }

    const targets = encodeToTargets(cells, common);
    if (targets.length > 0) {
      return {
        valid: true,
        skillId: META.id,
        skillName: META.name,
        skillSubtitle: META.subtitle,
        sweepDirection: META.sweepDirection,
        sourceCells: [...selectedCells],
        targets,
      };
    }
  }

  return makeEmptyPreview(META, t('skills.noForcingChain'));
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

export const forcingChainNetSkill: SkillDetector = { ...META, evaluate, execute };
