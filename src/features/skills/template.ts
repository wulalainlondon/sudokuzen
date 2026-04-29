// Template: player selects cells they believe are valid placements for digit d.
// System validates which subsets are consistent with all row/col/box constraints,
// then eliminates digit d from any cell not reachable in any valid placement.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';

const META = {
  id: 'template',
  get name() {
    return t('skills.templateName');
  },
  subtitle: 'Template',
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

/**
 * A "placement" for digit d is a set of 9 cells (one per row, col, box) where d can go.
 * Here we work with partial placements over a selected set of cells:
 * A valid partial placement is a subset of selectedCells where:
 *  - Each row contains at most 1 cell
 *  - Each column contains at most 1 cell
 *  - Each box contains at most 1 cell
 *  - Each selected cell has d as a candidate
 *
 * Cells that appear in NO valid placement (using only selectedCells) can have d eliminated.
 * Additionally, if all valid placements cover all 9 rows/cols/boxes when combined with
 * already-placed d values, non-selected cells in uncovered rows/cols/boxes lose d.
 */
function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 18) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '18' }));

  // Find the common digit (all selected cells must share a candidate digit)
  const noteSets = selectedCells.map((c) => new Set(cells[c]?.value === 0 ? cells[c].notes : []));
  if (noteSets.some((s) => s.size === 0)) return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));

  const candidateDigits: number[] = [];
  for (let d = 1; d <= 9; d++) {
    if (noteSets.every((s) => s.has(d))) candidateDigits.push(d);
  }
  if (candidateDigits.length === 0) return makeEmptyPreview(META, t('skills.noCommonDigit'));

  for (const d of candidateDigits) {
    // Find already-placed rows/cols/boxes for digit d
    const placedRows = new Set<number>(),
      placedCols = new Set<number>(),
      placedBoxes = new Set<number>();
    for (let i = 0; i < 81; i++) {
      if (cells[i]?.value === d) {
        placedRows.add(getRow(i));
        placedCols.add(getCol(i));
        placedBoxes.add(getBox(i));
      }
    }

    // Filter selectedCells to those where d can still go (not in placed row/col/box)
    const validCells = selectedCells.filter(
      (c) => !placedRows.has(getRow(c)) && !placedCols.has(getCol(c)) && !placedBoxes.has(getBox(c)),
    );
    if (validCells.length === 0) continue;

    // Enumerate all valid partial placements (no row/col/box conflict within validCells)
    const n = validCells.length;
    const inAnyPlacement = new Set<number>();

    for (let mask = 1; mask < 1 << n; mask++) {
      const chosen: number[] = [];
      for (let i = 0; i < n; i++) if ((mask >> i) & 1) chosen.push(validCells[i]);
      // Check no row/col/box conflict
      const rows = new Set<number>(),
        cols = new Set<number>(),
        boxes = new Set<number>();
      let valid = true;
      for (const c of chosen) {
        const r = getRow(c),
          col = getCol(c),
          box = getBox(c);
        if (rows.has(r) || cols.has(col) || boxes.has(box)) {
          valid = false;
          break;
        }
        rows.add(r);
        cols.add(col);
        boxes.add(box);
      }
      if (!valid) continue;
      // Only count maximal placements: no cell outside chosen can be added without conflict
      let maximal = true;
      for (let i = 0; i < n; i++) {
        if ((mask >> i) & 1) continue; // already in chosen
        const c = validCells[i];
        const r = getRow(c),
          col = getCol(c),
          box = getBox(c);
        if (!rows.has(r) && !cols.has(col) && !boxes.has(box)) {
          maximal = false;
          break;
        }
      }
      if (!maximal) continue;
      for (const c of chosen) inAnyPlacement.add(c);
    }

    // Cells in validCells NOT in any valid placement can have d eliminated
    const eliminateCells = validCells.filter((c) => !inAnyPlacement.has(c));
    if (eliminateCells.length === 0) {
      // Alternative: find cells outside selectedCells in the same units
      // that conflict with ALL valid placements
      // This is the full-template approach but we skip for now
      continue;
    }

    const targets: LitCandidate[] = eliminateCells
      .filter((c) => cells[c]?.value === 0 && cells[c].notes.includes(d))
      .map((c) => ({ cell: c, digit: d }));

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

  return makeEmptyPreview(META, t('skills.noTemplate'));
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

export const templateSkill: SkillDetector = { ...META, evaluate, execute };
