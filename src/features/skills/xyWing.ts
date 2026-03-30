import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, cellsSeeEachOther, getCommonPeers } from './types';

const META = { id: 'xy_wing', name: '雙翼', subtitle: 'XY-Wing', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 3) return makeEmptyPreview(META, selectedCells.length < 3 ? '' : '需選 3 格');

  // All 3 must be bivalue
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length !== 2) {
      return makeEmptyPreview(META, '三格皆需為雙候選');
    }
  }

  // Try each cell as pivot
  for (let pi = 0; pi < 3; pi++) {
    const pivot = selectedCells[pi];
    const wing1 = selectedCells[(pi + 1) % 3];
    const wing2 = selectedCells[(pi + 2) % 3];

    // Pivot must see both wings
    if (!cellsSeeEachOther(pivot, wing1) || !cellsSeeEachOther(pivot, wing2)) continue;

    const pNotes = [...cells[pivot].notes].sort();
    const w1Notes = [...cells[wing1].notes].sort();
    const w2Notes = [...cells[wing2].notes].sort();

    const [X, Y] = pNotes;

    // wing1 has {X, Z}, wing2 has {Y, Z}
    // Find Z: the digit shared by both wings but not in pivot
    const w1Set = new Set(w1Notes);
    const w2Set = new Set(w2Notes);

    // wing1 must share one digit with pivot, wing2 must share the other
    let Z: number | null = null;

    if (w1Set.has(X) && w2Set.has(Y)) {
      // wing1 = {X, Z}, wing2 = {Y, Z}
      const z1 = w1Notes.find((d) => d !== X);
      const z2 = w2Notes.find((d) => d !== Y);
      if (z1 !== undefined && z2 !== undefined && z1 === z2) Z = z1;
    }
    if (Z === null && w1Set.has(Y) && w2Set.has(X)) {
      // wing1 = {Y, Z}, wing2 = {X, Z}
      const z1 = w1Notes.find((d) => d !== Y);
      const z2 = w2Notes.find((d) => d !== X);
      if (z1 !== undefined && z2 !== undefined && z1 === z2) Z = z1;
    }

    if (Z === null) continue;

    // Eliminate Z from cells that see BOTH wings
    const commonPeers = getCommonPeers([wing1, wing2]);
    const srcSet = new Set(selectedCells);
    const targets: LitCandidate[] = [];
    for (const p of commonPeers) {
      if (srcSet.has(p)) continue;
      const cd = cells[p];
      if (cd && cd.value === 0 && cd.notes.includes(Z)) {
        targets.push({ cell: p, digit: Z });
      }
    }

    if (targets.length > 0) {
      return {
        valid: true,
        skillId: META.id,
        skillName: META.name,
        skillSubtitle: META.subtitle,
        sweepDirection: META.sweepDirection,
        digits: [X, Y, Z],
        sourceCells: [pivot, wing1, wing2],
        targets,
      };
    }
  }

  return makeEmptyPreview(META, '未構成雙翼');
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

export const xyWingSkill: SkillDetector = { ...META, evaluate, execute };
