import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Cell Forcing Chain:
 * For cells with 2-4 candidates, assume each candidate is true and propagate (naked singles + hidden singles).
 * If all branches agree on a conclusion (fill or eliminate), that conclusion holds.
 */
export function detectCellForcingChain(board: SolverBoard): DetectionResult | null {
  const targets = board.emptyCells.filter((c) => {
    const cnt = board.candidateCount(c);
    return cnt >= 2 && cnt <= 4;
  });

  if (targets.length === 0) return null;

  for (const cell of targets) {
    const digits = bitsToDigits(board.candidates[cell]);
    const branchResults: Map<string, number>[] = [];
    const _hasContradiction = false;

    for (const d of digits) {
      const result = propagate(board, cell, d);
      if (result === null) {
        // Contradiction: this digit is impossible
        return {
          technique: 'cell_forcing_chain',
          actions: [{ kind: 'eliminate', cell, digit: d }],
          patternCells: [cell],
          description: `Cell Forcing Chain: assuming ${cellRef(cell)}=${d} leads to contradiction, eliminate this candidate`,
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
      if (tCell === cell) continue;

      const actions: DetectionAction[] = [{ kind: val === 1 ? 'fill' : 'eliminate', cell: tCell, digit: tDigit }];

      return {
        technique: 'cell_forcing_chain',
        actions,
        patternCells: [cell],
        description: `Cell Forcing Chain: all candidates {${digits.join(',')}} of ${cellRef(cell)} lead to ${cellRef(tCell)} ${val === 1 ? 'fill' : 'eliminate'} ${tDigit}`,
      };
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
      if (cands[i] === 0) return null; // Contradiction

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

    // Hidden singles in units
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
