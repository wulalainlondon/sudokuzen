#!/usr/bin/env npx tsx
/**
 * Batch-generate puzzles for ALL techniques that need more pool content.
 * Pipeline: Python (sudokutools) → TS solver classification → append to generated/*.json
 *
 * Run: npx tsx scripts/batch-gen-all.mts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { SolverBoard } from '../src/solver/board';
import type { DetectionResult, DetectorFn } from '../src/solver/types';

// ── Import detectors ──
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

const REGISTRY: DetectorFn[] = [
  detectNakedSingle, detectHiddenSingle, detectLockedCandidates,
  detectNakedPair, detectHiddenPair, detectNakedTriple, detectHiddenTriple,
  detectXWing, detectSkyscraper, detectFinnedXWing,
  detectXYWing, detectXYZWing, detectWWing, detectUniqueRectangle,
  detectXCycleSimpleColoring, detectSwordfish, detectFinnedSwordfish,
  detectRemotePairs, detectTwoStringKite, detectEmptyRectangle, detectBugPlusOne,
  detectJellyfish, detectFinnedJellyfish,
  detectAic, detectAicMidChain, detectGroupedAicNiceLoop, detectAicLongChain,
  detectAlsXz, detectAlsChain,
];

const WEIGHT: Record<string, number> = {
  naked_single: 1, hidden_single: 2, locked_candidates: 3,
  naked_pair: 4, hidden_pair: 5, naked_triple: 6, hidden_triple: 7,
  x_wing: 10, unique_rectangle: 11, bug_plus_one: 11,
  skyscraper: 12, two_string_kite: 12, empty_rectangle: 12,
  finned_x_wing: 13, xy_wing: 13, xyz_wing: 14, w_wing: 13, remote_pairs: 13,
  swordfish: 15, x_cycle_simple_coloring: 15,
  finned_swordfish: 16, jellyfish: 17, finned_jellyfish: 18,
  aic: 20, aic_mid_chain: 21,
  aic_long_chain: 22, grouped_aic_nice_loop: 22,
  als_xz: 25, als_chain: 26,
};

// ── Targets: technique → number of NEW puzzles needed ──
// Phase 3+ (aic, als, jellyfish, bug_plus_one etc.) excluded — hit rate <0.001%
// with random generation. Their existing 25 puzzles are sufficient for endgame
// encounter frequency (~15-30 encounters per technique).
const TARGETS: Record<string, number> = {
  hidden_triple: 58,
  remote_pairs: 13,
};

interface PuzzleEntry {
  puzzle: number[];
  solution: number[];
  difficulty_score: number;
  max_technique: string;
  counts: Record<string, number>;
  clue_count: number;
}

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
    return { value: 0, fixed: false, notes: [1,2,3,4,5,6,7,8,9].filter(d => !used.has(d)), isError: false };
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
    for (const detector of REGISTRY) {
      const result = detector(board);
      if (!result) continue;
      const tech = result.technique as string;
      counts[tech] = (counts[tech] || 0) + 1;
      const w = WEIGHT[tech] || 15;
      if (w > maxW) { maxW = w; maxTech = tech; }
      applyActions(cells, result);
      found = true; break;
    }
    if (!found) return null; // unsolvable by our detectors
  }
  if (!cells.every((c, i) => c.value === solution[i])) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const singles = (counts['naked_single'] || 0) + (counts['hidden_single'] || 0);
  return { maxTechnique: maxTech, counts, singleRatio: total > 0 ? +(singles / total).toFixed(4) : 0, difficultyScore: maxW * total };
}

// ── Dedup: load existing puzzle fingerprints ──
const existingKeys = new Set<string>();
const genDir = 'public/generated';
for (const file of fs.readdirSync(genDir)) {
  if (!file.endsWith('.json')) continue;
  try {
    const data: PuzzleEntry[] = JSON.parse(fs.readFileSync(`${genDir}/${file}`, 'utf8'));
    for (const p of data) existingKeys.add(p.puzzle.join(''));
  } catch {}
}
console.log(`Loaded ${existingKeys.size} existing puzzle fingerprints for dedup.`);

// ── Collection ──
const collected: Record<string, PuzzleEntry[]> = {};
for (const key of Object.keys(TARGETS)) collected[key] = [];

const allDone = () => Object.entries(TARGETS).every(([t, n]) => collected[t].length >= n);
const remaining = () => {
  let r = 0;
  for (const [t, n] of Object.entries(TARGETS)) r += Math.max(0, n - collected[t].length);
  return r;
};

const BATCH_SIZE = 500;
const MAX_BATCHES = 20000;
const startTime = Date.now();
let totalGenerated = 0;
let totalClassified = 0;
let batch = 0;

console.log(`\nTarget: ${Object.values(TARGETS).reduce((a, b) => a + b, 0)} new puzzles across ${Object.keys(TARGETS).length} techniques`);
console.log(`Batch size: ${BATCH_SIZE}, max batches: ${MAX_BATCHES}\n`);

while (!allDone() && batch < MAX_BATCHES) {
  batch++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const left = remaining();
  process.stdout.write(`\r[${elapsed}s] Batch ${batch} | ${left} remaining | generated: ${totalGenerated} classified: ${totalClassified}    `);

  // Print progress every 50 batches
  if (batch % 50 === 0) {
    console.log();
    for (const [t, n] of Object.entries(TARGETS)) {
      const got = collected[t].length;
      if (got < n) console.log(`  ${t}: ${got}/${n}`);
    }
  }

  let puzzles: Array<{ puzzle: number[]; solution: number[] }>;
  try {
    const out = execSync(`python3 scripts/gen_puzzles.py ${BATCH_SIZE}`, {
      encoding: 'utf8', timeout: 120000, cwd: process.cwd(),
    });
    puzzles = JSON.parse(out);
  } catch { continue; }

  totalGenerated += puzzles.length;

  for (const p of puzzles) {
    if (allDone()) break;
    const key = p.puzzle.join('');
    if (existingKeys.has(key)) continue;

    const result = classifyPuzzle(p.puzzle, p.solution);
    if (!result) continue;
    totalClassified++;

    const tech = result.maxTechnique;
    if (!(tech in TARGETS)) continue;
    if (collected[tech].length >= TARGETS[tech]) continue;

    existingKeys.add(key);
    const entry: PuzzleEntry = {
      puzzle: p.puzzle,
      solution: p.solution,
      difficulty_score: result.difficultyScore,
      max_technique: tech,
      counts: result.counts,
      clue_count: p.puzzle.filter(v => v !== 0).length,
    };
    collected[tech].push(entry);

    // Incremental save: append to file immediately so kills don't lose data
    const filePath = `${genDir}/${tech}.json`;
    let existing: PuzzleEntry[] = [];
    try { existing = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
    existing.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(existing));
  }
}

const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\nDone in ${totalSeconds}s. Batches: ${batch}, Generated: ${totalGenerated}, Classified: ${totalClassified}\n`);

// ── Save: append to existing generated/*.json files ──
let totalAdded = 0;
for (const [tech, newPuzzles] of Object.entries(collected)) {
  if (newPuzzles.length === 0) continue;
  const filePath = `${genDir}/${tech}.json`;
  let existing: PuzzleEntry[] = [];
  try { existing = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
  const merged = [...existing, ...newPuzzles];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 0));
  console.log(`${tech}: ${existing.length} → ${merged.length} (+${newPuzzles.length})`);
  totalAdded += newPuzzles.length;
}

console.log(`\nTotal added: ${totalAdded} / ${Object.values(TARGETS).reduce((a, b) => a + b, 0)} target`);

// Report any shortfalls
const shortfalls = Object.entries(TARGETS).filter(([t, n]) => collected[t].length < n);
if (shortfalls.length > 0) {
  console.log('\nShortfalls (need more batches or rare techniques):');
  for (const [t, n] of shortfalls) {
    console.log(`  ${t}: got ${collected[t].length}/${n}`);
  }
}
