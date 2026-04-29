import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview, cellsSeeEachOther } from './types';
import { buildLinkGraph, encodeNode, decodeNode } from './chainHelper';

const META = {
  id: 'grouped_aic_nice_loop',
  get name() {
    return t('skills.groupedAicNiceLoopName');
  },
  subtitle: 'Grouped AIC / Nice Loop',
  sweepDirection: 'outward' as const,
};

interface NiceLoopResult {
  patternCells: number[];
  targets: LitCandidate[];
  chainPath: { cell: number; digit: number }[];
}

/**
 * Find a continuous nice loop: a closed AIC cycle where the loop opens with a
 * strong link and closes back to the start via a weak link.
 *
 * Loop structure: N0 --strong-- N1 --weak-- N2 --strong-- ... N(k) --weak-- N0
 * Consistent state: N0=OFF, N1=ON, N2=OFF, ...
 * Eliminations: cells seeing any ON node (odd-indexed) for the same digit.
 */
function findNiceLoop(cells: CellData[], hintCells: number[], maxLength: number): NiceLoopResult | null {
  const { strong, weak } = buildLinkGraph(cells);
  const hintSet = new Set(hintCells);

  const startNodes: number[] = [];
  for (const c of hintCells) {
    const cell = cells[c];
    if (!cell || cell.value !== 0) continue;
    for (const d of cell.notes) {
      const n = encodeNode(c, d);
      if (strong.has(n)) startNodes.push(n);
    }
  }
  for (const [n] of strong) {
    if (!startNodes.includes(n)) startNodes.push(n);
  }

  for (const startNode of startNodes) {
    const queue: { node: number; chain: number[]; nextStrong: boolean }[] = [
      { node: startNode, chain: [startNode], nextStrong: true },
    ];

    while (queue.length > 0) {
      const { node, chain, nextStrong } = queue.shift()!;
      if (chain.length > maxLength) continue;

      // Check loop closure: from current node via weak link back to startNode.
      // nextStrong=false means the next link we'd take is weak, so the closing link is weak.
      if (!nextStrong && chain.length >= 4 && weak.get(node)?.has(startNode)) {
        const patternCells = [...new Set(chain.map((n) => decodeNode(n).cell))];
        if ([...hintSet].every((c) => patternCells.includes(c))) {
          // A continuous nice loop is valid under both colorings simultaneously.
          // Eliminate: for every loop node, cells outside the loop that see it for same digit.
          const patternSet = new Set(patternCells);
          const seen = new Set<string>();
          const targets: LitCandidate[] = [];
          for (const loopNode of chain) {
            const { cell: cellX, digit: digitX } = decodeNode(loopNode);
            for (let p = 0; p < 81; p++) {
              if (patternSet.has(p)) continue;
              if (!cells[p] || cells[p].value !== 0) continue;
              if (!cells[p].notes.includes(digitX)) continue;
              if (cellsSeeEachOther(p, cellX)) {
                const tk = `${p}-${digitX}`;
                if (!seen.has(tk)) {
                  seen.add(tk);
                  targets.push({ cell: p, digit: digitX });
                }
              }
            }
          }
          if (targets.length > 0)
            return { patternCells, targets, chainPath: [...chain, chain[0]].map((n) => decodeNode(n)) };
        }
      }

      const neighbors = (nextStrong ? strong : weak).get(node);
      if (!neighbors) continue;
      for (const next of neighbors) {
        if (next === startNode) continue; // handled by loop-closure check above
        if (chain.includes(next)) continue;
        if (chain.length < maxLength) {
          queue.push({ node: next, chain: [...chain, next], nextStrong: !nextStrong });
        }
      }
    }
  }
  return null;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 4) return makeEmptyPreview(META, '');
  if (selectedCells.length > 20) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '4', max: '20' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const result = findNiceLoop(cells, selectedCells, 16);
  if (!result) return makeEmptyPreview(META, t('skills.noNiceLoop'));

  return {
    valid: true,
    skillId: META.id,
    skillName: META.name,
    skillSubtitle: META.subtitle,
    sweepDirection: META.sweepDirection,
    sourceCells: result.patternCells,
    targets: result.targets,
    chainPath: result.chainPath,
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

export const groupedAicNiceLoopSkill: SkillDetector = { ...META, evaluate, execute };
