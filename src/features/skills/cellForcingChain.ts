import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { propagateAssignment, intersectSets, encodeToTargets, decodeFC } from './forcingHelper';

const META = {
  id: 'cell_forcing_chain',
  get name() {
    return t('skills.cellForcingChainName');
  },
  subtitle: 'Cell Forcing Chain',
  sweepDirection: 'inward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 1) return makeEmptyPreview(META, '');
  if (selectedCells.length > 9) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '1', max: '9' }));

  // Try each selected cell as pivot, preferring those with more candidates
  const pivots = selectedCells
    .filter((c) => cells[c]?.value === 0 && (cells[c]?.notes.length ?? 0) >= 2)
    .sort((a, b) => (cells[b]?.notes.length ?? 0) - (cells[a]?.notes.length ?? 0));

  if (pivots.length === 0) return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));

  for (const pivot of pivots) {
    const pivotNotes = cells[pivot].notes;
    if (pivotNotes.length < 2) continue;

    const results = pivotNotes.map((d) => propagateAssignment(cells, pivot, d));
    const feasibleElims = results.filter((r) => !r.contradiction).map((r) => r.eliminated);

    if (feasibleElims.length === 0) continue;

    const common = intersectSets(feasibleElims);

    // Digits that led to contradiction are directly eliminated from pivot
    for (let i = 0; i < pivotNotes.length; i++) {
      if (results[i].contradiction) common.add(pivot * 9 + (pivotNotes[i] - 1));
    }

    // Exclude the pivot's own placed value from targets (it's the pivot, not elimination target)
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

  return makeEmptyPreview(META, t('skills.noCellForcingChain'));
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

export const cellForcingChainSkill: SkillDetector = { ...META, evaluate, execute };
