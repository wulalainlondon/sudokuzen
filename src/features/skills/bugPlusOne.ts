import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview } from './types';

const META = { id: 'bug_plus_one', name: '孤蟲', subtitle: 'BUG+1', sweepDirection: 'inward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 1) return makeEmptyPreview(META, selectedCells.length < 1 ? '' : '需選 1 格');

  const targetIdx = selectedCells[0];
  const targetCell = cells[targetIdx];
  if (!targetCell || targetCell.value !== 0 || targetCell.notes.length !== 3) {
    return makeEmptyPreview(META, '所選格需有 3 個候選');
  }

  // BUG+1 condition: every other unsolved cell has exactly 2 candidates
  let bugValid = true;
  for (let i = 0; i < 81; i++) {
    if (i === targetIdx) continue;
    const c = cells[i];
    if (c.value !== 0 && c.notes.length !== 2) {
      // Cell is unsolved but doesn't have exactly 2 candidates
      if (c.value === 0 && c.notes.length !== 2) {
        bugValid = false;
        break;
      }
    }
    if (c.value === 0 && c.notes.length !== 2) {
      bugValid = false;
      break;
    }
  }

  if (!bugValid) {
    return makeEmptyPreview(META, '未構成孤蟲（需其他格皆為雙候選）');
  }

  // Find the unique digit: the digit that appears an odd number of times
  // in its row, column, or box. In a BUG state, the extra candidate in the
  // 3-candidate cell is the one that appears 3 times in some unit.
  // Simpler: for each candidate in the target cell, check if removing it
  // would leave every unit with each digit appearing exactly 2 times.
  // The digit that must stay is the BUG+1 solution.

  const [d1, d2, d3] = targetCell.notes;

  // Count occurrences of each candidate digit in the target cell's row, col, box
  const row = Math.floor(targetIdx / 9);
  const col = targetIdx % 9;
  const boxR = Math.floor(row / 3) * 3;
  const boxC = Math.floor(col / 3) * 3;

  function countDigitInUnit(digit: number, unitCells: number[]): number {
    let count = 0;
    for (const idx of unitCells) {
      const c = cells[idx];
      if (c.value === 0 && c.notes.includes(digit)) count++;
    }
    return count;
  }

  const rowCells: number[] = [];
  for (let c = 0; c < 9; c++) rowCells.push(row * 9 + c);
  const colCells: number[] = [];
  for (let r = 0; r < 9; r++) colCells.push(r * 9 + col);
  const boxCells: number[] = [];
  for (let r = boxR; r < boxR + 3; r++) {
    for (let c = boxC; c < boxC + 3; c++) boxCells.push(r * 9 + c);
  }

  // The BUG+1 digit is the one that appears an odd number of times in a unit
  let bugDigit: number | null = null;
  for (const digit of targetCell.notes) {
    const rc = countDigitInUnit(digit, rowCells);
    const cc = countDigitInUnit(digit, colCells);
    const bc = countDigitInUnit(digit, boxCells);
    // In a BUG, each digit appears exactly 2 times in each unit.
    // The extra digit in our cell makes it 3 in at least one unit.
    if (rc % 2 === 1 || cc % 2 === 1 || bc % 2 === 1) {
      bugDigit = digit;
      break;
    }
  }

  if (bugDigit === null) {
    return makeEmptyPreview(META, '未構成孤蟲');
  }

  // Targets: eliminate the other 2 candidates from the target cell
  const targets: LitCandidate[] = targetCell.notes
    .filter(d => d !== bugDigit)
    .map(d => ({ cell: targetIdx, digit: d }));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    digits: [bugDigit],
    sourceCells: [targetIdx],
    targets,
  };
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

export const bugPlusOneSkill: SkillDetector = { ...META, evaluate, execute };
