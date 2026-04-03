#!/usr/bin/env npx tsx
import fs from 'fs';
import { SolverBoard } from '../src/solver/board';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import type { DetectionResult } from '../src/solver/types';

const puzzles = JSON.parse(fs.readFileSync('/tmp/test_puzzles.json', 'utf8'));
console.log('Puzzles:', puzzles.length);

const techCounts: Record<string, number> = {};
let stuck = 0;

for (const p of puzzles) {
  const cells = p.puzzle.map((v: number, i: number) => {
    if (v !== 0) return { value: v, fixed: true, notes: [] as number[], isError: false };
    const r = Math.floor(i / 9), c = i % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    const used = new Set<number>();
    for (let j = 0; j < 9; j++) {
      if (p.puzzle[r * 9 + j]) used.add(p.puzzle[r * 9 + j]);
      if (p.puzzle[j * 9 + c]) used.add(p.puzzle[j * 9 + c]);
      if (p.puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)])
        used.add(p.puzzle[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)]);
    }
    return { value: 0, fixed: false, notes: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d)), isError: false };
  });

  const W: Record<string, number> = {
    naked_single: 1, hidden_single: 2, locked_candidates: 3,
    naked_pair: 4, hidden_pair: 5, naked_triple: 6, hidden_triple: 7,
    x_wing: 10, finned_x_wing: 13, skyscraper: 12,
  };
  let maxTech = 'naked_single', maxW = 0, ok = true;

  for (let step = 0; step < 300; step++) {
    if (cells.every((c: any) => c.value !== 0)) break;
    const board = SolverBoard.fromGameState(cells);
    let found = false;
    for (const det of DETECTOR_REGISTRY) {
      const res = det(board);
      if (!res) continue;
      const t = res.technique as string;
      const w = W[t] || 15;
      if (w > maxW) { maxW = w; maxTech = t; }
      for (const a of res.actions) {
        if (a.kind === 'fill') {
          cells[a.cell].value = a.digit;
          cells[a.cell].notes = [];
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
      found = true;
      break;
    }
    if (!found) { ok = false; break; }
  }
  if (ok) techCounts[maxTech] = (techCounts[maxTech] || 0) + 1;
  else stuck++;
}

console.log('Stuck:', stuck);
console.log('Technique distribution:');
for (const [t, c] of Object.entries(techCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c} (${(c / puzzles.length * 100).toFixed(1)}%)`);
}
