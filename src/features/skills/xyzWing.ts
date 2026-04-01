import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther, getCommonPeers } from './types';

const META = { id: 'xyz_wing', get name() { return t('skills.xyzWingName'); }, subtitle: 'XYZ-Wing', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 3) return makeEmptyPreview(META, selectedCells.length < 3 ? '' : t('skills.needSelectN', { n: '3' }));

  // Try each cell as pivot (the one with 3 candidates)
  for (let pi = 0; pi < 3; pi++) {
    const pivot = selectedCells[pi];
    const wing1 = selectedCells[(pi + 1) % 3];
    const wing2 = selectedCells[(pi + 2) % 3];

    const pData = cells[pivot];
    const w1Data = cells[wing1];
    const w2Data = cells[wing2];
    if (!pData || pData.value !== 0 || !w1Data || w1Data.value !== 0 || !w2Data || w2Data.value !== 0) continue;

    // Pivot has 3 candidates, wings have 2 each
    if (pData.notes.length !== 3 || w1Data.notes.length !== 2 || w2Data.notes.length !== 2) continue;

    // Pivot must see both wings
    if (!cellsSeeEachOther(pivot, wing1) || !cellsSeeEachOther(pivot, wing2)) continue;

    const pNotes = [...pData.notes].sort();
    const w1Notes = [...w1Data.notes].sort();
    const w2Notes = [...w2Data.notes].sort();

    // Wings must be subsets of pivot
    if (!w1Notes.every((d) => pNotes.includes(d))) continue;
    if (!w2Notes.every((d) => pNotes.includes(d))) continue;

    // Z is the common digit in all 3 cells
    const Z = pNotes.find((d) => w1Notes.includes(d) && w2Notes.includes(d));
    if (Z === undefined) continue;

    // Wings must be different pairs (otherwise it's a naked pair, not XYZ-Wing)
    if (w1Notes[0] === w2Notes[0] && w1Notes[1] === w2Notes[1]) continue;

    // Eliminate Z from cells that see ALL 3 cells
    const commonPeers = getCommonPeers([pivot, wing1, wing2]);
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
        digits: pNotes,
        sourceCells: [pivot, wing1, wing2],
        targets,
      };
    }
  }

  return makeEmptyPreview(META, t('skills.noXYZWing'));
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

export const xyzWingSkill: SkillDetector = { ...META, evaluate, execute };
