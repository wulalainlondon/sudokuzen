import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Forcing Chain / Net:
 * For cells with 2-3 candidates, assume each candidate is true and propagate using singles.
 * If all assumptions lead to the same conclusion (a cell fills a digit or eliminates a candidate), that conclusion holds.
 */
export function detectForcingChainNet(board: SolverBoard): DetectionResult | null {
  // Collect cells with 2-3 candidates
  const targetCells = board.emptyCells.filter((c) => {
    const cnt = board.candidateCount(c);
    return cnt >= 2 && cnt <= 3;
  });

  if (targetCells.length === 0) return null;

  for (const cell of targetCells) {
    const digits = bitsToDigits(board.candidates[cell]);

    // For each assumption, propagate naked singles and record conclusions
    const branchResults: Map<string, number>[] = []; // key: "cell:digit" -> value (1=filled, -1=eliminated)

    const allValid = true;
    for (const d of digits) {
      const result = propagateAssumption(board, cell, d);
      if (result === null) {
        // Contradiction - this digit can be eliminated
        const actions: DetectionAction[] = [{ kind: 'eliminate', cell, digit: d }];
        return {
          technique: 'forcing_chain_net',
          actions,
          patternCells: [cell],
          description: `Forcing Chain: assuming ${cellRef(cell)}=${d} leads to contradiction, eliminate this candidate`,
        };
      }
      branchResults.push(result);
    }

    if (!allValid) continue;

    // Find common conclusions across all branches
    if (branchResults.length < 2) continue;

    const firstBranch = branchResults[0];
    for (const [key, val] of firstBranch) {
      let unanimous = true;
      for (let b = 1; b < branchResults.length; b++) {
        if (branchResults[b].get(key) !== val) {
          unanimous = false;
          break;
        }
      }

      if (unanimous) {
        const [cellStr, digitStr] = key.split(':');
        const targetCell = parseInt(cellStr);
        const targetDigit = parseInt(digitStr);

        if (targetCell === cell) continue;

        const actions: DetectionAction[] = [];
        if (val === 1) {
          actions.push({ kind: 'fill', cell: targetCell, digit: targetDigit });
        } else {
          actions.push({ kind: 'eliminate', cell: targetCell, digit: targetDigit });
        }

        return {
          technique: 'forcing_chain_net',
          actions,
          patternCells: [cell],
          description: `Forcing Chain: all candidates {${digits.join(',')}} of ${cellRef(cell)} lead to ${cellRef(targetCell)} ${val === 1 ? 'fill' : 'eliminate'} ${targetDigit}`,
        };
      }
    }
  }

  return null;
}

function propagateAssumption(board: SolverBoard, startCell: number, startDigit: number): Map<string, number> | null {
  // Clone candidates
  const cands = new Uint16Array(board.candidates);
  const vals = new Uint8Array(board.values);
  const conclusions = new Map<string, number>();

  // Place startDigit at startCell
  vals[startCell] = startDigit;
  cands[startCell] = 0;

  // Remove startDigit from peers
  for (const peer of SolverBoard.PEERS[startCell]) {
    if ((cands[peer] & digitBit(startDigit)) !== 0) {
      cands[peer] &= ~digitBit(startDigit);
      conclusions.set(`${peer}:${startDigit}`, -1);
    }
  }

  // Propagate naked singles
  let changed = true;
  let iterations = 0;
  const MAX_ITER = 81;

  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;

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
      }
    }
  }

  return conclusions;
}
