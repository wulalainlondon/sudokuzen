import { SolverBoard } from '../../board';
import type { DetectionResult, DetectionAction } from '../../types';
import { bitsToDigits, digitBit } from '../../helpers/bitmask';
import { findConjugatePairs } from '../../helpers/links';

function cellRef(idx: number): string {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

/**
 * 3D Medusa (Multi-digit Coloring):
 *
 * Extends Simple Coloring: in addition to single-digit conjugate pair coloring,
 * when a cell has exactly 2 candidates (bivalue), if one is already colored,
 * the other is automatically assigned the opposite color. This extends coloring across digits.
 *
 * Nodes are (cell, digit) pairs, colored A(0) or B(1).
 *
 * 6 elimination rules:
 * Rule 1: Same color, same cell, two digits -> contradiction, that color is all false
 * Rule 2: Same color, same digit in same unit -> contradiction, that color is all false
 * Rule 3: Uncolored cell sees both colors of same digit -> eliminate that digit
 * Rule 4: Uncolored cell's candidate is covered by both colors in all its units -> eliminate
 * Rule 5: Uncolored bivalue cell, both candidates seen by same color -> eliminate both (fill opposite)
 * Rule 6: Cascade eliminations after colored cells are determined (triggered by Rule 1/2)
 */
export function detectMedusa3d(board: SolverBoard): DetectionResult | null {
  const allPairs = findConjugatePairs(board);
  if (allPairs.length === 0) return null;

  // Group conjugate pairs by digit
  const pairsByDigit = new Map<number, typeof allPairs>();
  for (const p of allPairs) {
    if (!pairsByDigit.has(p.digit)) pairsByDigit.set(p.digit, []);
    pairsByDigit.get(p.digit)!.push(p);
  }

  // Build multi-digit adjacency: nodes are (cell, digit) encoded as cell * 10 + digit
  const encode = (cell: number, digit: number) => cell * 10 + digit;
  const decodeCell = (n: number) => Math.floor(n / 10);
  const decodeDigit = (n: number) => n % 10;

  const adj = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  // Link 1: Conjugate pairs (same digit, strong link)
  for (const [d, pairs] of pairsByDigit) {
    for (const p of pairs) {
      addEdge(encode(p.cellA, d), encode(p.cellB, d));
    }
  }

  // Link 2: Bivalue cells (2 candidates → cross-digit link)
  for (const cell of board.bivalueCells) {
    const digits = bitsToDigits(board.candidates[cell]);
    if (digits.length === 2) {
      const nodeA = encode(cell, digits[0]);
      const nodeB = encode(cell, digits[1]);
      // Only link if at least one is already in the graph (from conjugate pairs)
      // Actually, we add all bivalue links; isolated ones just won't form clusters
      addEdge(nodeA, nodeB);
    }
  }

  if (adj.size < 4) return null; // Need meaningful clusters

  // BFS coloring of connected components
  const color = new Map<number, number>(); // node → 0 or 1

  for (const startNode of adj.keys()) {
    if (color.has(startNode)) continue;

    const cluster: [number[], number[]] = [[], []]; // color 0, color 1
    const queue: { node: number; c: number }[] = [{ node: startNode, c: 0 }];
    color.set(startNode, 0);
    cluster[0].push(startNode);

    while (queue.length > 0) {
      const { node, c } = queue.shift()!;
      for (const neighbor of adj.get(node) || []) {
        if (!color.has(neighbor)) {
          const nc = 1 - c;
          color.set(neighbor, nc);
          cluster[nc].push(neighbor);
          queue.push({ node: neighbor, c: nc });
        }
      }
    }

    // Need at least 2 different digits in the cluster for it to be "3D"
    // (otherwise it's just Simple Coloring, which we handle separately)
    const clusterDigits = new Set<number>();
    for (const nodes of cluster) {
      for (const n of nodes) clusterDigits.add(decodeDigit(n));
    }
    if (clusterDigits.size < 2) continue;

    const allNodes = [...cluster[0], ...cluster[1]];
    const patternCells = [...new Set(allNodes.map(decodeCell))];

    // ── Rule 1: Same color, same cell, two digits → contradiction ──
    for (const colorIdx of [0, 1] as const) {
      const group = cluster[colorIdx];
      const cellToDigits = new Map<number, number[]>();
      for (const n of group) {
        const cell = decodeCell(n);
        if (!cellToDigits.has(cell)) cellToDigits.set(cell, []);
        cellToDigits.get(cell)!.push(decodeDigit(n));
      }

      for (const [cell, digits] of cellToDigits) {
        if (digits.length >= 2) {
          // This color is false → eliminate all candidates of this color
          const actions: DetectionAction[] = [];
          for (const n of group) {
            const c = decodeCell(n);
            const d = decodeDigit(n);
            if (board.hasCandidate(c, d)) {
              actions.push({ kind: 'eliminate', cell: c, digit: d });
            }
          }
          if (actions.length > 0) {
            return {
              technique: 'medusa_3d',
              actions,
              patternCells,
              description: `3D Medusa (Rule 1: same-cell same-color conflict): ${cellRef(cell)} has two digits same color, eliminate color ${colorIdx}, ${actions.length} candidates`,
            };
          }
        }
      }
    }

    // ── Rule 2: Same color, same digit, same unit → contradiction ──
    for (const colorIdx of [0, 1] as const) {
      const group = cluster[colorIdx];

      // Group by digit
      const digitToCells = new Map<number, number[]>();
      for (const n of group) {
        const d = decodeDigit(n);
        const c = decodeCell(n);
        if (!digitToCells.has(d)) digitToCells.set(d, []);
        digitToCells.get(d)!.push(c);
      }

      for (const [d, cells] of digitToCells) {
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            if (board.seesCell(cells[i], cells[j])) {
              // Same color, same digit, same unit → contradiction
              const actions: DetectionAction[] = [];
              for (const n of group) {
                const c = decodeCell(n);
                const dig = decodeDigit(n);
                if (board.hasCandidate(c, dig)) {
                  actions.push({ kind: 'eliminate', cell: c, digit: dig });
                }
              }
              if (actions.length > 0) {
                return {
                  technique: 'medusa_3d',
                  actions,
                  patternCells,
                  description: `3D Medusa (Rule 2: same-color same-digit same-unit): digit ${d}, ${cellRef(cells[i])} and ${cellRef(cells[j])} conflict, eliminate ${actions.length} candidates`,
                };
              }
            }
          }
        }
      }
    }

    // ── Rule 3: Uncolored cell sees both colors for same digit → eliminate ──
    {
      const actions: DetectionAction[] = [];
      // Build lookup: for each digit, which cells have color 0 / color 1
      const digitColor: Map<number, [number[], number[]]> = new Map();
      for (const n of allNodes) {
        const d = decodeDigit(n);
        const c = decodeCell(n);
        const col = color.get(n)!;
        if (!digitColor.has(d)) digitColor.set(d, [[], []]);
        digitColor.get(d)![col].push(c);
      }

      for (const [d, [c0cells, c1cells]] of digitColor) {
        if (c0cells.length === 0 || c1cells.length === 0) continue;
        const bit = digitBit(d);

        for (const cell of board.emptyCells) {
          if ((board.candidates[cell] & bit) === 0) continue;
          // Skip if this cell+digit is already colored
          if (color.has(encode(cell, d))) continue;

          const sees0 = c0cells.some(c => board.seesCell(cell, c));
          const sees1 = c1cells.some(c => board.seesCell(cell, c));
          if (sees0 && sees1) {
            actions.push({ kind: 'eliminate', cell, digit: d });
          }
        }
      }

      if (actions.length > 0) {
        return {
          technique: 'medusa_3d',
          actions,
          patternCells,
          description: `3D Medusa (Rule 3: both-color visible): uncolored cell sees both colors of same digit, eliminate ${actions.length} candidates`,
        };
      }
    }

    // ── Rule 5: Uncolored bivalue cell, both candidates seen by same color → eliminate both ──
    {
      const actions: DetectionAction[] = [];
      for (const cell of board.bivalueCells) {
        const digits = bitsToDigits(board.candidates[cell]);
        if (digits.length !== 2) continue;
        // Skip if any (cell, digit) is already colored
        if (color.has(encode(cell, digits[0])) || color.has(encode(cell, digits[1]))) continue;

        // For each color, check if both digits are "seen" by that color
        for (const colorIdx of [0, 1] as const) {
          const group = cluster[colorIdx];
          let seesD0 = false, seesD1 = false;

          for (const n of group) {
            const c = decodeCell(n);
            const d = decodeDigit(n);
            if (!board.seesCell(cell, c)) continue;
            if (d === digits[0]) seesD0 = true;
            if (d === digits[1]) seesD1 = true;
          }

          if (seesD0 && seesD1) {
            // Both candidates eliminated → cell has no value, contradiction for this color
            // Actually: this means both candidates are false → we can eliminate both
            for (const d of digits) {
              if (board.hasCandidate(cell, d)) {
                actions.push({ kind: 'eliminate', cell, digit: d });
              }
            }
            break;
          }
        }
      }

      if (actions.length > 0) {
        return {
          technique: 'medusa_3d',
          actions,
          patternCells,
          description: `3D Medusa (Rule 5: bivalue cell double kill): uncolored bivalue cell both candidates covered by same color, eliminate ${actions.length} candidates`,
        };
      }
    }

    // ── Rule 4: Uncolored candidate, all units containing it have that digit covered by both colors ──
    {
      const actions: DetectionAction[] = [];

      for (const cell of board.emptyCells) {
        const cands = bitsToDigits(board.candidates[cell]);
        for (const d of cands) {
          if (color.has(encode(cell, d))) continue;

          // For each unit containing this cell, check if both colors have digit d in that unit
          const units = SolverBoard.CELL_UNITS[cell];
          let allUnitsCovered = true;

          for (const unitIdx of units) {
            const unitCells = SolverBoard.ALL_UNITS[unitIdx];
            let hasColor0 = false, hasColor1 = false;

            for (const uc of unitCells) {
              const node = encode(uc, d);
              if (!color.has(node)) continue;
              if (color.get(node) === 0) hasColor0 = true;
              if (color.get(node) === 1) hasColor1 = true;
            }

            if (!hasColor0 || !hasColor1) {
              allUnitsCovered = false;
              break;
            }
          }

          if (allUnitsCovered) {
            actions.push({ kind: 'eliminate', cell, digit: d });
          }
        }
      }

      if (actions.length > 0) {
        return {
          technique: 'medusa_3d',
          actions,
          patternCells,
          description: `3D Medusa (Rule 4: full coverage): candidate covered by both colors in all related units, eliminate ${actions.length} candidates`,
        };
      }
    }
  }

  return null;
}
