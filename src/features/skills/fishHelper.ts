// Shared fish-pattern evaluator for X-Wing, Swordfish, Jellyfish.

import type { CellData } from '../../game/state';
import type { SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview } from './types';
import { t } from '../../i18n/t';

interface FishMeta {
  id: string;
  name: string;
  subtitle: string;
  sweepDirection: 'outward' | 'inward';
}

/**
 * Evaluate a fish pattern of the given size.
 * @param selectedCells cells the player selected
 * @param cells board state
 * @param size 2 = X-Wing, 3 = Swordfish, 4 = Jellyfish
 * @param META skill metadata
 */
export function evaluateFish(selectedCells: number[], cells: CellData[], size: number, META: FishMeta): SkillPreview {
  if (selectedCells.length < size) return makeEmptyPreview(META, '');

  // All selected cells must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  // Collect rows and cols
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (const idx of selectedCells) {
    rows.add(Math.floor(idx / 9));
    cols.add(idx % 9);
  }

  if (rows.size !== size || cols.size !== size) {
    return makeEmptyPreview(META, t('skills.needRowsCols', { n: String(size) }));
  }

  const rowArr = [...rows];
  const colArr = [...cols];
  // Find common candidate digit(s) among all selected cells
  const firstNotes = cells[selectedCells[0]].notes;
  const commonDigits = firstNotes.filter((d) => selectedCells.every((idx) => cells[idx].notes.includes(d)));

  for (const digit of commonDigits) {
    // Try row-based fish: digit in the selected rows must only appear in the selected cols
    const rowBased = rowArr.every((r) => {
      for (let c = 0; c < 9; c++) {
        if (colArr.includes(c)) continue;
        const cell = cells[r * 9 + c];
        if (cell && cell.value === 0 && cell.notes.includes(digit)) return false;
      }
      return true;
    });

    if (rowBased) {
      // Eliminate digit from selected cols, outside selected rows
      const targets: LitCandidate[] = [];
      for (const c of colArr) {
        for (let r = 0; r < 9; r++) {
          if (rowArr.includes(r)) continue;
          const idx = r * 9 + c;
          const cell = cells[idx];
          if (cell && cell.value === 0 && cell.notes.includes(digit)) {
            targets.push({ cell: idx, digit });
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
          digits: [digit],
          sourceCells: selectedCells.slice(),
          targets,
        };
      }
    }

    // Try col-based fish: digit in the selected cols must only appear in the selected rows
    const colBased = colArr.every((c) => {
      for (let r = 0; r < 9; r++) {
        if (rowArr.includes(r)) continue;
        const cell = cells[r * 9 + c];
        if (cell && cell.value === 0 && cell.notes.includes(digit)) return false;
      }
      return true;
    });

    if (colBased) {
      // Eliminate digit from selected rows, outside selected cols
      const targets: LitCandidate[] = [];
      for (const r of rowArr) {
        for (let c = 0; c < 9; c++) {
          if (colArr.includes(c)) continue;
          const idx = r * 9 + c;
          const cell = cells[idx];
          if (cell && cell.value === 0 && cell.notes.includes(digit)) {
            targets.push({ cell: idx, digit });
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
          digits: [digit],
          sourceCells: selectedCells.slice(),
          targets,
        };
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noFishPattern', { name: META.name }));
}

function fishCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...fishCombinations(rest, k - 1).map((c) => [first, ...c]), ...fishCombinations(rest, k)];
}

/**
 * Evaluate a finned fish pattern of the given size.
 * @param selectedCells cells the player selected
 * @param cells board state
 * @param size 2 = Finned X-Wing, 3 = Finned Swordfish, 4 = Finned Jellyfish
 * @param META skill metadata
 */
export function evaluateFinnedFish(
  selectedCells: number[],
  cells: CellData[],
  size: number,
  META: FishMeta,
): SkillPreview {
  const maxCells = size * (size + 1);
  if (selectedCells.length < size + 1) return makeEmptyPreview(META, '');
  if (selectedCells.length > maxCells) {
    return makeEmptyPreview(META, t('skills.needSelectRange', { min: String(size + 1), max: String(maxCells) }));
  }

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const firstNotes = cells[selectedCells[0]].notes;
  const commonDigits = firstNotes.filter((d) => selectedCells.every((idx) => cells[idx].notes.includes(d)));

  for (const digit of commonDigits) {
    const r = tryFinnedForDigit(selectedCells, cells, digit, size, 'row', META);
    if (r) return r;
    const c = tryFinnedForDigit(selectedCells, cells, digit, size, 'col', META);
    if (c) return c;
  }

  return makeEmptyPreview(META, t('skills.noFishPattern', { name: META.name }));
}

function tryFinnedForDigit(
  selectedCells: number[],
  cells: CellData[],
  digit: number,
  size: number,
  lineType: 'row' | 'col',
  META: FishMeta,
): SkillPreview | null {
  const getLine = (idx: number) => (lineType === 'row' ? Math.floor(idx / 9) : idx % 9);
  const getCross = (idx: number) => (lineType === 'row' ? idx % 9 : Math.floor(idx / 9));
  const getBox = (idx: number) => Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3);

  // Build eligible lines from full board (2..size+1 digit positions)
  const eligible: { line: number; positions: number[] }[] = [];
  for (let l = 0; l < 9; l++) {
    const pos: number[] = [];
    for (let i = 0; i < 9; i++) {
      const idx = lineType === 'row' ? l * 9 + i : i * 9 + l;
      if (cells[idx]?.value === 0 && cells[idx].notes.includes(digit)) pos.push(idx);
    }
    if (pos.length >= 1 && pos.length <= size + 1) eligible.push({ line: l, positions: pos });
  }
  if (eligible.length < size) return null;

  for (const combo of fishCombinations(eligible, size)) {
    const crossSet = new Set<number>();
    const allPos: number[] = [];
    for (const base of combo) {
      for (const cell of base.positions) {
        crossSet.add(getCross(cell));
        allPos.push(cell);
      }
    }
    if (crossSet.size !== size + 1) continue;

    const crossArr = [...crossSet];
    const lineSet = new Set(combo.map((b) => b.line));

    for (const finCross of crossArr) {
      const mainCrosses = crossArr.filter((c) => c !== finCross);
      const fins: number[] = [];
      const patternCells: number[] = [];
      for (const cell of allPos) {
        if (getCross(cell) === finCross) fins.push(cell);
        else patternCells.push(cell);
      }
      if (fins.length === 0 || fins.length > 2) continue;
      if (!combo.every((base) => base.positions.some((c) => mainCrosses.includes(getCross(c))))) continue;

      // All fins must be in the same base line (standard finned fish constraint)
      const finLines = new Set(fins.map(getLine));
      if (finLines.size !== 1) continue;

      const finBoxes = new Set(fins.map(getBox));
      if (finBoxes.size !== 1) continue;
      const finBox = [...finBoxes][0];

      // All selected cells must be part of this pattern, and selection must be complete
      const allPattern = new Set([...patternCells, ...fins]);
      if (selectedCells.length !== allPattern.size) continue;
      if (!selectedCells.every((c) => allPattern.has(c))) continue;

      const targets: LitCandidate[] = [];
      for (const cross of mainCrosses) {
        for (let l = 0; l < 9; l++) {
          if (lineSet.has(l)) continue;
          const idx = lineType === 'row' ? l * 9 + cross : cross * 9 + l;
          if (!cells[idx] || cells[idx].value !== 0 || !cells[idx].notes.includes(digit)) continue;
          if (getBox(idx) !== finBox) continue;
          targets.push({ cell: idx, digit });
        }
      }

      if (targets.length > 0) {
        return {
          valid: true,
          skillId: META.id,
          skillName: META.name,
          skillSubtitle: META.subtitle,
          sweepDirection: META.sweepDirection,
          digits: [digit],
          sourceCells: selectedCells.slice(),
          targets,
        };
      }
    }
  }
  return null;
}
