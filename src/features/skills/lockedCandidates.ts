import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview } from './types';

const META = {
  id: 'locked_candidates',
  name: '封鎖',
  subtitle: 'Locked Candidates',
  sweepDirection: 'outward' as const,
};

function sameBox(a: number, b: number): boolean {
  return (
    Math.floor(Math.floor(a / 9) / 3) === Math.floor(Math.floor(b / 9) / 3) &&
    Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3)
  );
}

function getBoxCellsWithDigit(cells: CellData[], boxIndex: number, digit: number): number[] {
  const br = Math.floor(boxIndex / 3) * 3;
  const bc = (boxIndex % 3) * 3;
  const out: number[] = [];
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      const idx = r * 9 + c;
      const d = cells[idx];
      if (d && d.value === 0 && d.notes.includes(digit)) out.push(idx);
    }
  }
  return out;
}

function findTargets(
  cells: CellData[],
  lineType: 'row' | 'col',
  lineIndex: number,
  srcA: number,
  srcB: number,
  digit: number,
): LitCandidate[] {
  const srcSet = new Set([srcA, srcB]);
  const targets: LitCandidate[] = [];
  for (let i = 0; i < 9; i++) {
    const idx = lineType === 'row' ? lineIndex * 9 + i : i * 9 + lineIndex;
    if (srcSet.has(idx)) continue;
    if (sameBox(idx, srcA) || sameBox(idx, srcB)) continue;
    const d = cells[idx];
    if (d && d.value === 0 && d.notes.includes(digit)) targets.push({ cell: idx, digit });
  }
  return targets;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');

  // Try all pairs of selected cells
  for (let i = 0; i < selectedCells.length; i++) {
    for (let j = i + 1; j < selectedCells.length; j++) {
      const a = selectedCells[i],
        b = selectedCells[j];
      if (!sameBox(a, b)) continue;

      const notesA = cells[a]?.value === 0 ? cells[a].notes : [];
      const notesB = cells[b]?.value === 0 ? cells[b].notes : [];
      const common = notesA.filter((d) => notesB.includes(d));

      const rowA = Math.floor(a / 9),
        rowB = Math.floor(b / 9);
      const colA = a % 9,
        colB = b % 9;
      const boxIndex = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);

      for (const digit of common) {
        const boxCellsWithDigit = getBoxCellsWithDigit(cells, boxIndex, digit);
        if (boxCellsWithDigit.length < 2) continue;

        if (rowA === rowB) {
          // Locked candidates (pointing): in this box, all candidate "digit" cells
          // must lie on the same row before row eliminations are legal.
          if (!boxCellsWithDigit.every((idx) => Math.floor(idx / 9) === rowA)) continue;
          const targets = findTargets(cells, 'row', rowA, a, b, digit);
          if (targets.length > 0) {
            return {
              valid: true,
              skillId: META.id,
              skillName: META.name,
              skillSubtitle: META.subtitle,
              sweepDirection: META.sweepDirection,
              digits: [digit],
              unitLabel: `第 ${rowA + 1} 列`,
              sourceCells: [a, b],
              targets,
            };
          }
        }
        if (colA === colB) {
          // Locked candidates (pointing): in this box, all candidate "digit" cells
          // must lie on the same column before column eliminations are legal.
          if (!boxCellsWithDigit.every((idx) => idx % 9 === colA)) continue;
          const targets = findTargets(cells, 'col', colA, a, b, digit);
          if (targets.length > 0) {
            return {
              valid: true,
              skillId: META.id,
              skillName: META.name,
              skillSubtitle: META.subtitle,
              sweepDirection: META.sweepDirection,
              digits: [digit],
              unitLabel: `第 ${colA + 1} 欄`,
              sourceCells: [a, b],
              targets,
            };
          }
        }
      }
    }
  }
  return makeEmptyPreview(META, selectedCells.length >= 2 ? '未構成封鎖脈衝' : '');
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

export const lockedCandidatesSkill: SkillDetector = { ...META, evaluate, execute };
