import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';

const META = {
  id: 'finned_x_wing',
  get name() {
    return t('skills.finnedXWingName');
  },
  subtitle: 'Finned X-Wing',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  // Finned X-Wing needs at least 4 cells (the 4 X-Wing corners), possibly 5 with the fin
  if (selectedCells.length < 4) return makeEmptyPreview(META, selectedCells.length < 4 ? '' : '');
  if (selectedCells.length > 5) return makeEmptyPreview(META, t('skills.needSelect4to5'));

  // All must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  // Find common digits across all selected cells
  const firstNotes = cells[selectedCells[0]].notes;
  const commonDigits = firstNotes.filter((d) => selectedCells.every((idx) => cells[idx].notes.includes(d)));

  for (const digit of commonDigits) {
    // Try row-based finned X-Wing
    const result = tryFinnedFish(selectedCells, cells, digit, 'row');
    if (result) return result;

    // Try col-based
    const result2 = tryFinnedFish(selectedCells, cells, digit, 'col');
    if (result2) return result2;
  }

  return makeEmptyPreview(META, t('skills.noFinnedXWing'));
}

function tryFinnedFish(
  selectedCells: number[],
  cells: CellData[],
  digit: number,
  lineType: 'row' | 'col',
): SkillPreview | null {
  // Find lines with 2 or 3 candidates for this digit
  const lines: { line: number; positions: number[] }[] = [];
  for (let l = 0; l < 9; l++) {
    const positions: number[] = [];
    for (let i = 0; i < 9; i++) {
      const idx = lineType === 'row' ? l * 9 + i : i * 9 + l;
      if (cells[idx]?.value === 0 && cells[idx].notes.includes(digit)) {
        positions.push(idx);
      }
    }
    if (positions.length >= 2 && positions.length <= 3) {
      lines.push({ line: l, positions });
    }
  }

  // Try all pairs of lines
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i],
        l2 = lines[j];

      // One line should have exactly 2 (the "clean" line), the other 2 or 3
      // The line with 3 has the fin
      let cleanLine: typeof l1, finnedLine: typeof l1;

      if (l1.positions.length === 2 && l2.positions.length === 3) {
        cleanLine = l1;
        finnedLine = l2;
      } else if (l2.positions.length === 2 && l1.positions.length === 3) {
        cleanLine = l2;
        finnedLine = l1;
      } else if (l1.positions.length === 2 && l2.positions.length === 2) {
        // Could still be finned if selected cells include an extra cell
        // Skip for now — standard X-Wing handles this
        continue;
      } else {
        continue;
      }

      // The clean line's 2 cross-positions define the X-Wing columns
      const getCross = (idx: number) => (lineType === 'row' ? idx % 9 : Math.floor(idx / 9));
      const xwingCrosses = cleanLine.positions.map(getCross);

      // The finned line must have 2 of its positions matching these crosses
      const finnedMatching = finnedLine.positions.filter((idx) => xwingCrosses.includes(getCross(idx)));
      const finnedExtra = finnedLine.positions.filter((idx) => !xwingCrosses.includes(getCross(idx)));

      if (finnedMatching.length !== 2 || finnedExtra.length !== 1) continue;

      const fin = finnedExtra[0];
      const finBox = Math.floor(Math.floor(fin / 9) / 3) * 3 + Math.floor((fin % 9) / 3);

      // All selected cells must be part of this pattern
      const allPattern = [...cleanLine.positions, ...finnedLine.positions];
      if (!selectedCells.every((c) => allPattern.includes(c))) continue;

      // Eliminations: in the X-Wing cross-lines (the columns for row-based),
      // outside the defining lines, but ONLY cells that also see the fin (same box as fin)
      const targets: LitCandidate[] = [];
      const srcSet = new Set(allPattern);

      for (const cross of xwingCrosses) {
        for (let l = 0; l < 9; l++) {
          if (l === cleanLine.line || l === finnedLine.line) continue;
          const idx = lineType === 'row' ? l * 9 + cross : cross * 9 + l;
          if (srcSet.has(idx)) continue;
          const cell = cells[idx];
          if (!cell || cell.value !== 0 || !cell.notes.includes(digit)) continue;

          // Must see the fin (be in the same box)
          const cellBox = Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3);
          if (cellBox === finBox) {
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
          sourceCells: allPattern,
          targets,
        };
      }
    }
  }

  return null;
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

export const finnedXWingSkill: SkillDetector = { ...META, evaluate, execute };
