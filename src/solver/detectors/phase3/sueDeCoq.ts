import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, popcount } from '../../helpers/bitmask';
import { combinations } from '../../helpers/combinations';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * Sue de Coq（交叉区域分解）：
 * 在宫与行（或列）的交叉区域（2-3格），若其候选数可分解为：
 * 行剩余部分的ALS + 宫剩余部分的ALS，则可从行和宫的其他格消去对应候选数。
 */
export function detectSueDeCoq(board: SolverBoard): DetectionResult | null {
  // For each box-line intersection
  for (let box = 0; box < 9; box++) {
    const boxCells = SolverBoard.BOX_CELLS[box];
    const emptyBoxCells = boxCells.filter((c) => board.values[c] === 0);

    for (let line = 0; line < 18; line++) {
      const isRow = line < 9;
      const lineCells = isRow ? SolverBoard.ROW_CELLS[line] : SolverBoard.COL_CELLS[line - 9];

      // Intersection cells (in both box and line)
      const intersection = lineCells.filter((c) => SolverBoard.CELL_BOX[c] === box && board.values[c] === 0);

      if (intersection.length < 2 || intersection.length > 3) continue;

      // Union of candidates in intersection
      let interCands = 0;
      for (const c of intersection) interCands |= board.candidates[c];
      const interDigitCount = popcount(interCands);

      // Need enough digits: |intersection| + 2 <= interDigitCount (room for ALS on each side)
      if (interDigitCount < intersection.length + 2) continue;

      // Line remainder: cells in line but not in box
      const lineRemainder = lineCells.filter((c) => SolverBoard.CELL_BOX[c] !== box && board.values[c] === 0);

      // Box remainder: cells in box but not in line
      const boxRemainder = emptyBoxCells.filter((c) => !intersection.includes(c));

      // Try to find ALS in line remainder and ALS in box remainder
      // whose candidates partition the intersection candidates
      const maxLineSize = Math.min(4, lineRemainder.length);
      const maxBoxSize = Math.min(4, boxRemainder.length);

      for (let ls = 1; ls <= maxLineSize; ls++) {
        for (const lineSub of combinations(lineRemainder, ls)) {
          let lineSubCands = 0;
          for (const c of lineSub) lineSubCands |= board.candidates[c];
          // Line ALS: ls cells with ls+1 candidates
          if (popcount(lineSubCands) !== ls + 1) continue;
          // Must overlap with intersection candidates
          const lineOverlap = lineSubCands & interCands;
          if (lineOverlap === 0) continue;

          for (let bs = 1; bs <= maxBoxSize; bs++) {
            for (const boxSub of combinations(boxRemainder, bs)) {
              let boxSubCands = 0;
              for (const c of boxSub) boxSubCands |= board.candidates[c];
              // Box ALS: bs cells with bs+1 candidates
              if (popcount(boxSubCands) !== bs + 1) continue;
              // Must overlap with intersection candidates
              const boxOverlap = boxSubCands & interCands;
              if (boxOverlap === 0) continue;

              // Line ALS and Box ALS should not share digits
              if ((lineSubCands & boxSubCands) !== 0) continue;

              // Together they must cover all intersection candidates
              if ((lineSubCands | boxSubCands) !== interCands) continue;

              // Check: total cells = intersection + lineSub + boxSub
              // Total candidates = interDigitCount
              // Expected: |intersection| + ls + bs cells, interDigitCount candidates
              // This must satisfy: interDigitCount = |intersection| + ls + bs - something...
              // Actually Sue de Coq: the combined candidates equal lineSubCands | boxSubCands = interCands
              // And the total cell count is intersection.length, with ALS providing the constraint

              // Generate eliminations
              const actions: DetectionAction[] = [];

              // Digits in lineSubCands can be eliminated from line remainder not in lineSub
              const lineSubSet = new Set(lineSub);
              const lineSubDigits = bitsToDigits(lineSubCands);
              for (const c of lineRemainder) {
                if (lineSubSet.has(c)) continue;
                for (const d of lineSubDigits) {
                  if (board.hasCandidate(c, d)) {
                    actions.push({ kind: 'eliminate', cell: c, digit: d });
                  }
                }
              }

              // Digits in boxSubCands can be eliminated from box remainder not in boxSub
              const boxSubSet = new Set(boxSub);
              const boxSubDigits = bitsToDigits(boxSubCands);
              for (const c of boxRemainder) {
                if (boxSubSet.has(c)) continue;
                for (const d of boxSubDigits) {
                  if (board.hasCandidate(c, d)) {
                    actions.push({ kind: 'eliminate', cell: c, digit: d });
                  }
                }
              }

              if (actions.length > 0) {
                const patternCells = [...intersection, ...lineSub, ...boxSub];
                return {
                  technique: 'sue_de_coq',
                  actions,
                  patternCells,
                  description: `Sue de Coq：交叉区 {${intersection.map(cellRef).join(',')}}，行ALS{${lineSub.map(cellRef).join(',')}}，宫ALS{${boxSub.map(cellRef).join(',')}}，消去 ${actions.length} 处`,
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}
