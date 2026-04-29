// Sue de Coq: cells at the intersection of a line (row/col) and a box.
// Intersection cells' candidates are split between two ALS: one in the line (outside box),
// one in the box (outside line). Eliminations propagate from each ALS to their respective units.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { tryALS } from './alsHelper';

const META = {
  id: 'sue_de_coq',
  get name() {
    return t('skills.sueDeCoqName');
  },
  subtitle: 'Sue de Coq',
  sweepDirection: 'outward' as const,
};

function getRow(idx: number): number {
  return Math.floor(idx / 9);
}
function getCol(idx: number): number {
  return idx % 9;
}
function getBox(idx: number): number {
  return Math.floor(getRow(idx) / 3) * 3 + Math.floor(getCol(idx) / 3);
}

function getRowCells(r: number): number[] {
  return Array.from({ length: 9 }, (_, c) => r * 9 + c);
}
function getColCells(c: number): number[] {
  return Array.from({ length: 9 }, (_, r) => r * 9 + c);
}
function getBoxCells(b: number): number[] {
  const br = Math.floor(b / 3) * 3,
    bc = (b % 3) * 3;
  const cells: number[] = [];
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) cells.push(r * 9 + c);
  return cells;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 5) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '5' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  // All selected cells must be in the same box
  const box0 = getBox(selectedCells[0]);
  if (!selectedCells.every((c) => getBox(c) === box0)) {
    return makeEmptyPreview(META, t('skills.mustBeSameBox'));
  }

  // All selected cells must also be in the same row OR same col
  const row0 = getRow(selectedCells[0]);
  const col0 = getCol(selectedCells[0]);
  const sameRow = selectedCells.every((c) => getRow(c) === row0);
  const sameCol = selectedCells.every((c) => getCol(c) === col0);
  if (!sameRow && !sameCol) {
    return makeEmptyPreview(META, t('skills.mustBeLineAndBox'));
  }

  const lineCells = sameRow ? getRowCells(row0) : getColCells(col0);
  const boxCells = getBoxCells(box0);

  // Intersection = selectedCells (already validated)
  const interSet = new Set(selectedCells);

  // Line cells outside box (ALS line candidate)
  const lineOutside = lineCells.filter((c) => !interSet.has(c) && cells[c]?.value === 0 && cells[c].notes.length > 0);
  // Box cells outside line (ALS box candidate)
  const boxOutside = boxCells.filter((c) => !interSet.has(c) && cells[c]?.value === 0 && cells[c].notes.length > 0);

  // Collect all candidates in selected cells
  const interDigits = new Set<number>();
  for (const c of selectedCells) for (const d of cells[c].notes) interDigits.add(d);

  // Try all subsets of lineOutside cells as ALS X, subsets of boxOutside as ALS Y
  // such that X.digits ∪ Y.digits = interDigits (X ∩ Y can share digits not in inter)
  const lo = lineOutside;
  const bo = boxOutside;

  for (let mX = 1; mX < 1 << lo.length; mX++) {
    const xCells: number[] = [];
    for (let i = 0; i < lo.length; i++) if ((mX >> i) & 1) xCells.push(lo[i]);
    if (xCells.length > 4) continue;
    const alsX = tryALS(xCells, cells);
    if (!alsX) continue;

    for (let mY = 1; mY < 1 << bo.length; mY++) {
      const yCells: number[] = [];
      for (let i = 0; i < bo.length; i++) if ((mY >> i) & 1) yCells.push(bo[i]);
      if (yCells.length > 4) continue;
      const alsY = tryALS(yCells, cells);
      if (!alsY) continue;

      // Check that interDigits ⊆ X.digits ∪ Y.digits
      const combined = new Set([...alsX.digits, ...alsY.digits]);
      if (![...interDigits].every((d) => combined.has(d))) continue;

      // No intersection digit can be shared by both X and Y (must be handled by exactly one)
      if ([...interDigits].some((d) => alsX.digits.has(d) && alsY.digits.has(d))) continue;

      // Sue de Coq eliminations:
      // Line: X.digits ∪ interDigits (all inter digits are constrained to inter∪X in the line)
      // Box:  Y.digits ∪ interDigits (all inter digits are constrained to inter∪Y in the box)
      const targets: LitCandidate[] = [];
      const xCellSet = new Set(xCells);
      const yCellSet = new Set(yCells);
      const lineElimDigits = new Set([...alsX.digits, ...interDigits]);
      const boxElimDigits = new Set([...alsY.digits, ...interDigits]);

      for (const c of lineCells) {
        if (interSet.has(c) || xCellSet.has(c)) continue;
        if (!cells[c] || cells[c].value !== 0) continue;
        for (const d of lineElimDigits) {
          if (cells[c].notes.includes(d)) targets.push({ cell: c, digit: d });
        }
      }
      for (const c of boxCells) {
        if (interSet.has(c) || yCellSet.has(c)) continue;
        if (!cells[c] || cells[c].value !== 0) continue;
        for (const d of boxElimDigits) {
          if (cells[c].notes.includes(d)) targets.push({ cell: c, digit: d });
        }
      }

      // Deduplicate
      const seen = new Set<string>();
      const deduped = targets.filter((t) => {
        const k = `${t.cell}-${t.digit}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (deduped.length > 0) {
        return {
          valid: true,
          skillId: META.id,
          skillName: META.name,
          skillSubtitle: META.subtitle,
          sweepDirection: META.sweepDirection,
          sourceCells: [...selectedCells, ...xCells, ...yCells],
          targets: deduped,
        };
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noSueDeCoq'));
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

export const sueDeCoqSkill: SkillDetector = { ...META, evaluate, execute };
