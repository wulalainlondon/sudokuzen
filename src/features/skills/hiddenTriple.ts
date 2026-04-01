import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, getSharedUnits, getUnitCells } from './types';

const META = { id: 'hidden_triple', get name() { return t('skills.hiddenTripleName'); }, subtitle: 'Hidden Triple', sweepDirection: 'inward' as const };

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map((x) => [x]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...rest]);
    }
  }
  return result;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 3) return makeEmptyPreview(META, '');

  const emptySel = selectedCells.filter((c) => cells[c]?.value === 0 && cells[c].notes.length > 0);
  if (emptySel.length < 3) return makeEmptyPreview(META, '');

  for (const triple of combinations(emptySel, 3)) {
    const [a, b, c] = triple;

    // If all 3 cells have exactly 3 candidates and they're the same → that's Naked Triple, skip
    if (triple.every((idx) => cells[idx].notes.length === 3)) {
      const s0 = [...cells[a].notes].sort();
      const s1 = [...cells[b].notes].sort();
      const s2 = [...cells[c].notes].sort();
      if (
        s0[0] === s1[0] &&
        s0[0] === s2[0] &&
        s0[1] === s1[1] &&
        s0[1] === s2[1] &&
        s0[2] === s1[2] &&
        s0[2] === s2[2]
      )
        continue;
    }

    // Find all shared units among all 3 cells
    const sharedAB = getSharedUnits(a, b);
    const shared = sharedAB.filter((u) => {
      const unitsAC = getSharedUnits(a, c);
      return unitsAC.some((uc) => uc.unitType === u.unitType && uc.unitIndex === u.unitIndex);
    });
    if (shared.length === 0) continue;

    // Collect common digits (appear in at least 2 of the 3 cells)
    const allDigits = new Set<number>();
    for (const idx of triple) {
      for (const d of cells[idx].notes) allDigits.add(d);
    }

    // Try all digit triples from the available digits
    const digitArr = [...allDigits];
    if (digitArr.length < 3) continue;

    for (const digitTriple of combinations(digitArr, 3)) {
      const tripleDigits = [...digitTriple].sort();

      // Each of the 3 cells must contain at least one of the 3 digits
      if (!triple.every((idx) => tripleDigits.some((d) => cells[idx].notes.includes(d)))) continue;

      // Check hidden condition in at least one shared unit:
      // the 3 digits must ONLY appear in these 3 cells within the unit
      const tripleSet = new Set(triple);
      let validUnit: { unitType: 'row' | 'col' | 'box'; unitIndex: number; label: string } | null = null;

      for (const unit of shared) {
        const unitCells = getUnitCells(unit.unitType, unit.unitIndex);
        let isHidden = true;
        for (const d of tripleDigits) {
          for (const cell of unitCells) {
            if (tripleSet.has(cell)) continue;
            if (cells[cell]?.value === 0 && cells[cell].notes.includes(d)) {
              isHidden = false;
              break;
            }
          }
          if (!isHidden) break;
        }
        if (isHidden) {
          validUnit = unit;
          break;
        }
      }
      if (!validUnit) continue;

      // Elimination targets: non-triple candidates in the 3 cells
      const targets: LitCandidate[] = [];
      for (const idx of triple) {
        for (const d of cells[idx].notes) {
          if (!tripleDigits.includes(d)) targets.push({ cell: idx, digit: d });
        }
      }

      if (targets.length > 0) {
        return {
          valid: true,
          skillId: META.id,
          skillName: META.name,
          skillSubtitle: META.subtitle,
          sweepDirection: META.sweepDirection,
          digits: tripleDigits,
          unitLabel: validUnit.label,
          sourceCells: triple,
          targets,
        };
      }
    }
  }
  return makeEmptyPreview(META, selectedCells.length >= 3 ? t('skills.noHiddenTriple') : '');
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

export const hiddenTripleSkill: SkillDetector = { ...META, evaluate, execute };
