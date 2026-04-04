#!/usr/bin/env node
/**
 * Build duo-exclusive shards from technique-gated world shards.
 *
 * Takes the high-quality world-T*.json puzzles (tdoku-validated, technique-gated)
 * and enriches them with candidate metadata for duo difficulty tuning:
 *   - gv: givens count (pre-filled cells)
 *   - cd: total candidates across all empty cells at start
 *   - ac: average candidates per empty cell (lower = easier / more constrained)
 *
 * Output: public/data/duo-T*.json (independent copies, sorted by avgC)
 *
 * Usage: node scripts/generate-duo-puzzles.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join('public', 'data');

// ── Candidate analysis ───────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────

const SHARDS = ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11','T12'];

let grandTotal = 0;
const summary = [];

for (const shard of SHARDS) {
  const worldPath = path.join(DATA_DIR, `world-${shard}.json`);
  if (!fs.existsSync(worldPath)) {
    console.warn(`Skipping ${shard}: ${worldPath} not found`);
    continue;
  }

  const worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
  console.log(`Processing ${shard}: ${worldData.length} puzzles from world shard...`);

  // Enrich each puzzle with candidate metadata
  const duoData = worldData.map((level, i) => {
    const puzzle = level.p;
    const meta = analyzeCandidates(puzzle);

    return {
      ...level,
      // Override source to mark as duo
      src: 'duo',
      // Add candidate metadata
      gv: meta.givens,
      cd: meta.cands,
      ac: meta.avgC,
    };
  });

  // Sort by avgC ascending (easiest / most constrained first)
  duoData.sort((a, b) => a.ac - b.ac);

  const outPath = path.join(DATA_DIR, `duo-${shard}.json`);
  fs.writeFileSync(outPath, JSON.stringify(duoData), 'utf8');
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

  const avgGivens = Math.round(duoData.reduce((s, p) => s + p.gv, 0) / duoData.length * 10) / 10;
  const avgCands = Math.round(duoData.reduce((s, p) => s + p.cd, 0) / duoData.length);
  const avgAvgC = Math.round(duoData.reduce((s, p) => s + p.ac, 0) / duoData.length * 100) / 100;
  const minC = Math.min(...duoData.map(p => p.ac));
  const maxC = Math.max(...duoData.map(p => p.ac));

  // Technique breakdown
  const techs = {};
  for (const p of duoData) {
    const t = p.mt || 'unknown';
    techs[t] = (techs[t] || 0) + 1;
  }
  const techStr = Object.entries(techs).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}:${v}`).join(', ');

  console.log(`  ${duoData.length} puzzles | givens: ${avgGivens} avg | avgC: ${minC}~${maxC} (avg ${avgAvgC}) | ${sizeKB}KB`);
  console.log(`  techniques: ${techStr}`);

  summary.push({ shard, count: duoData.length, avgGivens, avgCands, avgAvgC, minC, maxC, sizeKB });
  grandTotal += duoData.length;
}

// Update manifest
const manifestPath = path.join(DATA_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const s of summary) {
  const key = `duo-${s.shard}`;
  const filePath = path.join(DATA_DIR, `duo-${s.shard}.json`);
  manifest.shards[key] = {
    file: `duo-${s.shard}.json`,
    count: s.count,
    size: fs.statSync(filePath).size,
  };
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('\n═══════════════════════════════════════');
console.log(`  Total: ${grandTotal} puzzles (technique-gated + candidate metadata)`);
console.log('═══════════════════════════════════════');
console.table(summary);
