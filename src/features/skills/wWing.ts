import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { makeEmptyPreview, cellsSeeEachOther, getCommonPeers, getUnitCells } from './types';

const META = { id: 'w_wing', name: '鏡花', subtitle: 'W-Wing', sweepDirection: 'outward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 2) return makeEmptyPreview(META, selectedCells.length < 2 ? '' : '需選 2 格');

  const [a, b] = selectedCells;
  const dA = cells[a], dB = cells[b];
  if (!dA || dA.value !== 0 || !dB || dB.value !== 0) return makeEmptyPreview(META, '所選格需為空');
  if (dA.notes.length !== 2 || dB.notes.length !== 2) return makeEmptyPreview(META, '兩格需為雙候選');

  // Same bivalue pair
  const sA = [...dA.notes].sort(), sB = [...dB.notes].sort();
  if (sA[0] !== sB[0] || sA[1] !== sB[1]) return makeEmptyPreview(META, '兩格需相同雙候選');

  // Must NOT see each other directly (otherwise it's a naked pair)
  if (cellsSeeEachOther(a, b)) return makeEmptyPreview(META, 'W-Wing 兩端不可互見');

  const [digitA, digitB] = sA;

  // Try each digit as the "linking" digit
  for (const linkDigit of [digitA, digitB]) {
    const elimDigit = linkDigit === digitA ? digitB : digitA;

    // Search for a strong link (conjugate pair) for linkDigit that connects a and b.
    // The strong link is a unit where linkDigit appears exactly twice,
    // and one of those cells sees a, the other sees b.
    const allUnits: { unitType: 'row' | 'col' | 'box'; unitIndex: number }[] = [];
    for (let i = 0; i < 9; i++) {
      allUnits.push({ unitType: 'row', unitIndex: i });
      allUnits.push({ unitType: 'col', unitIndex: i });
      allUnits.push({ unitType: 'box', unitIndex: i });
    }

    for (const { unitType, unitIndex } of allUnits) {
      const unitCells = getUnitCells(unitType, unitIndex);
      // Find cells in this unit that have linkDigit as candidate
      const withDigit = unitCells.filter(idx => {
        if (idx === a || idx === b) return false;
        const cd = cells[idx];
        return cd && cd.value === 0 && cd.notes.includes(linkDigit);
      });

      // Strong link: exactly 2 cells with this digit in the unit
      if (withDigit.length !== 2) continue;

      const [s1, s2] = withDigit;

      // One must see a, the other must see b (or vice versa)
      const s1SeesA = cellsSeeEachOther(s1, a);
      const s1SeesB = cellsSeeEachOther(s1, b);
      const s2SeesA = cellsSeeEachOther(s2, a);
      const s2SeesB = cellsSeeEachOther(s2, b);

      if ((s1SeesA && s2SeesB) || (s1SeesB && s2SeesA)) {
        // Valid W-Wing found! Eliminate elimDigit from cells that see BOTH endpoints
        const commonPeers = getCommonPeers([a, b]);
        const srcSet = new Set([a, b, s1, s2]);
        const targets: LitCandidate[] = [];
        for (const p of commonPeers) {
          if (srcSet.has(p)) continue;
          const cd = cells[p];
          if (cd && cd.value === 0 && cd.notes.includes(elimDigit)) {
            targets.push({ cell: p, digit: elimDigit });
          }
        }

        if (targets.length > 0) {
          return {
            valid: true,
            skillId: META.id,
            skillName: META.name,
            skillSubtitle: META.subtitle,
            sweepDirection: META.sweepDirection,
            digits: sA,
            sourceCells: [a, b],
            targets,
          };
        }
      }
    }
  }

  return makeEmptyPreview(META, '未找到連接強鏈');
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

export const wWingSkill: SkillDetector = { ...META, evaluate, execute };
