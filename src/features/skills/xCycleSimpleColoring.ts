import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther } from './types';
import { isConjugatePair } from './chainHelper';

const META = {
  id: 'x_cycle_simple_coloring',
  get name() {
    return t('skills.xCycleSimpleColoringName');
  },
  subtitle: 'Simple Coloring',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 20) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '20' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  // Find common digit across all selected cells
  const firstNotes = cells[selectedCells[0]].notes;
  const commonDigits = firstNotes.filter((d) => selectedCells.every((idx) => cells[idx].notes.includes(d)));

  for (const digit of commonDigits) {
    // Build adjacency from conjugate pairs among selected cells
    const n = selectedCells.length;
    const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (isConjugatePair(selectedCells[i], selectedCells[j], digit, cells)) {
          adj[i][j] = true;
          adj[j][i] = true;
        }
      }
    }

    // BFS coloring from index 0
    const color = new Array<number>(n).fill(-1);
    color[0] = 0;
    const cluster: [number[], number[]] = [[selectedCells[0]], []];
    const queue = [0];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let j = 0; j < n; j++) {
        if (adj[cur][j] && color[j] === -1) {
          color[j] = 1 - color[cur];
          cluster[color[j]].push(selectedCells[j]);
          queue.push(j);
        }
      }
    }

    // Verify all selected cells are reachable (connected)
    if (color.some((c) => c === -1)) continue;

    // Rule 1: same-color cells see each other → eliminate that color
    for (const colorIdx of [0, 1] as const) {
      const group = cluster[colorIdx];
      let conflict = false;
      for (let i = 0; i < group.length && !conflict; i++) {
        for (let j = i + 1; j < group.length && !conflict; j++) {
          if (cellsSeeEachOther(group[i], group[j])) conflict = true;
        }
      }
      if (conflict) {
        const targets: LitCandidate[] = group
          .filter((c) => cells[c]?.value === 0 && cells[c].notes.includes(digit))
          .map((c) => ({ cell: c, digit }));
        if (targets.length > 0) {
          return {
            valid: true,
            skillId: META.id,
            skillName: META.name,
            skillSubtitle: META.subtitle,
            sweepDirection: META.sweepDirection,
            digits: [digit],
            sourceCells: selectedCells.slice(),
            targets,
          };
        }
      }
    }

    // Rule 2: external cell sees one cell of each color → eliminate from it
    const targets: LitCandidate[] = [];
    for (let idx = 0; idx < 81; idx++) {
      if (selectedCells.includes(idx)) continue;
      const cell = cells[idx];
      if (!cell || cell.value !== 0 || !cell.notes.includes(digit)) continue;
      const seesColor0 = cluster[0].some((c) => cellsSeeEachOther(idx, c));
      const seesColor1 = cluster[1].some((c) => cellsSeeEachOther(idx, c));
      if (seesColor0 && seesColor1) targets.push({ cell: idx, digit });
    }
    if (targets.length > 0) {
      return {
        valid: true,
        skillId: META.id,
        skillName: META.name,
        skillSubtitle: META.subtitle,
        sweepDirection: META.sweepDirection,
        digits: [digit],
        sourceCells: selectedCells.slice(),
        targets,
      };
    }
  }

  return makeEmptyPreview(META, t('skills.noXCycleSimpleColoring'));
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

export const xCycleSimpleColoringSkill: SkillDetector = { ...META, evaluate, execute };
