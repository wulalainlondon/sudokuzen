import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';

const META = { id: 'unique_rectangle', get name() { return t('skills.uniqueRectangleName'); }, subtitle: 'Unique Rectangle', sweepDirection: 'inward' as const };

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length !== 4) return makeEmptyPreview(META, selectedCells.length < 4 ? '' : t('skills.needSelectN', { n: '4' }));

  // All must be empty with candidates
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length < 2) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmptyWith2'));
    }
  }

  // Must form a rectangle: exactly 2 rows and 2 cols
  const rows = new Set(selectedCells.map((i) => Math.floor(i / 9)));
  const cols = new Set(selectedCells.map((i) => i % 9));
  if (rows.size !== 2 || cols.size !== 2) return makeEmptyPreview(META, t('skills.needRectangle'));

  // Must span exactly 2 boxes
  const boxes = new Set(
    selectedCells.map((i) => {
      const r = Math.floor(i / 9),
        c = i % 9;
      return Math.floor(r / 3) * 3 + Math.floor(c / 3);
    }),
  );
  if (boxes.size !== 2) return makeEmptyPreview(META, t('skills.needSpan2Boxes'));

  // UR Type 1: find 2 floor cells with exactly {A,B} and 2 roof cells with {A,B} + extras
  // Try all pairs as floor
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const floorCells = [selectedCells[i], selectedCells[j]];
      const roofCells = selectedCells.filter((_, k) => k !== i && k !== j);

      const f0 = cells[floorCells[0]],
        f1 = cells[floorCells[1]];

      // Floor cells must have exactly 2 candidates and same pair
      if (f0.notes.length !== 2 || f1.notes.length !== 2) continue;
      const sf0 = [...f0.notes].sort(),
        sf1 = [...f1.notes].sort();
      if (sf0[0] !== sf1[0] || sf0[1] !== sf1[1]) continue;

      const [A, B] = sf0;

      // Roof cells must contain A and B (plus extras)
      const r0 = cells[roofCells[0]],
        r1 = cells[roofCells[1]];
      if (!r0.notes.includes(A) || !r0.notes.includes(B)) continue;
      if (!r1.notes.includes(A) || !r1.notes.includes(B)) continue;

      // At least one roof cell must have extras (otherwise it's a deadly pattern, not solvable)
      if (r0.notes.length === 2 && r1.notes.length === 2) continue;

      // Targets: remove A and B from roof cells
      const targets: LitCandidate[] = [];
      for (const rc of roofCells) {
        const cd = cells[rc];
        if (cd.notes.includes(A)) targets.push({ cell: rc, digit: A });
        if (cd.notes.includes(B)) targets.push({ cell: rc, digit: B });
      }

      if (targets.length > 0) {
        return {
          valid: true,
          skillId: META.id,
          skillName: META.name,
          skillSubtitle: META.subtitle,
          sweepDirection: META.sweepDirection,
          digits: [A, B],
          sourceCells: selectedCells.slice(),
          targets,
        };
      }
    }
  }

  return makeEmptyPreview(META, t('skills.noUniqueRectangle'));
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

export const uniqueRectangleSkill: SkillDetector = { ...META, evaluate, execute };
