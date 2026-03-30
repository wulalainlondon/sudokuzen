import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, cellsSeeEachOther } from './types';

const META = { id: 'skyscraper', name: '天望', subtitle: 'Skyscraper', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 2) return makeEmptyPreview(META, selectedCells.length < 2 ? '' : '需選 2 格');

  // Both must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, '所選格需為空且含候選');
    }
  }

  // Find common candidate digits
  const notesA = cells[selectedCells[0]].notes;
  const notesB = cells[selectedCells[1]].notes;
  const commonDigits = notesA.filter(d => notesB.includes(d));

  for (const digit of commonDigits) {
    // Try row-based skyscraper: find two rows each with exactly 2 positions for this digit
    // where the selected cells are part of these rows
    const result = trySkyscraper(selectedCells, cells, digit, 'row');
    if (result) return result;

    // Try column-based skyscraper
    const result2 = trySkyscraper(selectedCells, cells, digit, 'col');
    if (result2) return result2;
  }

  return makeEmptyPreview(META, '未構成天望');
}

function trySkyscraper(
  selectedCells: number[],
  cells: CellData[],
  digit: number,
  lineType: 'row' | 'col',
): SkillPreview | null {
  // Find all lines with exactly 2 candidates for this digit
  const lines: { line: number; pos: [number, number] }[] = [];
  for (let l = 0; l < 9; l++) {
    const positions: number[] = [];
    for (let i = 0; i < 9; i++) {
      const idx = lineType === 'row' ? l * 9 + i : i * 9 + l;
      const cell = cells[idx];
      if (cell && cell.value === 0 && cell.notes.includes(digit)) {
        positions.push(idx);
      }
    }
    if (positions.length === 2) {
      lines.push({ line: l, pos: [positions[0], positions[1]] });
    }
  }

  // Try all pairs of such lines
  const selSet = new Set(selectedCells);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i], l2 = lines[j];
      const allFour = [l1.pos[0], l1.pos[1], l2.pos[0], l2.pos[1]];

      // Check if selected cells are part of this pattern
      if (!selectedCells.every(c => allFour.includes(c))) continue;

      // Find the "base" — one end from each line that shares the same cross-line
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          const base1 = l1.pos[a], base2 = l2.pos[b];
          const roof1 = l1.pos[1 - a], roof2 = l2.pos[1 - b];

          // Base cells must share the same cross-line (col if row-based, row if col-based)
          const crossBase1 = lineType === 'row' ? base1 % 9 : Math.floor(base1 / 9);
          const crossBase2 = lineType === 'row' ? base2 % 9 : Math.floor(base2 / 9);
          if (crossBase1 !== crossBase2) continue;

          // Roof cells must NOT share the same cross-line (otherwise it's an X-Wing)
          const crossRoof1 = lineType === 'row' ? roof1 % 9 : Math.floor(roof1 / 9);
          const crossRoof2 = lineType === 'row' ? roof2 % 9 : Math.floor(roof2 / 9);
          if (crossRoof1 === crossRoof2) continue;

          // Eliminate digit from cells that see BOTH roof cells
          const targets: LitCandidate[] = [];
          const srcSet = new Set(allFour);
          for (let idx = 0; idx < 81; idx++) {
            if (srcSet.has(idx)) continue;
            const cell = cells[idx];
            if (!cell || cell.value !== 0 || !cell.notes.includes(digit)) continue;
            if (cellsSeeEachOther(idx, roof1) && cellsSeeEachOther(idx, roof2)) {
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
              sourceCells: allFour,
              targets,
            };
          }
        }
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
  return { ...preview, targets: removed, valid: removed.length > 0, reason: removed.length > 0 ? undefined : '沒有可消去候選' };
}

export const skyscraperSkill: SkillDetector = { ...META, evaluate, execute };
