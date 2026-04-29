// ALS-W-Wing: two ALS linked by a strong link (conjugate pair) on a shared digit.
// The link digit X forms a strong link between A and B via a "bridge" conjugate pair,
// and the elimination digit Z appears in both ALS.
//
// This implementation tries two-ALS splits (as ALS-XZ) plus an additional "bridge cell"
// between the two ALS that provides the conjugate-pair link for X.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther } from './types';
import { tryALS, isRestrictedCommon, alsXZEliminations } from './alsHelper';

const META = {
  id: 'als_w_wing',
  get name() {
    return t('skills.alsWWingName');
  },
  subtitle: 'ALS-W-Wing',
  sweepDirection: 'outward' as const,
};

// Check if digit d has exactly 2 positions in any unit containing both cells A and B.
function isConjugatePairBridge(a: number, b: number, d: number, cells: CellData[]): boolean {
  const rowA = Math.floor(a / 9),
    colA = a % 9;
  const rowB = Math.floor(b / 9),
    colB = b % 9;
  const boxA = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);
  const boxB = Math.floor(rowB / 3) * 3 + Math.floor(colB / 3);

  function countInRow(r: number): number {
    let count = 0;
    for (let c = 0; c < 9; c++) {
      const cell = cells[r * 9 + c];
      if (cell?.value === 0 && cell.notes.includes(d)) count++;
    }
    return count;
  }
  function countInCol(c: number): number {
    let count = 0;
    for (let r = 0; r < 9; r++) {
      const cell = cells[r * 9 + c];
      if (cell?.value === 0 && cell.notes.includes(d)) count++;
    }
    return count;
  }
  function countInBox(b: number): number {
    const br = Math.floor(b / 3) * 3,
      bc = (b % 3) * 3;
    let count = 0;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++) {
        const cell = cells[r * 9 + c];
        if (cell?.value === 0 && cell.notes.includes(d)) count++;
      }
    return count;
  }

  if (rowA === rowB && countInRow(rowA) === 2) return true;
  if (colA === colB && countInCol(colA) === 2) return true;
  if (boxA === boxB && countInBox(boxA) === 2) return true;
  return false;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 3) return makeEmptyPreview(META, '');
  if (selectedCells.length > 12) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '3', max: '12' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const n = selectedCells.length;

  // Try all two-ALS splits; for each, also check if the X digit is linked
  // via a conjugate pair between the "bridge" cells from the two ALS.
  // Since ALS-W-Wing extends ALS-XZ by allowing a strong-link bridge,
  // first try the standard ALS-XZ restricted-common link:
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const aCells: number[] = [],
      bCells: number[] = [];
    for (let i = 0; i < n; i++) ((mask >> i) & 1 ? aCells : bCells).push(selectedCells[i]);
    if (aCells.length > 5 || bCells.length > 5) continue;
    const a = tryALS(aCells, cells);
    if (!a) continue;
    const b = tryALS(bCells, cells);
    if (!b) continue;

    const commonDigits = [...a.digits].filter((d) => b.digits.has(d));
    if (commonDigits.length < 2) continue;
    const allAlsCells = new Set([...a.cells, ...b.cells]);

    for (const x of commonDigits) {
      // Check restricted common OR conjugate-pair bridge on X
      const restricted = isRestrictedCommon(a, b, x, cells);
      if (!restricted) {
        // Try conjugate-pair bridge: any X-cell in A sees any X-cell in B as conjugate pair
        const aXCells = a.cells.filter((c) => cells[c]?.notes.includes(x));
        const bXCells = b.cells.filter((c) => cells[c]?.notes.includes(x));
        const bridgeFound = aXCells.some((ac) => bXCells.some((bc) => isConjugatePairBridge(ac, bc, x, cells)));
        if (!bridgeFound) continue;
      }
      for (const z of commonDigits) {
        if (z === x) continue;
        const elims = alsXZEliminations(a, b, z, cells, allAlsCells);
        if (elims.length > 0) {
          return {
            valid: true,
            skillId: META.id,
            skillName: META.name,
            skillSubtitle: META.subtitle,
            sweepDirection: META.sweepDirection,
            sourceCells: [...a.cells, ...b.cells],
            targets: elims,
          };
        }
      }
    }
  }

  // External bridge: two selected cells act as bridge (conjugate pair on X),
  // remaining cells split into two ALS A and B linked via X through the bridge
  for (let bi1 = 0; bi1 < n; bi1++) {
    for (let bi2 = bi1 + 1; bi2 < n; bi2++) {
      const c1 = selectedCells[bi1];
      const c2 = selectedCells[bi2];
      const rest = selectedCells.filter((_, i) => i !== bi1 && i !== bi2);
      if (rest.length < 2) continue;
      const m = rest.length;
      for (let mask2 = 1; mask2 < (1 << m) - 1; mask2++) {
        const aCells: number[] = [],
          bCells: number[] = [];
        for (let i = 0; i < m; i++) ((mask2 >> i) & 1 ? aCells : bCells).push(rest[i]);
        if (aCells.length > 5 || bCells.length > 5) continue;
        const a = tryALS(aCells, cells);
        if (!a) continue;
        const b = tryALS(bCells, cells);
        if (!b) continue;
        const commonDigits = [...a.digits].filter((d) => b.digits.has(d));
        if (commonDigits.length < 2) continue;
        for (const x of commonDigits) {
          if (!isConjugatePairBridge(c1, c2, x, cells)) continue;
          const aXCells = a.cells.filter((c) => cells[c]?.notes.includes(x));
          const bXCells = b.cells.filter((c) => cells[c]?.notes.includes(x));
          // A connects via c1, B via c2 (or swapped)
          const connAB =
            (aXCells.every((c) => cellsSeeEachOther(c, c1)) && bXCells.every((c) => cellsSeeEachOther(c, c2))) ||
            (aXCells.every((c) => cellsSeeEachOther(c, c2)) && bXCells.every((c) => cellsSeeEachOther(c, c1)));
          if (!connAB) continue;
          const allAlsCells = new Set([...a.cells, ...b.cells, c1, c2]);
          for (const z of commonDigits) {
            if (z === x) continue;
            const elims = alsXZEliminations(a, b, z, cells, allAlsCells);
            if (elims.length > 0) {
              return {
                valid: true,
                skillId: META.id,
                skillName: META.name,
                skillSubtitle: META.subtitle,
                sweepDirection: META.sweepDirection,
                sourceCells: [...a.cells, ...b.cells, c1, c2],
                targets: elims,
              };
            }
          }
        }
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noALSWWing'));
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

export const alsWWingSkill: SkillDetector = { ...META, evaluate, execute };
