import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Region Forcing Chain（区域强制链）：
 * 对每个单元中每个数字d，若d只有2-4个位置，则分别假设d在每个位置。
 * 传播后若所有分支同意某结论，该结论成立。
 */
export function detectRegionForcingChain(board: SolverBoard): DetectionResult | null {
  for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
    for (let d = 1; d <= 9; d++) {
      const cells = board.digitCellsInUnit(unitIdx, d);
      if (cells.length < 2 || cells.length > 4) continue;

      const branchResults: Map<string, number>[] = [];
      let hasContradiction = false;

      for (const cell of cells) {
        const result = propagate(board, cell, d);
        if (result === null) {
          // Contradiction: d can't go here, eliminate
          return {
            technique: 'region_forcing_chain',
            actions: [{ kind: 'eliminate', cell, digit: d }],
            patternCells: cells,
            description: `Region Forcing Chain：假设 ${cellRef(cell)}=${d} 产生矛盾，消去该候选`,
          };
        }
        branchResults.push(result);
      }

      // Find unanimous conclusions
      const firstBranch = branchResults[0];
      for (const [key, val] of firstBranch) {
        let unanimous = true;
        for (let b = 1; b < branchResults.length; b++) {
          if (branchResults[b].get(key) !== val) {
            unanimous = false;
            break;
          }
        }
        if (!unanimous) continue;

        const [cellStr, digitStr] = key.split(':');
        const tCell = parseInt(cellStr);
        const tDigit = parseInt(digitStr);

        const actions: DetectionAction[] = [{ kind: val === 1 ? 'fill' : 'eliminate', cell: tCell, digit: tDigit }];

        const unitName = unitIdx < 9 ? `行${unitIdx + 1}` : unitIdx < 18 ? `列${unitIdx - 8}` : `宫${unitIdx - 17}`;

        return {
          technique: 'region_forcing_chain',
          actions,
          patternCells: cells,
          description: `Region Forcing Chain：${unitName} 中数字 ${d} 所有位置均推出 ${cellRef(tCell)} ${val === 1 ? '填入' : '消去'} ${tDigit}`,
        };
      }
    }
  }

  return null;
}

function propagate(board: SolverBoard, startCell: number, startDigit: number): Map<string, number> | null {
  const cands = new Uint16Array(board.candidates);
  const vals = new Uint8Array(board.values);
  const conclusions = new Map<string, number>();

  vals[startCell] = startDigit;
  cands[startCell] = 0;

  for (const peer of SolverBoard.PEERS[startCell]) {
    if ((cands[peer] & digitBit(startDigit)) !== 0) {
      cands[peer] &= ~digitBit(startDigit);
      conclusions.set(`${peer}:${startDigit}`, -1);
    }
  }

  let changed = true;
  let iters = 0;

  while (changed && iters < 81) {
    changed = false;
    iters++;

    for (let i = 0; i < 81; i++) {
      if (vals[i] !== 0) continue;
      if (cands[i] === 0) return null;

      // Naked single
      if ((cands[i] & (cands[i] - 1)) === 0) {
        const d = Math.log2(cands[i]) | 0;
        vals[i] = d;
        cands[i] = 0;
        conclusions.set(`${i}:${d}`, 1);
        changed = true;

        for (const peer of SolverBoard.PEERS[i]) {
          if ((cands[peer] & digitBit(d)) !== 0) {
            cands[peer] &= ~digitBit(d);
            conclusions.set(`${peer}:${d}`, -1);
          }
        }
        continue;
      }
    }

    // Hidden singles
    for (let unitIdx = 0; unitIdx < 27; unitIdx++) {
      for (let d = 1; d <= 9; d++) {
        const bit = digitBit(d);
        let count = 0;
        let lastCell = -1;
        for (const c of SolverBoard.ALL_UNITS[unitIdx]) {
          if (vals[c] === d) {
            count = -1;
            break;
          }
          if (vals[c] === 0 && (cands[c] & bit) !== 0) {
            count++;
            lastCell = c;
          }
        }
        if (count === 1 && lastCell >= 0) {
          vals[lastCell] = d;
          cands[lastCell] = 0;
          conclusions.set(`${lastCell}:${d}`, 1);
          changed = true;

          for (const peer of SolverBoard.PEERS[lastCell]) {
            if ((cands[peer] & bit) !== 0) {
              cands[peer] &= ~bit;
              conclusions.set(`${peer}:${d}`, -1);
            }
          }
        }
      }
    }
  }

  return conclusions;
}
