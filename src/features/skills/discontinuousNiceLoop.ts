import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview, LitCandidate } from './types';
import { t } from '../../i18n/t';
import { makeEmptyPreview } from './types';
import { buildLinkGraph, encodeNode, decodeNode } from './chainHelper';

const META = {
  id: 'discontinuous_nice_loop',
  get name() {
    return t('skills.discontinuousNiceLoopName');
  },
  subtitle: 'Discontinuous Nice Loop',
  sweepDirection: 'outward' as const,
};

interface DNLResult {
  patternCells: number[];
  targets: LitCandidate[];
  chainPath: { cell: number; digit: number }[];
}

/**
 * Type 2 Discontinuous Nice Loop: AIC from (cellA, d1) --strong-first chain-- (cellA, d2)
 * where d1 ≠ d2 and the final link is STRONG (nextStrong=true when reaching endpoint).
 *
 * Conclusion: cell A must have d1 or d2 → all other candidates in cell A are eliminated.
 * Reasoning: if d1=false → chain forces d2=true; if d2=false → contapositive forces d1=true.
 */
function findDiscontinuousNiceLoop(cells: CellData[], hintCells: number[], maxLength: number): DNLResult | null {
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
    const { cell: startCell, digit: startDigit } = decodeNode(startNode);
    const queue: { node: number; chain: number[]; nextStrong: boolean }[] = [
      { node: startNode, chain: [startNode], nextStrong: true },
    ];

    while (queue.length > 0) {
      const { node, chain, nextStrong } = queue.shift()!;
      if (chain.length > maxLength) continue;

      const neighbors = (nextStrong ? strong : weak).get(node);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (chain.includes(next)) continue;
        const newChain = [...chain, next];
        const { cell: endCell, digit: endDigit } = decodeNode(next);

        // Type 2 DNL: same cell, different digit, chain ends with strong link (nextStrong=true)
        if (nextStrong && newChain.length >= 4 && endCell === startCell && endDigit !== startDigit) {
          const patternCells = [...new Set(newChain.map((n) => decodeNode(n).cell))];
          if ([...hintSet].every((c) => patternCells.includes(c))) {
            // Eliminate all candidates of startCell except startDigit and endDigit
            const keep = new Set([startDigit, endDigit]);
            const targets: LitCandidate[] = cells[startCell].notes
              .filter((d) => !keep.has(d))
              .map((d) => ({ cell: startCell, digit: d }));
            if (targets.length > 0) return { patternCells, targets, chainPath: newChain.map((n) => decodeNode(n)) };
          }
        }

        if (newChain.length < maxLength) {
          queue.push({ node: next, chain: newChain, nextStrong: !nextStrong });
        }
      }
    }
  }
  return null;
}

function evaluate(selectedCells: number[], cells: CellData[]): SkillPreview {
  if (selectedCells.length < 2) return makeEmptyPreview(META, '');
  if (selectedCells.length > 12) return makeEmptyPreview(META, t('skills.needSelectRange', { min: '2', max: '12' }));

  for (const idx of selectedCells) {
    const d = cells[idx];
    if (!d || d.value !== 0 || d.notes.length === 0) {
      return makeEmptyPreview(META, t('skills.selectedCellsMustBeEmpty'));
    }
  }

  const result = findDiscontinuousNiceLoop(cells, selectedCells, 12);
  if (!result) return makeEmptyPreview(META, t('skills.noDiscontinuousNiceLoop'));

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

export const discontinuousNiceLoopSkill: SkillDetector = { ...META, evaluate, execute };
