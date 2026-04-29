// Exocet (天劫): a base pair of cells sharing 2 candidates, linked to target cells.
// Basic Exocet rule: base cells B1, B2 in same box with shared candidates {d1,d2}.
// Target cells T1, T2 in same columns as B1, B2 (or rows) must collectively hold d1 and d2.
// Elimination: d1, d2 can be eliminated from non-target cells in the target rows/cols,
// and also from other cells in the base box outside {B1,B2,T1,T2}.

import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';

const META = {
  id: 'exocet_death_blossom',
  get name() {
    return t('skills.exocetName');
  },
  subtitle: 'Exocet',
  sweepDirection: 'outward' as const,
};

function getRow(idx: number): number {
  return Math.floor(idx / 9);
}
function getCol(idx: number): number {
  return idx % 9;
}
function getBox(idx: number): number {
  return Math.floor(getRow(idx) / 3) * 3 + Math.floor(getCol(idx) / 3);
}
function getBoxCells(b: number): number[] {
  const br = Math.floor(b / 3) * 3,
    bc = (b % 3) * 3;
  const cells: number[] = [];
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) cells.push(r * 9 + c);
  return cells;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 4) return makeEmptyPreview(META, '');
  if (selectedCells.length > 8) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '4', max: '8' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const n = selectedCells.length;

  // Try all pairs from selectedCells as base cells
  for (let bi1 = 0; bi1 < n; bi1++) {
    for (let bi2 = bi1 + 1; bi2 < n; bi2++) {
      const b1 = selectedCells[bi1];
      const b2 = selectedCells[bi2];

      // Base cells must be in the same box
      if (getBox(b1) !== getBox(b2)) continue;
      const baseBox = getBox(b1);

      // Find shared candidates between base cells
      const sharedDigits = cells[b1].notes.filter((d) => cells[b2].notes.includes(d));
      if (sharedDigits.length < 2) continue;

      // Try all pairs of remaining cells as target cells
      const others = selectedCells.filter((_, i) => i !== bi1 && i !== bi2);
      const m = others.length;
      for (let ti1 = 0; ti1 < m; ti1++) {
        for (let ti2 = ti1 + 1; ti2 < m; ti2++) {
          const t1 = others[ti1];
          const t2 = others[ti2];

          // Targets must be in DIFFERENT rows/cols from the base cells
          const baseRow1 = getRow(b1),
            baseRow2 = getRow(b2);
          const baseCol1 = getCol(b1),
            baseCol2 = getCol(b2);
          const t1Row = getRow(t1),
            t2Row = getRow(t2);
          const t1Col = getCol(t1),
            t2Col = getCol(t2);

          // Classical Exocet: T1 in same col as B1, T2 in same col as B2 (or swapped)
          // Targets must be OUTSIDE the base band (different group of 3 rows from base)
          const baseBand = Math.floor(baseRow1 / 3);
          let validPair = false;
          if (
            t1Col === baseCol1 &&
            t2Col === baseCol2 &&
            Math.floor(t1Row / 3) !== baseBand &&
            Math.floor(t2Row / 3) !== baseBand
          ) {
            validPair = true;
          } else if (
            t1Col === baseCol2 &&
            t2Col === baseCol1 &&
            Math.floor(t1Row / 3) !== baseBand &&
            Math.floor(t2Row / 3) !== baseBand
          ) {
            validPair = true;
          }
          if (!validPair) continue;

          // Targets must be in different boxes
          if (getBox(t1) === getBox(t2)) continue;

          // Check that T1 and T2 have the base candidates
          const t1DigitsOK = sharedDigits.some((d) => cells[t1].notes.includes(d));
          const t2DigitsOK = sharedDigits.some((d) => cells[t2].notes.includes(d));
          if (!t1DigitsOK || !t2DigitsOK) continue;

          // Exocet eliminations (simplified Basic Exocet):
          // 1. Eliminate base candidates from other cells in base box (not B1, B2)
          // 2. Eliminate base candidates from cells in T1's and T2's rows/cols
          //    except T1 and T2 themselves
          const coreSet = new Set([b1, b2, t1, t2]);
          const targets: LitCandidate[] = [];

          // Box eliminations (non-base cells in base box lose base candidates)
          for (const c of getBoxCells(baseBox)) {
            if (coreSet.has(c)) continue;
            if (!cells[c] || cells[c].value !== 0) continue;
            for (const d of sharedDigits) {
              if (cells[c].notes.includes(d)) targets.push({ cell: c, digit: d });
            }
          }

          // Row eliminations: only valid when T1 and T2 share the same row
          // (base candidates must split between T1 and T2 in that row)
          if (t1Row === t2Row) {
            for (let c2 = 0; c2 < 9; c2++) {
              const idx = t1Row * 9 + c2;
              if (coreSet.has(idx)) continue;
              if (!cells[idx] || cells[idx].value !== 0) continue;
              for (const d of sharedDigits) {
                if (cells[idx].notes.includes(d)) targets.push({ cell: idx, digit: d });
              }
            }
          }

          const seen = new Set<string>();
          const deduped = targets.filter(({ cell, digit }) => {
            const k = `${cell}-${digit}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          if (deduped.length > 0) {
            return {
              valid: true,
              skillId: META.id,
              skillName: META.name,
              skillSubtitle: META.subtitle,
              sweepDirection: META.sweepDirection,
              sourceCells: [b1, b2, t1, t2],
              targets: deduped,
            };
          }
        }
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noExocet'));
}

function execute(cells: CellData[], preview: SkillPreview): SkillPreview {
  if (!preview.valid) return { ...preview, valid: false };
  const removed: LitCandidate[] = [];
  for (const tgt of preview.targets) {
    const d = cells[tgt.cell];
    if (!d || d.value !== 0) continue;
    const idx = d.notes.indexOf(tgt.digit);
    if (idx < 0) continue;
    d.notes.splice(idx, 1);
    removed.push(tgt);
  }
  return {
    ...preview,
    targets: removed,
    valid: removed.length > 0,
    reason: removed.length > 0 ? undefined : t('skills.noElimTargets'),
  };
}

export const exocetSkill: SkillDetector = { ...META, evaluate, execute };
