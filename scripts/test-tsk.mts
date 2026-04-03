import fs from 'fs';
import { SolverBoard } from '../src/solver/board';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import { detectTwoStringKite } from '../src/solver/detectors/phase2/twoStringKite';
import type { DetectorFn } from '../src/solver/types';

import { detectNakedSingle } from '../src/solver/detectors/phase1/nakedSingle';
import { detectHiddenSingle } from '../src/solver/detectors/phase1/hiddenSingle';
import { detectLockedCandidates } from '../src/solver/detectors/phase1/lockedCandidates';
import { detectNakedPair } from '../src/solver/detectors/phase1/nakedPair';
import { detectHiddenPair } from '../src/solver/detectors/phase1/hiddenPair';
import { detectNakedTriple } from '../src/solver/detectors/phase1/nakedTriple';
import { detectHiddenTriple } from '../src/solver/detectors/phase1/hiddenTriple';

const PHASE1: DetectorFn[] = [
  detectNakedSingle, detectHiddenSingle, detectLockedCandidates,
  detectNakedPair, detectHiddenPair, detectNakedTriple, detectHiddenTriple,
];

// Registry: TSK first after Phase 1, then rest
const registry: DetectorFn[] = [...PHASE1, detectTwoStringKite, ...DETECTOR_REGISTRY];

const puzzles = JSON.parse(fs.readFileSync('/tmp/test_puzzles.json', 'utf8'));
console.log('Testing', puzzles.length, 'puzzles');

function buildCells(puzzle: number[]) {
  return puzzle.map((v: number, i: number) => {
    if (v !== 0) return { value: v, fixed: true, notes: [] as number[], isError: false };
    const r = Math.floor(i / 9), c = i % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    const used = new Set<number>();
    for (let j = 0; j < 9; j++) {
      if (puzzle[r * 9 + j]) used.add(puzzle[r * 9 + j]);
      if (puzzle[j * 9 + c]) used.add(puzzle[j * 9 + c]);
      if (puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)])
        used.add(puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)]);
    }
    return { value: 0, fixed: false, notes: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d)), isError: false };
  });
}

let count = 0;
for (const p of puzzles) {
  const cells = buildCells(p.puzzle);
  let usesIt = false, ok = true;
  for (let step = 0; step < 300; step++) {
    if (cells.every((c: any) => c.value !== 0)) break;
    const board = SolverBoard.fromGameState(cells);
    let found = false;
    for (const det of registry) {
      const res = det(board);
      if (!res) continue;
      if (res.technique === 'two_string_kite') usesIt = true;
      for (const a of res.actions) {
        if (a.kind === 'fill') {
          cells[a.cell].value = a.digit; cells[a.cell].notes = [];
          const r = Math.floor(a.cell / 9), c = a.cell % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
          for (let j = 0; j < 9; j++) {
            cells[r * 9 + j].notes = cells[r * 9 + j].notes.filter((d: number) => d !== a.digit);
            cells[j * 9 + c].notes = cells[j * 9 + c].notes.filter((d: number) => d !== a.digit);
            cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes =
              cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes.filter((d: number) => d !== a.digit);
          }
        } else {
          cells[a.cell].notes = cells[a.cell].notes.filter((d: number) => d !== a.digit);
        }
      }
      found = true; break;
    }
    if (!found) { ok = false; break; }
  }
  if (ok && usesIt) count++;
}
console.log('two_string_kite:', count, '/', puzzles.length, '(' + (count / puzzles.length * 100).toFixed(2) + '%)');
