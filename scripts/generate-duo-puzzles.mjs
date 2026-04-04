#!/usr/bin/env node
/**
 * Generate fresh duo-exclusive puzzles with candidate metadata.
 *
 * Each puzzle gets:
 *   - givens:  number of pre-filled cells (clues)
 *   - cands:   total candidates across all empty cells at start
 *   - avgC:    average candidates per empty cell (lower = more constrained = easier)
 *
 * Tiers control clue ranges:
 *   tierI   (T01): 36-44 givens — easy, fast races
 *   tierII  (T02): 30-36 givens — moderate
 *   tierIII (T03-T04): 26-32 givens — challenging
 *   tierIV  (T05-T06): 24-28 givens — hard
 *   tierV   (T07-T12): 22-26 givens — brutal
 *
 * Usage: node scripts/generate-duo-puzzles.mjs [--count 150] [--seed duo2026]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── PRNG ─────────────────────────────────────────────────────────────

function mulberry32(a) {
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  return crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Sudoku core ──────────────────────────────────────────────────────

function possibleDigits(board, pos) {
  if (board[pos] !== 0) return [];
  const r = Math.floor(pos / 9), c = pos % 9;
  const used = new Set();
  for (let i = 0; i < 9; i++) {
    if (board[r * 9 + i]) used.add(board[r * 9 + i]);
    if (board[i * 9 + c]) used.add(board[i * 9 + c]);
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++)
      if (board[rr * 9 + cc]) used.add(board[rr * 9 + cc]);
  const out = [];
  for (let d = 1; d <= 9; d++) if (!used.has(d)) out.push(d);
  return out;
}

function fillBoard(board, rng) {
  let best = -1, bestCands = null;
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    const cands = possibleDigits(board, i);
    if (cands.length === 0) return false;
    if (best === -1 || cands.length < bestCands.length) {
      best = i; bestCands = cands;
      if (cands.length === 1) break;
    }
  }
  if (best === -1) return true; // solved
  for (const d of shuffle(bestCands, rng)) {
    board[best] = d;
    if (fillBoard(board, rng)) return true;
    board[best] = 0;
  }
  return false;
}

function generateSolved(rng) {
  const board = Array(81).fill(0);
  if (!fillBoard(board, rng)) throw new Error('Failed to generate board');
  return board;
}

// ── Solver (count solutions up to limit) ─────────────────────────────

function countSolutions(board, limit = 2) {
  let count = 0;
  const b = board.slice();

  function solve() {
    if (count >= limit) return;
    let best = -1, bestLen = 10;
    for (let i = 0; i < 81; i++) {
      if (b[i] !== 0) continue;
      const cands = possibleDigits(b, i);
      if (cands.length === 0) return;
      if (cands.length < bestLen) {
        best = i; bestLen = cands.length;
        if (bestLen === 1) break;
      }
    }
    if (best === -1) { count++; return; }
    const cands = possibleDigits(b, best);
    for (const d of cands) {
      if (count >= limit) return;
      b[best] = d;
      solve();
      b[best] = 0;
    }
  }

  solve();
  return count;
}

function hasUniqueSolution(board) {
  return countSolutions(board, 2) === 1;
}

// ── Dig puzzle ───────────────────────────────────────────────────────

function digPuzzle(solved, targetGivens, rng) {
  const puzzle = solved.slice();
  const order = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);
  for (const i of order) {
    const givens = puzzle.filter(v => v !== 0).length;
    if (givens <= targetGivens) break;
    const prev = puzzle[i];
    if (prev === 0) continue;
    puzzle[i] = 0;
    if (!hasUniqueSolution(puzzle)) {
      puzzle[i] = prev; // revert
    }
  }
  return puzzle;
}

// ── Candidate analysis ───────────────────────────────────────────────

function analyzeCandidates(puzzle) {
  let totalCands = 0;
  let emptyCells = 0;
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0) continue;
    emptyCells++;
    totalCands += possibleDigits(puzzle, i).length;
  }
  return {
    givens: 81 - emptyCells,
    cands: totalCands,
    avgC: emptyCells > 0 ? Math.round((totalCands / emptyCells) * 100) / 100 : 0,
  };
}

// ── Tier plan ────────────────────────────────────────────────────────

const TIER_PLAN = [
  { shard: 'T01', count: 200, givensMin: 36, givensMax: 44, desc: 'Tier I — easy race' },
  { shard: 'T02', count: 200, givensMin: 30, givensMax: 36, desc: 'Tier II — moderate' },
  { shard: 'T03', count: 150, givensMin: 28, givensMax: 32, desc: 'Tier III-a — challenging' },
  { shard: 'T04', count: 150, givensMin: 26, givensMax: 30, desc: 'Tier III-b — challenging+' },
  { shard: 'T05', count: 150, givensMin: 25, givensMax: 28, desc: 'Tier IV-a — hard' },
  { shard: 'T06', count: 150, givensMin: 24, givensMax: 27, desc: 'Tier IV-b — hard+' },
  { shard: 'T07', count: 100, givensMin: 23, givensMax: 26, desc: 'Tier V-a' },
  { shard: 'T08', count: 100, givensMin: 23, givensMax: 26, desc: 'Tier V-b' },
  { shard: 'T09', count: 100, givensMin: 22, givensMax: 25, desc: 'Tier V-c' },
  { shard: 'T10', count: 100, givensMin: 22, givensMax: 25, desc: 'Tier V-d' },
  { shard: 'T11', count: 100, givensMin: 22, givensMax: 24, desc: 'Tier V-e' },
  { shard: 'T12', count: 100, givensMin: 22, givensMax: 24, desc: 'Tier V-f' },
];

// ── Main ─────────────────────────────────────────────────────────────

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = process.argv[i + 1];
      if (!next || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    }
  }
  return out;
}

function main() {
  const args = parseArgs();
  const baseSeed = args.seed || 'duo_exclusive_2026';
  const countMult = Number(args.count) || 0; // override per-shard count
  const outDir = path.join('public', 'data');

  console.log(`Duo puzzle generator — seed: ${baseSeed}`);
  console.log('');

  let grandTotal = 0;
  const summary = [];

  for (const tier of TIER_PLAN) {
    const count = countMult || tier.count;
    const shardSeed = `${baseSeed}_${tier.shard}`;
    const rng = mulberry32(hashSeed(shardSeed));
    const puzzles = [];
    const used = new Set();

    process.stdout.write(`Generating ${tier.desc} (${tier.shard}): ${count} puzzles...`);
    const t0 = Date.now();

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (true) {
        attempts++;
        if (attempts > 500) throw new Error(`${tier.shard} puzzle #${i + 1}: exceeded 500 attempts`);

        const solved = generateSolved(rng);
        const targetGivens = tier.givensMin + Math.floor(rng() * (tier.givensMax - tier.givensMin + 1));
        const puzzle = digPuzzle(solved, targetGivens, rng);

        // Deduplicate
        const key = puzzle.join(',');
        if (used.has(key)) continue;
        used.add(key);

        const meta = analyzeCandidates(puzzle);

        // Compact shard format matching existing schema + new duo fields
        puzzles.push({
          id: -(10000 + grandTotal + i + 1), // negative IDs to avoid collision
          s: 0,
          dn: 'Duo',
          dp: `DUO-${tier.shard}-${String(i + 1).padStart(3, '0')}`,
          p: puzzle,
          sl: solved,
          mt: '',
          tt: tier.shard,
          ds: 0,
          ls: true,
          sr: Math.round((meta.givens / 81) * 10000) / 10000,
          src: 'duo-gen',
          // ── Duo-exclusive metadata ──
          gv: meta.givens,     // givens count
          cd: meta.cands,      // total candidates at start
          ac: meta.avgC,       // avg candidates per empty cell
        });
        break;
      }
    }

    // Sort by avgC descending (easiest first within shard)
    puzzles.sort((a, b) => b.ac - a.ac);
    // Reassign sequential IDs after sort
    puzzles.forEach((p, i) => { p.id = -(10000 + grandTotal + i + 1); });

    const outPath = path.join(outDir, `duo-${tier.shard}.json`);
    fs.writeFileSync(outPath, JSON.stringify(puzzles), 'utf8');
    const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

    const avgGivens = Math.round(puzzles.reduce((s, p) => s + p.gv, 0) / puzzles.length * 10) / 10;
    const avgCands = Math.round(puzzles.reduce((s, p) => s + p.cd, 0) / puzzles.length);
    const avgAvgC = Math.round(puzzles.reduce((s, p) => s + p.ac, 0) / puzzles.length * 100) / 100;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(` done (${elapsed}s, ${sizeKB}KB)`);
    console.log(`  givens: ${avgGivens} avg | cands: ${avgCands} avg | avgC/cell: ${avgAvgC}`);

    summary.push({ shard: tier.shard, count: puzzles.length, avgGivens, avgCands, avgAvgC, sizeKB });
    grandTotal += puzzles.length;
  }

  // Update manifest
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const s of summary) {
    const key = `duo-${s.shard}`;
    const filePath = path.join(outDir, `duo-${s.shard}.json`);
    manifest.shards[key] = {
      file: `duo-${s.shard}.json`,
      count: s.count,
      size: fs.statSync(filePath).size,
    };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log('\n═══════════════════════════════════════');
  console.log(`  Total: ${grandTotal} puzzles generated`);
  console.log('═══════════════════════════════════════');
  console.table(summary);
}

main();
