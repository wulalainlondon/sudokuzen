import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { propagateAssignment, intersectSets, encodeToTargets } from './forcingHelper';

const META = {
  id: 'region_forcing_chain',
  get name() {
    return t('skills.regionForcingChainName');
  },
  subtitle: 'Region Forcing Chain',
  sweepDirection: 'inward' as const,
};

// All 27 board units (9 rows, 9 cols, 9 boxes)
function buildUnits(): number[][] {
  const us: number[][] = [];
  for (let r = 0; r < 9; r++) us.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) us.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3,
      bc = (b % 3) * 3;
    const u: number[] = [];
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) u.push(r * 9 + c);
    us.push(u);
  }
  return us;
}

const RFC_UNITS = buildUnits();

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 9) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '9' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const selSet = new Set(selectedCells);

  // Find a unit that contains all selected cells
  const containingUnit = RFC_UNITS.find((u) => selectedCells.every((c) => u.includes(c)));
  if (!containingUnit) return makeEmptyPreview(META, t('skills.mustBeSameUnit'));

  // Find digits whose ALL positions in the unit are exactly the selected cells
  for (let d = 1; d <= 9; d++) {
    const unitPositions = containingUnit.filter((c) => cells[c]?.value === 0 && cells[c].notes.includes(d));
    if (unitPositions.length < 2) continue;
    // All positions of d in this unit must be in selectedCells
    if (!unitPositions.every((p) => selSet.has(p))) continue;
    // All selectedCells must have d
    if (!selectedCells.every((c) => cells[c].notes.includes(d))) continue;

    // Run propagation for each branch (each selected cell = d)
    const results = selectedCells.map((c) => propagateAssignment(cells, c, d));
    const feasibleElims = results.filter((r) => !r.contradiction).map((r) => r.eliminated);

    if (feasibleElims.length === 0) continue;

    const common = intersectSets(feasibleElims);

    // Contradiction branches prove that cell cannot hold `d` → eliminate d from that cell
    for (let i = 0; i < selectedCells.length; i++) {
      if (results[i].contradiction) common.add(selectedCells[i] * 9 + (d - 1));
    }

    const targets = encodeToTargets(cells, common);
    if (targets.length > 0) {
      return {
        valid: true,
        skillId: META.id,
        skillName: META.name,
        skillSubtitle: META.subtitle,
        sweepDirection: META.sweepDirection,
        digits: [d],
        sourceCells: [...selectedCells],
        targets,
      };
    }
  }

  return makeEmptyPreview(META, t('skills.noRegionForcingChain'));
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

export const regionForcingChainSkill: SkillDetector = { ...META, evaluate, execute };
