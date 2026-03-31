#!/usr/bin/env /usr/local/bin/npx tsx
/**
 * Generate puzzles where Exocet or Death Blossom is detected.
 *
 * Strategy: Place exocet_death_blossom detector early in the registry
 * (after Phase 1 basics only) so it fires before simpler Phase 2 techniques
 * when the pattern is present.
 *
 * All generated puzzles: source "self-generated-no-third-party"
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { SolverBoard } from '../src/solver/board';
import type { DetectionResult, DetectorFn } from '../src/solver/types';

// Import all detectors
import { detectNakedSingle } from '../src/solver/detectors/phase1/nakedSingle';
import { detectHiddenSingle } from '../src/solver/detectors/phase1/hiddenSingle';
import { detectLockedCandidates } from '../src/solver/detectors/phase1/lockedCandidates';
import { detectNakedPair } from '../src/solver/detectors/phase1/nakedPair';
import { detectHiddenPair } from '../src/solver/detectors/phase1/hiddenPair';
import { detectNakedTriple } from '../src/solver/detectors/phase1/nakedTriple';
import { detectHiddenTriple } from '../src/solver/detectors/phase1/hiddenTriple';
import { detectExocetDeathBlossom } from '../src/solver/detectors/phase3/exocetDeathBlossom';
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
import { detectXyChain } from '../src/solver/detectors/phase3/xyChain';
import { detectDiscontinuousNiceLoop } from '../src/solver/detectors/phase3/discontinuousNiceLoop';
import { detectCellForcingChain } from '../src/solver/detectors/phase3/cellForcingChain';
import { detectRegionForcingChain } from '../src/solver/detectors/phase3/regionForcingChain';
import { detectTemplate } from '../src/solver/detectors/phase3/template';
import { detectAlsXy } from '../src/solver/detectors/phase3/alsXy';
import { detectAlsWWing } from '../src/solver/detectors/phase3/alsWWing';
import { detectSueDeCoq } from '../src/solver/detectors/phase3/sueDeCoq';
import { detectDeathBlossom } from '../src/solver/detectors/phase3/deathBlossom';

// Registry with Exocet/Death Blossom right after Phase 1
const EXOCET_PRIORITY_REGISTRY: DetectorFn[] = [
  // Phase 1
  detectNakedSingle, detectHiddenSingle, detectLockedCandidates,
  detectNakedPair, detectHiddenPair, detectNakedTriple, detectHiddenTriple,
  // ← Exocet + Death Blossom here, before Phase 2
  detectExocetDeathBlossom,
  // Phase 2
  detectXWing, detectSkyscraper, detectFinnedXWing,
  detectXYWing, detectXYZWing, detectWWing, detectUniqueRectangle,
  detectXCycleSimpleColoring, detectSwordfish, detectFinnedSwordfish,
  detectRemotePairs, detectTwoStringKite, detectEmptyRectangle, detectBugPlusOne,
  detectJellyfish, detectFinnedJellyfish,
  // Phase 3
  detectAic, detectAicMidChain, detectGroupedAicNiceLoop, detectAicLongChain,
  detectAlsXz, detectAlsChain, detectForcingChainNet,
  detectXyChain, detectDiscontinuousNiceLoop, detectCellForcingChain,
  detectRegionForcingChain, detectTemplate, detectAlsXy, detectAlsWWing,
  detectSueDeCoq, detectDeathBlossom,
];

const WEIGHT: Record<string, number> = {
  naked_single: 1, hidden_single: 2, locked_candidates: 3,
  naked_pair: 4, hidden_pair: 5, naked_triple: 6, hidden_triple: 7,
  exocet_death_blossom: 36,
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

function classifyPuzzle(puzzle: number[], solution: number[]): {
  maxTechnique: string; counts: Record<string, number>;
  singleRatio: number; difficultyScore: number;
  usesExocet: boolean;
} | null {
  const cells = buildCells(puzzle);
  const counts: Record<string, number> = {};
  let maxW = 0, maxTech = 'naked_single';
  let usesExocet = false;

  for (let step = 0; step < 500; step++) {
    if (cells.every(c => c.value !== 0)) break;
    const board = SolverBoard.fromGameState(cells);
    let found = false;
    for (const detector of EXOCET_PRIORITY_REGISTRY) {
      const result = detector(board);
      if (!result) continue;
      const tech = result.technique as string;
      counts[tech] = (counts[tech] || 0) + 1;
      const w = WEIGHT[tech] || 15;
      if (w > maxW) { maxW = w; maxTech = tech; }
      if (tech === 'exocet_death_blossom') usesExocet = true;

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
      found = true; break;
    }
    if (!found) return null;
  }
  if (!cells.every((c, i) => c.value === solution[i])) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const singles = (counts['naked_single'] || 0) + (counts['hidden_single'] || 0);
  return {
    maxTechnique: maxTech, counts,
    singleRatio: total > 0 ? +(singles / total).toFixed(4) : 0,
    difficultyScore: maxW * total,
    usesExocet,
  };
}

// ── Main ──
const TARGET = 40;
const collected: Array<{
  puzzle: number[]; solution: number[];
  maxTechnique: string; difficultyScore: number;
  singleRatio: number; counts: Record<string, number>;
}> = [];

const allKeys = new Set<string>();
const existing = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
for (const l of existing) allKeys.add(l.puzzle.join(''));

const BATCH_SIZE = 500;
const MAX_BATCHES = 5000;

console.log('Target: exocet_death_blossom × ' + TARGET);
console.log('Exocet placed after Phase 1 (before all Phase 2)');
console.log('Existing puzzles:', allKeys.size);

let batch = 0;
let totalGenerated = 0;
let totalClassified = 0;
let totalExocet = 0;
const startTime = Date.now();

while (collected.length < TARGET && batch < MAX_BATCHES) {
  batch++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  process.stdout.write(`\r[${elapsed}s] Batch ${batch} | exocet:${collected.length}/${TARGET} | classified:${totalClassified} | total generated:${totalGenerated}    `);

  let puzzles: Array<{ puzzle: number[]; solution: number[] }>;
  try {
    const out = execSync(`python3 scripts/gen_puzzles.py ${BATCH_SIZE}`, {
      encoding: 'utf8', timeout: 120000, cwd: process.cwd(),
    });
    puzzles = JSON.parse(out);
  } catch { continue; }
  totalGenerated += puzzles.length;

  for (const p of puzzles) {
    if (collected.length >= TARGET) break;
    const key = p.puzzle.join('');
    if (allKeys.has(key)) continue;

    const result = classifyPuzzle(p.puzzle, p.solution);
    if (!result) continue;
    totalClassified++;

    if (result.usesExocet) {
      totalExocet++;
      allKeys.add(key);
      collected.push({
        puzzle: p.puzzle, solution: p.solution,
        maxTechnique: 'exocet_death_blossom',
        difficultyScore: result.difficultyScore,
        singleRatio: result.singleRatio,
        counts: result.counts,
      });
    }
  }
}

console.log('\n\n=== Results ===');
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`Time: ${elapsed}s | Batches: ${batch}`);
console.log(`Generated: ${totalGenerated} | Classified: ${totalClassified} | Exocet found: ${totalExocet}`);
console.log(`Exocet rate: ${totalClassified > 0 ? (totalExocet / totalClassified * 100).toFixed(2) : 0}%`);
console.log(`Collected: ${collected.length}/${TARGET}`);

if (collected.length > 0) {
  fs.writeFileSync('generated-exocet-puzzles.json', JSON.stringify(collected, null, 2));
  console.log('Saved to generated-exocet-puzzles.json');
}
