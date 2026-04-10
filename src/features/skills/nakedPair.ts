import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, getSharedUnits, getUnitCells } from './types';
import { t } from '../../i18n/t';

const META = {
  id: 'naked_pair',
  get name() {
    return t('skills.nakedPairName');
  },
  subtitle: 'Naked Pair',
  sweepDirection: 'outward' as const,
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

      // Both cells must have exactly 2 candidates
      if (dA.notes.length !== 2 || dB.notes.length !== 2) continue;

      // Must be the same 2 digits
      const sA = [...dA.notes].sort(),
        sB = [...dB.notes].sort();
      if (sA[0] !== sB[0] || sA[1] !== sB[1]) continue;

      const pairDigits = sA;
      const shared = getSharedUnits(a, b);
      if (shared.length === 0) continue;

      // Find elimination targets in shared units
      const pairSet = new Set([a, b]);
      const targets: LitCandidate[] = [];
      const seen = new Set<string>();

      for (const { unitType, unitIndex } of shared) {
        for (const c of getUnitCells(unitType, unitIndex)) {
          if (pairSet.has(c)) continue;
          const cd = cells[c];
          if (!cd || cd.value !== 0) continue;
          for (const d of pairDigits) {
            const key = `${c}:${d}`;
            if (!seen.has(key) && cd.notes.includes(d)) {
              targets.push({ cell: c, digit: d });
              seen.add(key);
            }
          }
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
          unitLabel: shared[0].label,
          sourceCells: [a, b],
          targets,
        };
      }
    }
  }
  return makeEmptyPreview(META, selectedCells.length >= 2 ? t('skills.noNakedPair') : '');
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

export const nakedPairSkill: SkillDetector = { ...META, evaluate, execute };
