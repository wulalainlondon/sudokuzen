import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther, getCommonPeers } from './types';

const META = {
  id: 'remote_pairs',
  get name() {
    return t('skills.remotePairsName');
  },
  subtitle: 'Remote Pairs',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 3) return makeEmptyPreview(META, '');

  // All must be bivalue with same 2 digits
  const first = cells[selectedCells[0]];
  if (!first || first.value !== 0 || first.notes.length !== 2) {
    return makeEmptyPreview(META, t('skills.allMustSameBivalue'));
  }
  const pair = [...first.notes].sort();

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length !== 2) {
      return makeEmptyPreview(META, t('skills.allMustSameBivalue'));
    }
    const s = [...d.notes].sort();
    if (s[0] !== pair[0] || s[1] !== pair[1]) {
      return makeEmptyPreview(META, t('skills.allMustSameBivalue'));
    }
  }

  // Must form a chain: try all permutations would be expensive.
  // Instead, try to find a valid chain ordering among selected cells.
  // Use BFS/DFS to find a Hamiltonian path where adjacent cells share a unit.
  const n = selectedCells.length;
  const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cellsSeeEachOther(selectedCells[i], selectedCells[j])) {
        adj[i][j] = true;
        adj[j][i] = true;
      }
    }
  }

  // Find a Hamiltonian path via DFS (n is small, max ~8-10)
  function findChain(): number[] | null {
    const visited = new Set<number>();
    const path: number[] = [];

    function dfs(node: number): boolean {
      path.push(node);
      visited.add(node);
      if (path.length === n) return true;
      for (let next = 0; next < n; next++) {
        if (!visited.has(next) && adj[node][next]) {
          if (dfs(next)) return true;
        }
      }
      path.pop();
      visited.delete(node);
      return false;
    }

    for (let start = 0; start < n; start++) {
      if (dfs(start)) return path.map((i) => selectedCells[i]);
    }
    return null;
  }

  const chain = findChain();
  if (!chain) return makeEmptyPreview(META, t('skills.noChain'));

  // Chain length must be odd (even number of links) so first and last have same "color"
  // An odd number of cells = even number of links
  if (chain.length % 2 === 0) return makeEmptyPreview(META, t('skills.chainLengthMustBeOdd'));

  // Eliminate both digits from cells that see BOTH first and last
  const first_cell = chain[0];
  const last_cell = chain[chain.length - 1];
  const commonPeers = getCommonPeers([first_cell, last_cell]);
  const srcSet = new Set(chain);
  const targets: LitCandidate[] = [];

  for (const p of commonPeers) {
    if (srcSet.has(p)) continue;
    const cd = cells[p];
    if (!cd || cd.value !== 0) continue;
    for (const digit of pair) {
      if (cd.notes.includes(digit)) {
        targets.push({ cell: p, digit });
      }
    }
  }

  if (targets.length > 0) {
    return {
      valid: true,
      skillId: META.id,
      skillName: META.name,
      skillSubtitle: META.subtitle,
      sweepDirection: META.sweepDirection,
      digits: pair,
      sourceCells: chain,
      targets,
    };
  }

  return makeEmptyPreview(META, t('skills.noElimCandidates'));
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

export const remotePairsSkill: SkillDetector = { ...META, evaluate, execute };
