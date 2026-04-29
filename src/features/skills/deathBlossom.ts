// Death Blossom: a pivot cell with k candidates, each linked to an ALS "petal".
// For each candidate di in pivot: ALS A_i where di is restricted common between pivot and A_i.
// All petals share a "blossom digit" z.
// Elimination: cells seeing all z-cells across all A_i can eliminate z.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther } from './types';
import { tryALS, isRestrictedCommon } from './alsHelper';

const META = {
  id: 'death_blossom',
  get name() {
    return t('skills.deathBlossomName');
  },
  subtitle: 'Death Blossom',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 3) return makeEmptyPreview(META, '');
  if (selectedCells.length > 14) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '3', max: '14' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const n = selectedCells.length;

  // Try each selected cell as the pivot
  for (let pi = 0; pi < n; pi++) {
    const pivot = selectedCells[pi];
    const pivotNotes = cells[pivot].notes;
    if (pivotNotes.length < 2) continue;

    const remainingCells = selectedCells.filter((_, i) => i !== pi);

    // For each candidate di in pivot, try to assign a subset of remainingCells as ALS A_i
    // (ALS where di is restricted common between pivot and A_i)
    // We need exactly one ALS per pivot candidate

    // Build candidate ALS for each pivot digit
    const alsByDigit: Map<number, { cells: number[]; digits: Set<number> }[]> = new Map();
    for (const d of pivotNotes) {
      alsByDigit.set(d, []);
    }

    const m = remainingCells.length;
    for (let mask = 1; mask < 1 << m; mask++) {
      const subCells: number[] = [];
      for (let i = 0; i < m; i++) if ((mask >> i) & 1) subCells.push(remainingCells[i]);
      if (subCells.length > 5) continue;
      const als = tryALS(subCells, cells);
      if (!als) continue;
      // Check which pivot digits can use this ALS (restricted common between pivot and ALS)
      for (const d of pivotNotes) {
        if (!als.digits.has(d)) continue;
        // Pivot sees all ALS cells with d? Actually: pivot alone forms a 1-cell "ALS" for checking restricted common
        const pivotCell = [pivot];
        // Check: pivot and ALS d-cells see each other
        const alsXCells = als.cells.filter((c) => cells[c]?.notes.includes(d));
        if (alsXCells.every((c) => cellsSeeEachOther(pivot, c))) {
          alsByDigit.get(d)!.push(als);
        }
      }
    }

    // Collect ALL non-overlapping ALS assignments (one per pivot digit)
    const digits = pivotNotes;
    const k = digits.length;
    const allAssignments: { cells: number[]; digits: Set<number> }[][] = [];

    function collectAssignments(
      di: number,
      usedCells: Set<number>,
      assignment: { cells: number[]; digits: Set<number> }[],
    ): void {
      if (di === k) {
        allAssignments.push([...assignment]);
        return;
      }
      const d = digits[di];
      for (const als of alsByDigit.get(d) ?? []) {
        if (als.cells.some((c) => usedCells.has(c))) continue;
        const newUsed = new Set([...usedCells, ...als.cells]);
        collectAssignments(di + 1, newUsed, [...assignment, als]);
      }
    }

    collectAssignments(0, new Set([pivot]), []);
    if (allAssignments.length === 0) continue;

    const pivotDigitSet = new Set(pivotNotes);

    for (const petals of allAssignments) {
      // Find blossom digit z: appears in all petals (z ≠ any pivot digit)
      const zCandidates = [...petals[0].digits].filter(
        (d) => !pivotDigitSet.has(d) && petals.every((p) => p.digits.has(d)),
      );
      if (zCandidates.length === 0) continue;

      // Eliminations: cells seeing ALL z-cells across all petals can eliminate z
      const allPetalCells = new Set([pivot, ...petals.flatMap((p) => p.cells)]);
      for (const z of zCandidates) {
        const allZCells = petals.flatMap((p) => p.cells.filter((c) => cells[c]?.notes.includes(z)));
        if (allZCells.length === 0) continue;

        const targets: LitCandidate[] = [];
        for (let p = 0; p < 81; p++) {
          if (allPetalCells.has(p)) continue;
          if (!cells[p] || cells[p].value !== 0) continue;
          if (!cells[p].notes.includes(z)) continue;
          if (allZCells.every((c) => cellsSeeEachOther(p, c))) {
            targets.push({ cell: p, digit: z });
          }
        }

        if (targets.length > 0) {
          return {
            valid: true,
            skillId: META.id,
            skillName: META.name,
            skillSubtitle: META.subtitle,
            sweepDirection: META.sweepDirection,
            sourceCells: [...allPetalCells],
            targets,
          };
        }
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noDeathBlossom'));
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

export const deathBlossomSkill: SkillDetector = { ...META, evaluate, execute };
