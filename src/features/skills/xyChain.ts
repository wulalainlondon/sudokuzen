import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther, getCommonPeers } from './types';

const META = {
  id: 'xy_chain',
  get name() {
    return t('skills.xyChainName');
  },
  subtitle: 'XY-Chain',
  sweepDirection: 'outward' as const,
};

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 3) return makeEmptyPreview(META, '');
  if (selectedCells.length > 10) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '3', max: '10' }));

  // All must be bivalue
  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length !== 2) {
      return makeEmptyPreview(META, t('skills.allThreeMustBeBivalue'));
    }
  }

  // Build adjacency: two bivalue cells are adjacent if they see each other and share exactly one candidate
  const n = selectedCells.length;
  const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = selectedCells[i],
        b = selectedCells[j];
      if (!cellsSeeEachOther(a, b)) continue;
      const shared = cells[a].notes.filter((d) => cells[b].notes.includes(d));
      if (shared.length === 1) {
        adj[i][j] = true;
        adj[j][i] = true;
      }
    }
  }

  function exitDigitAt(chainCells: number[], idx: number): number {
    const cell = chainCells[idx];
    if (idx === 0) {
      const nextCell = chainCells[1];
      const shared = cells[cell].notes.filter((d) => cells[nextCell].notes.includes(d));
      return cells[cell].notes.find((d) => d !== shared[0])!;
    }
    const prevCell = chainCells[idx - 1];
    const entryDigit = cells[cell].notes.filter((d) => cells[prevCell].notes.includes(d))[0];
    return cells[cell].notes.find((d) => d !== entryDigit)!;
  }

  // Find a Hamiltonian path via DFS; only accept paths where exit digits match and yield eliminations
  const visited = new Set<number>();
  const path: number[] = [];
  let chain: number[] | null = null;
  let foundTargets: LitCandidate[] = [];

  function dfs(node: number): boolean {
    path.push(node);
    visited.add(node);
    if (path.length === n) {
      const chainCells = path.map((i) => selectedCells[i]);
      const startExit = exitDigitAt(chainCells, 0);
      const endExit = exitDigitAt(chainCells, chainCells.length - 1);
      if (startExit === endExit) {
        const peers = getCommonPeers([chainCells[0], chainCells[chainCells.length - 1]]);
        const chainSet = new Set(chainCells);
        const tgts: LitCandidate[] = peers
          .filter((p) => !chainSet.has(p) && cells[p]?.value === 0 && cells[p].notes.includes(startExit))
          .map((p) => ({ cell: p, digit: startExit }));
        if (tgts.length > 0) {
          chain = chainCells;
          foundTargets = tgts;
          path.pop();
          visited.delete(node);
          return true;
        }
      }
      path.pop();
      visited.delete(node);
      return false;
    }
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
    if (dfs(start)) break;
  }

  if (!chain) return makeEmptyPreview(META, t('skills.noXYChain'));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    digits: [foundTargets[0].digit],
    sourceCells: chain,
    targets: foundTargets,
  };
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

export const xyChainSkill: SkillDetector = { ...META, evaluate, execute };
