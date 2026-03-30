// Shared fish-pattern evaluator for X-Wing, Swordfish, Jellyfish.

import type { CellData } from '../../game/state';
import type { SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview } from './types';

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
      return makeEmptyPreview(META, '所選格需為空且含候選');
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
    return makeEmptyPreview(META, `需選跨 ${size} 列 ${size} 欄`);
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

  return makeEmptyPreview(META, `未構成${META.name}`);
}
