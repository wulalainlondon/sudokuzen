import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, cellsSeeEachOther } from './types';

const META = { id: 'two_string_kite', name: '雙弦', subtitle: 'Two-String Kite', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 2) return makeEmptyPreview(META, selectedCells.length < 2 ? '' : '需選 2 格');

  // Both must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, '所選格需為空且含候選');
    }
  }

  const notesA = cells[selectedCells[0]].notes;
  const notesB = cells[selectedCells[1]].notes;
  const commonDigits = notesA.filter((d) => notesB.includes(d));

  for (const digit of commonDigits) {
    const result = tryTwoStringKite(selectedCells, cells, digit);
    if (result) return result;
  }

  return makeEmptyPreview(META, '未構成雙弦');
}

function tryTwoStringKite(selectedCells: number[], cells: CellData[], digit: number): SkillPreview | null {
  // Find all rows and cols with exactly 2 candidates for this digit
  const rowPairs: { line: number; pos: [number, number] }[] = [];
  const colPairs: { line: number; pos: [number, number] }[] = [];

  for (let l = 0; l < 9; l++) {
    const rowPositions: number[] = [];
    const colPositions: number[] = [];
    for (let i = 0; i < 9; i++) {
      const rIdx = l * 9 + i;
      if (cells[rIdx]?.value === 0 && cells[rIdx].notes.includes(digit)) rowPositions.push(rIdx);
      const cIdx = i * 9 + l;
      if (cells[cIdx]?.value === 0 && cells[cIdx].notes.includes(digit)) colPositions.push(cIdx);
    }
    if (rowPositions.length === 2) rowPairs.push({ line: l, pos: [rowPositions[0], rowPositions[1]] });
    if (colPositions.length === 2) colPairs.push({ line: l, pos: [colPositions[0], colPositions[1]] });
  }

  // Two-string kite: one row-pair + one col-pair, with one cell from each sharing a box
  for (const rp of rowPairs) {
    for (const cp of colPairs) {
      // Try all 4 combinations of which endpoint from each pair shares a box
      for (let ri = 0; ri < 2; ri++) {
        for (let ci = 0; ci < 2; ci++) {
          const rShared = rp.pos[ri];
          const cShared = cp.pos[ci];
          const rEnd = rp.pos[1 - ri];
          const cEnd = cp.pos[1 - ci];

          // The shared cells must be in the same box
          const boxR = Math.floor(Math.floor(rShared / 9) / 3) * 3 + Math.floor((rShared % 9) / 3);
          const boxC = Math.floor(Math.floor(cShared / 9) / 3) * 3 + Math.floor((cShared % 9) / 3);
          if (boxR !== boxC) continue;

          // rShared and cShared must be different cells
          if (rShared === cShared) continue;

          const allFour = [rp.pos[0], rp.pos[1], cp.pos[0], cp.pos[1]];
          const uniqueFour = [...new Set(allFour)];
          if (uniqueFour.length < 4) continue;

          // Check if selected cells are part of this pattern
          if (!selectedCells.every((c) => uniqueFour.includes(c))) continue;

          // Eliminate: cells that see BOTH rEnd and cEnd (the non-shared endpoints)
          const targets: LitCandidate[] = [];
          const srcSet = new Set(uniqueFour);
          for (let idx = 0; idx < 81; idx++) {
            if (srcSet.has(idx)) continue;
            const cell = cells[idx];
            if (!cell || cell.value !== 0 || !cell.notes.includes(digit)) continue;
            if (cellsSeeEachOther(idx, rEnd) && cellsSeeEachOther(idx, cEnd)) {
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
              sourceCells: uniqueFour,
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
  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : '沒有可消去候選',
  };
}

export const twoStringKiteSkill: SkillDetector = { ...META, evaluate, execute };
