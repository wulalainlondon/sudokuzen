#!/usr/bin/env /usr/local/bin/npx tsx
/**
 * Expand world mode: bring all non-basic techniques up to 150 puzzles each.
 * Basic techniques (naked_single, hidden_single, locked_candidates, naked_pair, hidden_pair) stay as-is.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { SolverBoard } from '../src/solver/board';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import type { DetectorFn, DetectionResult } from '../src/solver/types';

// Import Phase 1 + all detectors for priority registry
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

// Dynamically import the target detector from registry
const DETECTOR_BY_NAME: Record<string, DetectorFn> = {};
for (const det of DETECTOR_REGISTRY) {
  // Run on a dummy board to get the technique name... instead, build from imports
}

// We'll use the full import approach
import { detectXWing } from '../src/solver/detectors/phase2/xWing';
import { detectFinnedXWing } from '../src/solver/detectors/phase2/finnedXWing';
import { detectSkyscraper } from '../src/solver/detectors/phase2/skyscraper';
import { detectXYWing } from '../src/solver/detectors/phase2/xyWing';
import { detectXYZWing } from '../src/solver/detectors/phase2/xyzWing';
import { detectWWing } from '../src/solver/detectors/phase2/wWing';
import { detectUniqueRectangle } from '../src/solver/detectors/phase2/uniqueRectangle';
import { detectXCycleSimpleColoring } from '../src/solver/detectors/phase2/xCycleSimpleColoring';
import { detectMedusa3d } from '../src/solver/detectors/phase2/medusa3d';
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

const DET_MAP: Record<string, DetectorFn> = {
  naked_triple: detectNakedTriple, hidden_triple: detectHiddenTriple,
  x_wing: detectXWing, finned_x_wing: detectFinnedXWing, skyscraper: detectSkyscraper,
  xy_wing: detectXYWing, xyz_wing: detectXYZWing, w_wing: detectWWing,
  unique_rectangle: detectUniqueRectangle, x_cycle_simple_coloring: detectXCycleSimpleColoring,
  medusa_3d: detectMedusa3d, swordfish: detectSwordfish, finned_swordfish: detectFinnedSwordfish,
  remote_pairs: detectRemotePairs, two_string_kite: detectTwoStringKite,
  empty_rectangle: detectEmptyRectangle, bug_plus_one: detectBugPlusOne,
  jellyfish: detectJellyfish, finned_jellyfish: detectFinnedJellyfish,
  aic: detectAic, aic_mid_chain: detectAicMidChain,
  grouped_aic_nice_loop: detectGroupedAicNiceLoop, aic_long_chain: detectAicLongChain,
  als_xz: detectAlsXz, als_chain: detectAlsChain, forcing_chain_net: detectForcingChainNet,
  exocet_death_blossom: detectExocetDeathBlossom, xy_chain: detectXyChain,
  discontinuous_nice_loop: detectDiscontinuousNiceLoop, cell_forcing_chain: detectCellForcingChain,
  region_forcing_chain: detectRegionForcingChain, template: detectTemplate,
  als_xy: detectAlsXy, als_w_wing: detectAlsWWing, sue_de_coq: detectSueDeCoq,
  death_blossom: detectDeathBlossom,
};

const TECH_TIER: Record<string, string> = {
  naked_single:'T01',hidden_single:'T01',locked_candidates:'T02',naked_pair:'T02',hidden_pair:'T02',
  naked_triple:'T03',hidden_triple:'T03',x_wing:'T04',unique_rectangle:'T04',bug_plus_one:'T04',
  skyscraper:'T05',two_string_kite:'T05',empty_rectangle:'T05',finned_x_wing:'T05',
  xy_wing:'T05',xyz_wing:'T05',w_wing:'T05',remote_pairs:'T05',
  swordfish:'T06',x_cycle_simple_coloring:'T06',medusa_3d:'T06',
  finned_swordfish:'T06',jellyfish:'T06',finned_jellyfish:'T06',
  aic:'T07',aic_mid_chain:'T07',xy_chain:'T07',
  aic_long_chain:'T08',grouped_aic_nice_loop:'T08',discontinuous_nice_loop:'T08',
  als_xz:'T09',als_xy:'T09',als_w_wing:'T09',als_chain:'T09',
  forcing_chain_net:'T10',cell_forcing_chain:'T10',region_forcing_chain:'T10',
  template:'T11',sue_de_coq:'T11',death_blossom:'T12',exocet_death_blossom:'T12',
};

const KEEP = new Set(['naked_single','hidden_single','locked_candidates','naked_pair','hidden_pair']);
const TARGET = 150;
const BATCH_SIZE = 500;

// ── Main ──
const data = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const allKeys = new Set<string>(data.map((l: unknown) => l.puzzle.join('')));
let maxId = Math.max(...data.map((l: unknown) => l.id));

const world = data.filter((l: unknown) => l.mode === 'world');
const byTech: Record<string, number> = {};
world.forEach((l: unknown) => { byTech[l.maxTechnique] = (byTech[l.maxTechnique] || 0) + 1; });

// Find techniques that need more puzzles
const toGenerate: Array<{ tech: string; needed: number }> = [];
for (const [tech, det] of Object.entries(DET_MAP)) {
  if (KEEP.has(tech)) continue;
  const current = byTech[tech] || 0;
  const needed = TARGET - current;
  if (needed > 0) toGenerate.push({ tech, needed });
}

console.log(`Expanding world mode: ${toGenerate.length} techniques need puzzles`);
const totalNeeded = toGenerate.reduce((a, b) => a + b.needed, 0);
console.log(`Total puzzles to generate: ${totalNeeded}\n`);

const startTime = Date.now();
let totalGenerated = 0;

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

// Process all techniques in parallel batches - classify once, distribute to all
const collected: Record<string, Array<{ puzzle: number[]; solution: number[]; score: number; ratio: number }>> = {};
for (const { tech } of toGenerate) collected[tech] = [];

const allDone = () => toGenerate.every(({ tech, needed }) => collected[tech].length >= needed);
let batch = 0;

while (!allDone() && batch < 10000) {
  batch++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const remaining = toGenerate.map(({ tech, needed }) => `${tech}:${collected[tech].length}/${needed}`);
  const done = toGenerate.filter(({ tech, needed }) => collected[tech].length >= needed).length;
  process.stdout.write(`\r[${elapsed}s] Batch ${batch} | ${done}/${toGenerate.length} techs done | total:${totalGenerated}    `);

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

    // For each technique that still needs puzzles, try with priority registry
    for (const { tech, needed } of toGenerate) {
      if (collected[tech].length >= needed) continue;

      const det = DET_MAP[tech];
      if (!det) continue;

      const cells = buildCells(p.puzzle);
      const registry: DetectorFn[] = [...PHASE1, det, ...DETECTOR_REGISTRY.filter(d => d !== det)];

      let usesIt = false, ok = true;
      const counts: Record<string, number> = {};
      for (let step = 0; step < 300; step++) {
        if (cells.every(c => c.value !== 0)) break;
        const board = SolverBoard.fromGameState(cells);
        let found = false;
        for (const detector of registry) {
          const result = detector(board);
          if (!result) continue;
          const t = result.technique as string;
          counts[t] = (counts[t] || 0) + 1;
          if (t === tech) usesIt = true;
          for (const a of result.actions) {
            if (a.kind === 'fill') {
              cells[a.cell].value = a.digit; cells[a.cell].notes = [];
              const r = Math.floor(a.cell / 9), c = a.cell % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
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
        if (!found) { ok = false; break; }
      }

      if (ok && usesIt && cells.every((c, i) => c.value === p.solution[i])) {
        allKeys.add(key);
        const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);
        const singles = (counts['naked_single'] || 0) + (counts['hidden_single'] || 0);
        collected[tech].push({
          puzzle: p.puzzle, solution: p.solution,
          score: total * 10,
          ratio: total > 0 ? +(singles / total).toFixed(4) : 0,
        });
        totalGenerated++;
        break; // This puzzle is claimed by this technique
      }
    }
  }
}

// Add all collected puzzles to data
for (const { tech } of toGenerate) {
  const existing = data.find((l: unknown) => l.mode === 'world' && l.maxTechnique === tech);
  const diffName = existing?.difficultyName || tech;
  const stars = existing?.stars || 10;

  for (let i = 0; i < collected[tech].length; i++) {
    maxId++;
    const np = collected[tech][i];
    data.push({
      id: maxId,
      stars,
      difficultyName: diffName,
      displayName: `${diffName}-${String((byTech[tech] || 0) + i + 1).padStart(3, '0')}`,
      puzzle: np.puzzle,
      solution: np.solution,
      maxTechnique: tech,
      techTier: TECH_TIER[tech] || 'T06',
      difficultyScore: np.score,
      logicSolvable: true,
      singleRatio: np.ratio,
      mode: 'world',
      source: 'self-generated-no-third-party',
    });
  }
}

fs.writeFileSync('levels-data.json', JSON.stringify(data, null, 2), 'utf8');

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n=== Done in ${elapsed}s ===`);
console.log(`Generated: ${totalGenerated} puzzles`);

const final = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const finalWorld = final.filter((l: unknown) => l.mode === 'world');
const finalByTech: Record<string, number> = {};
finalWorld.forEach((l: unknown) => { finalByTech[l.maxTechnique] = (finalByTech[l.maxTechnique] || 0) + 1; });

console.log(`\nWorld total: ${finalWorld.length}`);
console.log('\nPer technique:');
for (const [t, c] of Object.entries(finalByTech).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${t}: ${c}`);
}

const byMode: Record<string, number> = {};
final.forEach((l: unknown) => { byMode[l.mode] = (byMode[l.mode] || 0) + 1; });
console.log('\nBy mode:', JSON.stringify(byMode));
console.log('Grand total:', final.length);
