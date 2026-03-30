import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, getSharedUnits, getUnitCells } from './types';

const META = { id: 'naked_triple', name: '編織', subtitle: 'Naked Triple', sweepDirection: 'outward' as const };

/** Find all combinations of size k from an array. */
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

  // Try all triples from selected cells
  const emptySel = selectedCells.filter((c) => cells[c]?.value === 0 && cells[c].notes.length > 0);
  if (emptySel.length < 3) return makeEmptyPreview(META, '');

  for (const triple of combinations(emptySel, 3)) {
    const [a, b, c] = triple;

    // Union of all candidates in the 3 cells must be exactly 3 digits
    const unionSet = new Set<number>();
    for (const idx of triple) {
      for (const d of cells[idx].notes) unionSet.add(d);
    }
    if (unionSet.size !== 3) continue;

    const tripleDigits = [...unionSet].sort();

    // Must share at least one unit
    const sharedAB = getSharedUnits(a, b);
    const shared = sharedAB.filter((u) => {
      const unitsAC = getSharedUnits(a, c);
      return unitsAC.some((uc) => uc.unitType === u.unitType && uc.unitIndex === u.unitIndex);
    });
    if (shared.length === 0) continue;

    // Find elimination targets
    const tripleSet = new Set(triple);
    const targets: LitCandidate[] = [];
    const seen = new Set<string>();

    for (const { unitType, unitIndex } of shared) {
      for (const cell of getUnitCells(unitType, unitIndex)) {
        if (tripleSet.has(cell)) continue;
        const cd = cells[cell];
        if (!cd || cd.value !== 0) continue;
        for (const d of tripleDigits) {
          const key = `${cell}:${d}`;
          if (!seen.has(key) && cd.notes.includes(d)) {
            targets.push({ cell, digit: d });
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
        digits: tripleDigits,
        unitLabel: shared[0].label,
        sourceCells: triple,
        targets,
      };
    }
  }
  return makeEmptyPreview(META, selectedCells.length >= 3 ? '未構成三連' : '');
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
    reason: removed.length > 0 ? undefined : '沒有可消去候選',
  };
}

export const nakedTripleSkill: SkillDetector = { ...META, evaluate, execute };
