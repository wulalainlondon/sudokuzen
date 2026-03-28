import type { CellData } from '../../game/state';

export type LitCandidate = { cell: number; digit: number };

export type LockedSkillPreview = {
  valid: boolean;
  reason?: string;
  digit?: number;
  lineType?: 'row' | 'col';
  lineIndex?: number;
  sourcePair: [number, number] | null;
  targets: LitCandidate[];
};

function parseLitSet(litCandidates: Set<string>, cellsData: CellData[]): LitCandidate[] {
  const parsed: LitCandidate[] = [];
  for (const key of litCandidates) {
    const [cellRaw, digitRaw] = key.split(':');
    const cell = Number(cellRaw);
    const digit = Number(digitRaw);
    if (!Number.isInteger(cell) || !Number.isInteger(digit)) continue;
    if (cell < 0 || cell >= 81 || digit < 1 || digit > 9) continue;
    const data = cellsData[cell];
    if (!data || data.value !== 0) continue;
    if (!data.notes.includes(digit)) continue;
    parsed.push({ cell, digit });
  }
  return parsed;
}

function sameBox(a: number, b: number): boolean {
  const ar = Math.floor(a / 9);
  const ac = a % 9;
  const br = Math.floor(b / 9);
  const bc = b % 9;
  return Math.floor(ar / 3) === Math.floor(br / 3) && Math.floor(ac / 3) === Math.floor(bc / 3);
}

function candidateTargetsForLine(
  cellsData: CellData[],
  lineType: 'row' | 'col',
  lineIndex: number,
  sourceA: number,
  sourceB: number,
  digit: number,
): LitCandidate[] {
  const sourceSet = new Set([sourceA, sourceB]);
  const targets: LitCandidate[] = [];
  for (let i = 0; i < 9; i++) {
    const idx = lineType === 'row' ? lineIndex * 9 + i : i * 9 + lineIndex;
    if (sourceSet.has(idx)) continue;
    const inSameBoxAsSourceA = sameBox(idx, sourceA);
    const inSameBoxAsSourceB = sameBox(idx, sourceB);
    if (inSameBoxAsSourceA || inSameBoxAsSourceB) continue;
    const data = cellsData[idx];
    if (!data || data.value !== 0) continue;
    if (data.notes.includes(digit)) targets.push({ cell: idx, digit });
  }
  return targets;
}

export function evaluateLockedCandidatesSkill(litCandidates: Set<string>, cellsData: CellData[]): LockedSkillPreview {
  const selected = parseLitSet(litCandidates, cellsData);
  if (selected.length < 2) {
    return { valid: false, reason: '請先點亮同宮內兩個相同候選', sourcePair: null, targets: [] };
  }

  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i];
      const b = selected[j];
      if (a.digit !== b.digit) continue;
      if (!sameBox(a.cell, b.cell)) continue;

      const rowA = Math.floor(a.cell / 9);
      const rowB = Math.floor(b.cell / 9);
      const colA = a.cell % 9;
      const colB = b.cell % 9;

      if (rowA === rowB) {
        const targets = candidateTargetsForLine(cellsData, 'row', rowA, a.cell, b.cell, a.digit);
        if (targets.length > 0) {
          return {
            valid: true,
            digit: a.digit,
            lineType: 'row',
            lineIndex: rowA,
            sourcePair: [a.cell, b.cell],
            targets,
          };
        }
      }

      if (colA === colB) {
        const targets = candidateTargetsForLine(cellsData, 'col', colA, a.cell, b.cell, a.digit);
        if (targets.length > 0) {
          return {
            valid: true,
            digit: a.digit,
            lineType: 'col',
            lineIndex: colA,
            sourcePair: [a.cell, b.cell],
            targets,
          };
        }
      }
    }
  }

  return {
    valid: false,
    reason: '條件未成立：需同宮同列或同宮同欄，且線上有可消去候選',
    sourcePair: null,
    targets: [],
  };
}

export function executeLockedCandidatesSkill(cellsData: CellData[], preview: LockedSkillPreview): LockedSkillPreview {
  if (!preview.valid || !preview.targets.length) return { ...preview, valid: false };

  const removed: LitCandidate[] = [];
  for (const t of preview.targets) {
    const data = cellsData[t.cell];
    if (!data || data.value !== 0) continue;
    const idx = data.notes.indexOf(t.digit);
    if (idx < 0) continue;
    data.notes.splice(idx, 1);
    removed.push(t);
  }

  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : '沒有可消去候選',
  };
}
