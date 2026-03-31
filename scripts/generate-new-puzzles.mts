#!/usr/bin/env /usr/local/bin/npx tsx
/**
 * Generate genuinely new sudoku puzzles for finned_x_wing and skyscraper.
 *
 * Pipeline: Python (sudokutools) → TS solver classification → filter
 *
 * For skyscraper: we check skyscraper detector BEFORE finned_x_wing
 * to avoid finned_x_wing intercepting skyscraper-solvable puzzles.
 *
 * All generated puzzles marked source: "self-generated-no-third-party"
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { SolverBoard } from '../src/solver/board';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import type { DetectionResult } from '../src/solver/types';

// ── Import individual detectors for custom ordering ──
import { detectNakedSingle } from '../src/solver/detectors/phase1/nakedSingle';
import { detectHiddenSingle } from '../src/solver/detectors/phase1/hiddenSingle';
import { detectLockedCandidates } from '../src/solver/detectors/phase1/lockedCandidates';
import { detectNakedPair } from '../src/solver/detectors/phase1/nakedPair';
import { detectHiddenPair } from '../src/solver/detectors/phase1/hiddenPair';
import { detectNakedTriple } from '../src/solver/detectors/phase1/nakedTriple';
import { detectHiddenTriple } from '../src/solver/detectors/phase1/hiddenTriple';
import { detectXWing } from '../src/solver/detectors/phase2/xWing';
import { detectFinnedXWing } from '../src/solver/detectors/phase2/finnedXWing';
import { detectSkyscraper } from '../src/solver/detectors/phase2/skyscraper';
import { detectXYWing } from '../src/solver/detectors/phase2/xyWing';
import { detectXYZWing } from '../src/solver/detectors/phase2/xyzWing';
import { detectWWing } from '../src/solver/detectors/phase2/wWing';
import { detectUniqueRectangle } from '../src/solver/detectors/phase2/uniqueRectangle';
import { detectXCycleSimpleColoring } from '../src/solver/detectors/phase2/xCycleSimpleColoring';
import { detectSwordfish } from '../src/solver/detectors/phase2/swordfish';
import { detectFinnedSwordfish } from '../src/solver/detectors/phase2/finnedSwordfish';
import { detectRemotePairs } from '../src/solver/detectors/phase2/remotePairs';
import { detectTwoStringKite } from '../src/solver/detectors/phase2/twoStringKite';
import { detectEmptyRectangle } from '../src/solver/detectors/phase2/emptyRectangle';
import { detectBugPlusOne } from '../src/solver/detectors/phase2/bugPlusOne';
import { detectJellyfish } from '../src/solver/detectors/phase2/jellyfish';
import { detectFinnedJellyfish } from '../src/solver/detectors/phase2/finnedJellyfish';
import { detectAic } from '../src/solver/detectors/phase3/aic';
import { detectAicMidChain } from '../src/solver/detectors/phase3/aicMidChain';
import { detectGroupedAicNiceLoop } from '../src/solver/detectors/phase3/groupedAicNiceLoop';
import { detectAicLongChain } from '../src/solver/detectors/phase3/aicLongChain';
import { detectAlsXz } from '../src/solver/detectors/phase3/alsXz';
import { detectAlsChain } from '../src/solver/detectors/phase3/alsChain';
import { detectForcingChainNet } from '../src/solver/detectors/phase3/forcingChainNet';
import { detectExocetDeathBlossom } from '../src/solver/detectors/phase3/exocetDeathBlossom';
import { detectXyChain } from '../src/solver/detectors/phase3/xyChain';
import { detectDiscontinuousNiceLoop } from '../src/solver/detectors/phase3/discontinuousNiceLoop';
import { detectCellForcingChain } from '../src/solver/detectors/phase3/cellForcingChain';
import { detectRegionForcingChain } from '../src/solver/detectors/phase3/regionForcingChain';
import { detectTemplate } from '../src/solver/detectors/phase3/template';
import { detectAlsXy } from '../src/solver/detectors/phase3/alsXy';
import { detectAlsWWing } from '../src/solver/detectors/phase3/alsWWing';
import { detectSueDeCoq } from '../src/solver/detectors/phase3/sueDeCoq';
import { detectDeathBlossom } from '../src/solver/detectors/phase3/deathBlossom';
import type { DetectorFn } from '../src/solver/types';

// Custom registry: skyscraper BEFORE finned_x_wing
const CUSTOM_REGISTRY: DetectorFn[] = [
  detectNakedSingle, detectHiddenSingle, detectLockedCandidates,
  detectNakedPair, detectHiddenPair, detectNakedTriple, detectHiddenTriple,
  detectXWing,
  detectSkyscraper,       // ← moved before finned_x_wing
  detectFinnedXWing,
  detectXYWing, detectXYZWing, detectWWing, detectUniqueRectangle,
  detectXCycleSimpleColoring, detectSwordfish, detectFinnedSwordfish,
  detectRemotePairs, detectTwoStringKite, detectEmptyRectangle, detectBugPlusOne,
  detectJellyfish, detectFinnedJellyfish,
  detectAic, detectAicMidChain, detectGroupedAicNiceLoop, detectAicLongChain,
  detectAlsXz, detectAlsChain, detectForcingChainNet, detectExocetDeathBlossom,
  detectXyChain, detectDiscontinuousNiceLoop, detectCellForcingChain,
  detectRegionForcingChain, detectTemplate, detectAlsXy, detectAlsWWing,
  detectSueDeCoq, detectDeathBlossom,
];

const WEIGHT: Record<string, number> = {
  naked_single: 1, hidden_single: 2, locked_candidates: 3,
  naked_pair: 4, hidden_pair: 5, naked_triple: 6, hidden_triple: 7,
  x_wing: 10, unique_rectangle: 11, bug_plus_one: 11,
  skyscraper: 12, two_string_kite: 12, empty_rectangle: 12,
  finned_x_wing: 13, xy_wing: 13, xyz_wing: 14, w_wing: 13, remote_pairs: 13,
  swordfish: 15, x_cycle_simple_coloring: 15,
  finned_swordfish: 16, jellyfish: 17, finned_jellyfish: 18,
  aic: 20, aic_mid_chain: 21, xy_chain: 20,
  aic_long_chain: 22, grouped_aic_nice_loop: 22, discontinuous_nice_loop: 22,
  als_xz: 25, als_xy: 25, als_w_wing: 25, als_chain: 26,
  forcing_chain_net: 28, cell_forcing_chain: 28, region_forcing_chain: 28,
  template: 30, sue_de_coq: 30,
  death_blossom: 35, exocet_death_blossom: 36,
};

interface CellState { value: number; fixed: boolean; notes: number[]; isError: boolean; }

function buildCells(puzzle: number[]): CellState[] {
  return puzzle.map((v, i) => {
    if (v !== 0) return { value: v, fixed: true, notes: [], isError: false };
    const r = Math.floor(i / 9), c = i % 9;
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
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

function applyActions(cells: CellState[], result: DetectionResult): void {
  for (const a of result.actions) {
    if (a.kind === 'fill') {
      cells[a.cell].value = a.digit; cells[a.cell].notes = [];
      const r = Math.floor(a.cell / 9), c = a.cell % 9;
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let j = 0; j < 9; j++) {
        cells[r * 9 + j].notes = cells[r * 9 + j].notes.filter(d => d !== a.digit);
        cells[j * 9 + c].notes = cells[j * 9 + c].notes.filter(d => d !== a.digit);
        cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes =
          cells[(br + Math.floor(j / 3)) * 9 + (bc + j % 3)].notes.filter(d => d !== a.digit);
      }
    } else {
      cells[a.cell].notes = cells[a.cell].notes.filter(d => d !== a.digit);
    }
  }
}

function classifyPuzzle(puzzle: number[], solution: number[]): {
  maxTechnique: string; counts: Record<string, number>;
  singleRatio: number; difficultyScore: number;
} | null {
  const cells = buildCells(puzzle);
  const counts: Record<string, number> = {};
  let maxW = 0, maxTech = 'naked_single';

  for (let step = 0; step < 500; step++) {
    if (cells.every(c => c.value !== 0)) break;
    const board = SolverBoard.fromGameState(cells);
    let found = false;
    for (const detector of CUSTOM_REGISTRY) {
      const result = detector(board);
      if (!result) continue;
      const tech = result.technique as string;
      counts[tech] = (counts[tech] || 0) + 1;
      const w = WEIGHT[tech] || 15;
      if (w > maxW) { maxW = w; maxTech = tech; }
      applyActions(cells, result);
      found = true; break;
    }
    if (!found) return null;
  }
  if (!cells.every((c, i) => c.value === solution[i])) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const singles = (counts['naked_single'] || 0) + (counts['hidden_single'] || 0);
  return { maxTechnique: maxTech, counts, singleRatio: total > 0 ? +(singles / total).toFixed(4) : 0, difficultyScore: maxW * total };
}

// ── Main ──
const TARGETS: Record<string, number> = { finned_x_wing: 40, skyscraper: 40 };
const collected: Record<string, Array<{
  puzzle: number[]; solution: number[];
  maxTechnique: string; difficultyScore: number;
  singleRatio: number; counts: Record<string, number>;
}>> = { finned_x_wing: [], skyscraper: [] };

const allKeys = new Set<string>();
const existing = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
for (const l of existing) allKeys.add(l.puzzle.join(''));

const allDone = () => Object.entries(TARGETS).every(([t, n]) => collected[t].length >= n);
const BATCH_SIZE = 500;
const MAX_BATCHES = 3000;

console.log('Targets: finned_x_wing(40), skyscraper(40)');
console.log('Using custom detector order (skyscraper before finned_x_wing)');
console.log('Existing puzzles:', allKeys.size);

let batch = 0;
const startTime = Date.now();

while (!allDone() && batch < MAX_BATCHES) {
  batch++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const status = Object.entries(TARGETS).map(([t, n]) => `${t}:${collected[t].length}/${n}`).join(' ');
  process.stdout.write(`\r[${elapsed}s] Batch ${batch} | ${status}    `);

  let puzzles: Array<{ puzzle: number[]; solution: number[] }>;
  try {
    const out = execSync(`python3 scripts/gen_puzzles.py ${BATCH_SIZE}`, {
      encoding: 'utf8', timeout: 120000, cwd: process.cwd(),
    });
    puzzles = JSON.parse(out);
  } catch { continue; }

  for (const p of puzzles) {
    if (allDone()) break;
    const key = p.puzzle.join('');
    if (allKeys.has(key)) continue;
    const result = classifyPuzzle(p.puzzle, p.solution);
    if (!result) continue;
    const tech = result.maxTechnique;
    if (tech in TARGETS && collected[tech].length < TARGETS[tech]) {
      allKeys.add(key);
      collected[tech].push({ puzzle: p.puzzle, solution: p.solution, ...result });
    }
  }
}

console.log('\n\n=== Results ===');
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`Time: ${elapsed}s | Batches: ${batch}`);
for (const [tech, puzzles] of Object.entries(collected)) {
  console.log(`  ${tech}: ${puzzles.length}/${TARGETS[tech]}`);
}

fs.writeFileSync('generated-new-puzzles.json', JSON.stringify(collected, null, 2));
console.log('Saved to generated-new-puzzles.json');
