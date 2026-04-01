import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';
import { findAllALS, type AlmostLockedSet } from '../../helpers/als';

function _cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

function isRestrictedCommon(board: SolverBoard, alsA: AlmostLockedSet, alsB: AlmostLockedSet, d: number): boolean {
  const bit = digitBit(d);
  const aCells = alsA.cells.filter((c) => (board.candidates[c] & bit) !== 0);
  const bCells = alsB.cells.filter((c) => (board.candidates[c] & bit) !== 0);
  for (const a of aCells) {
    for (const b of bCells) {
      if (!board.seesCell(a, b)) return false;
    }
  }
  return true;
}

/**
 * ALS Chain:
 * 3 or more ALS connected sequentially via restricted common digits.
 * Common non-linking digits of the first and last ALS can be eliminated from external cells that see all candidate cells of that digit in both ends.
 */
export function detectAlsChain(board: SolverBoard): DetectionResult | null {
  const allALS = findAllALS(board);
  if (allALS.length < 3) return null;

  // Build adjacency: which ALS pairs share a restricted common
  const adj = new Map<number, { alsIdx: number; rc: number }[]>();
  for (let i = 0; i < allALS.length; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < allALS.length; i++) {
    for (let j = i + 1; j < allALS.length; j++) {
      if (allALS[i].cells.some((c) => allALS[j].cells.includes(c))) continue;
      const common = allALS[i].candidates & allALS[j].candidates;
      const cDigits = bitsToDigits(common);
      for (const d of cDigits) {
        if (isRestrictedCommon(board, allALS[i], allALS[j], d)) {
          adj.get(i)!.push({ alsIdx: j, rc: d });
          adj.get(j)!.push({ alsIdx: i, rc: d });
        }
      }
    }
  }

  // DFS for chains of length 3-5
  const MAX_CHAIN = 5;

  function dfs(chain: number[], usedRC: number[]): DetectionResult | null {
    if (chain.length >= 3) {
      // Check eliminations between first and last ALS
      const first = allALS[chain[0]];
      const last = allALS[chain[chain.length - 1]];
      if (first.cells.some((c) => last.cells.includes(c))) {
        // overlapping, skip
      } else {
        const rcMask = usedRC.reduce((m, d) => m | digitBit(d), 0);
        const commonDigits = first.candidates & last.candidates & ~rcMask;
        const zDigits = bitsToDigits(commonDigits);
        for (const z of zDigits) {
          const zBit = digitBit(z);
          const firstZ = first.cells.filter((c) => (board.candidates[c] & zBit) !== 0);
          const lastZ = last.cells.filter((c) => (board.candidates[c] & zBit) !== 0);
          const allZ = [...firstZ, ...lastZ];
          const peers = board.commonPeers(allZ);

          const chainCellSet = new Set<number>();
          for (const idx of chain) {
            for (const c of allALS[idx].cells) chainCellSet.add(c);
          }

          const actions: DetectionAction[] = [];
          for (const cell of peers) {
            if (chainCellSet.has(cell)) continue;
            if (board.hasCandidate(cell, z)) {
              actions.push({ kind: 'eliminate', cell, digit: z });
            }
          }

          if (actions.length > 0) {
            return {
              technique: 'als_chain',
              actions,
              patternCells: [...chainCellSet],
              description: `ALS Chain: ${chain.length} ALS forming chain, eliminate digit ${z} in ${actions.length} cells`,
            };
          }
        }
      }
    }

    if (chain.length >= MAX_CHAIN) return null;

    const last = chain[chain.length - 1];
    for (const { alsIdx, rc } of adj.get(last)!) {
      if (chain.includes(alsIdx)) continue;
      if (usedRC.includes(rc)) continue;
      const res = dfs([...chain, alsIdx], [...usedRC, rc]);
      if (res) return res;
    }

    return null;
  }

  for (let start = 0; start < allALS.length; start++) {
    const res = dfs([start], []);
    if (res) return res;
  }

  return null;
}
