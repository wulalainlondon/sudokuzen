import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, getSharedUnits, getUnitCells } from './types';

const META = {
  id: 'hidden_pair',
  get name() {
    return t('skills.hiddenPairName');
  },
  subtitle: 'Hidden Pair',
  sweepDirection: 'inward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');

  for (let i = 0; i < selectedCells.length; i++) {
    for (let j = i + 1; j < selectedCells.length; j++) {
      const a = selectedCells[i],
        b = selectedCells[j];
      const dA = cells[a],
        dB = cells[b];
      if (!dA || dA.value !== 0 || !dB || dB.value !== 0) continue;

      // If both have only 2 candidates and they're the same → that's Naked Pair, skip
      if (dA.notes.length === 2 && dB.notes.length === 2) {
        const sA = [...dA.notes].sort(),
          sB = [...dB.notes].sort();
        if (sA[0] === sB[0] && sA[1] === sB[1]) continue;
      }

      const shared = getSharedUnits(a, b);
      if (shared.length === 0) continue;

      // Find common digits
      const common = dA.notes.filter((d) => dB.notes.includes(d));
      if (common.length < 2) continue;

      // Try all pairs of common digits
      const pairSet = new Set([a, b]);
      for (let p = 0; p < common.length; p++) {
        for (let q = p + 1; q < common.length; q++) {
          const pairDigits = [common[p], common[q]].sort();

          // Check hidden condition in at least one shared unit
          for (const unit of shared) {
            const unitCells = getUnitCells(unit.unitType, unit.unitIndex);
            let isHidden = true;
            for (const d of pairDigits) {
              for (const c of unitCells) {
                if (pairSet.has(c)) continue;
                if (cells[c]?.value === 0 && cells[c].notes.includes(d)) {
                  isHidden = false;
                  break;
                }
              }
              if (!isHidden) break;
            }
            if (!isHidden) continue;

            // Elimination targets: non-pair candidates in the 2 cells
            const targets: LitCandidate[] = [];
            for (const c of [a, b]) {
              for (const d of cells[c].notes) {
                if (!pairDigits.includes(d)) targets.push({ cell: c, digit: d });
              }
            }

            if (targets.length > 0) {
              return {
                valid: true,
                skillId: META.id,
                skillName: META.name,
                skillSubtitle: META.subtitle,
                sweepDirection: META.sweepDirection,
                digits: pairDigits,
                unitLabel: unit.label,
                sourceCells: [a, b],
                targets,
              };
            }
          }
        }
      }
    }
  }
  return makeEmptyPreview(META, selectedCells.length >= 2 ? t('skills.noHiddenPair') : '');
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

export const hiddenPairSkill: SkillDetector = { ...META, evaluate, execute };
