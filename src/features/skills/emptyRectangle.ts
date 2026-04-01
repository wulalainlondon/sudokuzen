import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';

const META = { id: 'empty_rectangle', get name() { return t('skills.emptyRectangleName'); }, subtitle: 'Empty Rectangle', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 2) return makeEmptyPreview(META, selectedCells.length < 2 ? '' : t('skills.needSelectN', { n: '2' }));

  // Both must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const notesA = cells[selectedCells[0]].notes;
  const notesB = cells[selectedCells[1]].notes;
  const commonDigits = notesA.filter((d) => notesB.includes(d));

  for (const digit of commonDigits) {
    const result = tryEmptyRectangle(selectedCells, cells, digit);
    if (result) return result;
  }

  return makeEmptyPreview(META, t('skills.noEmptyRectangle'));
}

function getBoxCells(boxIndex: number): number[] {
  const br = Math.floor(boxIndex / 3) * 3;
  const bc = (boxIndex % 3) * 3;
  const out: number[] = [];
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      out.push(r * 9 + c);
    }
  }
  return out;
}

function tryEmptyRectangle(selectedCells: number[], cells: CellData[], digit: number): SkillPreview | null {
  // For each box, check if the digit's candidates form an empty rectangle:
  // all candidates lie in one row AND one column within the box
  for (let box = 0; box < 9; box++) {
    const boxCells = getBoxCells(box);
    const digitCells = boxCells.filter((idx) => {
      const c = cells[idx];
      return c && c.value === 0 && c.notes.includes(digit);
    });
    if (digitCells.length < 2) continue;

    // Check if all digit cells lie in at most 1 row + 1 col intersection
    const rows = new Set(digitCells.map((i) => Math.floor(i / 9)));
    const cols = new Set(digitCells.map((i) => i % 9));

    // Empty rectangle: candidates are NOT all in one row and NOT all in one column
    // They span exactly the intersection of one row and one column within the box
    // (i.e., they don't need to fill the entire cross, but must not extend beyond it)
    if (rows.size < 2 || cols.size < 2) continue; // That would be a locked candidate, not ER

    // The ER intersection point is at (erRow, erCol)
    // We need a conjugate pair in a line outside the box
    // For each row in the box that has digit candidates:
    const boxBr = Math.floor(box / 3) * 3;
    const boxBc = (box % 3) * 3;

    for (const erRow of rows) {
      for (const erCol of cols) {
        // The ER "sees" along erRow and erCol outside the box
        // Find a conjugate pair (exactly 2 candidates) in the same row or column
        // that connects to this ER

        // Try conjugate pair along erCol (outside the box)
        const colPositions: number[] = [];
        for (let r = 0; r < 9; r++) {
          if (r >= boxBr && r < boxBr + 3) continue; // skip the ER box
          const idx = r * 9 + erCol;
          if (cells[idx]?.value === 0 && cells[idx].notes.includes(digit)) {
            colPositions.push(idx);
          }
        }

        if (colPositions.length === 1) {
          // Single candidate in this column outside box — it forms a strong link with ER
          const conjugateCell = colPositions[0];
          const conjRow = Math.floor(conjugateCell / 9);

          // The elimination target: cell at intersection of conjRow and erRow's ER column extension
          // Actually: any cell that sees both the conjugate cell and the ER row extension
          // Elimination: cells in erRow (outside the box) that also see the conjugate cell
          // More precisely: the cell at (conjRow, c) where c is any col with digit in erRow within box
          // Standard ER elimination: cells that are in the same row as conjugateCell AND same column as the ER row candidates
          for (const rc of digitCells) {
            if (Math.floor(rc / 9) !== erRow) continue;
            const rcCol = rc % 9;
            if (rcCol === erCol) continue;
            // Target: cell at (conjRow, rcCol)
            const targetIdx = conjRow * 9 + rcCol;
            if (targetIdx === conjugateCell) continue;
            const targetCell = cells[targetIdx];
            if (!targetCell || targetCell.value !== 0 || !targetCell.notes.includes(digit)) continue;

            const allSource = [...new Set([...digitCells, conjugateCell])];
            if (!selectedCells.every((c) => allSource.includes(c))) continue;

            return {
              valid: true,
              skillId: META.id,
              skillName: META.name,
              skillSubtitle: META.subtitle,
              sweepDirection: META.sweepDirection,
              digits: [digit],
              sourceCells: allSource,
              targets: [{ cell: targetIdx, digit }],
            };
          }
        }

        // Try conjugate pair along erRow (outside the box)
        const rowPositions: number[] = [];
        for (let c = 0; c < 9; c++) {
          if (c >= boxBc && c < boxBc + 3) continue;
          const idx = erRow * 9 + c;
          if (cells[idx]?.value === 0 && cells[idx].notes.includes(digit)) {
            rowPositions.push(idx);
          }
        }

        if (rowPositions.length === 1) {
          const conjugateCell = rowPositions[0];
          const conjCol = conjugateCell % 9;

          for (const rc of digitCells) {
            if (rc % 9 !== erCol) continue;
            const rcRow = Math.floor(rc / 9);
            if (rcRow === erRow) continue;
            const targetIdx = rcRow * 9 + conjCol;
            if (targetIdx === conjugateCell) continue;
            const targetCell = cells[targetIdx];
            if (!targetCell || targetCell.value !== 0 || !targetCell.notes.includes(digit)) continue;

            const allSource = [...new Set([...digitCells, conjugateCell])];
            if (!selectedCells.every((c) => allSource.includes(c))) continue;

            return {
              valid: true,
              skillId: META.id,
              skillName: META.name,
              skillSubtitle: META.subtitle,
              sweepDirection: META.sweepDirection,
              digits: [digit],
              sourceCells: allSource,
              targets: [{ cell: targetIdx, digit }],
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
    reason: removed.length > 0 ? undefined : t('skills.noElimTargets'),
  };
}

export const emptyRectangleSkill: SkillDetector = { ...META, evaluate, execute };
