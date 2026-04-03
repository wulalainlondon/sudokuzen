#!/usr/bin/env node
/**
 * Fix 天望 (finned_x_wing) and 鋒刃 (skyscraper) realms:
 * 1. Remove duplicate levels (keep first occurrence)
 * 2. Generate new puzzles via permutation to fill to 40 each
 * 3. Back-fill missing annotations (techTier, difficultyScore, logicSolvable, singleRatio)
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

// ── Permutation helpers (preserve technique structure) ──

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyDigitPermutation(board) {
  const digits = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return board.map(n => n === 0 ? 0 : digits[n - 1]);
}

function transpose(board) {
  const out = new Array(81);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      out[c * 9 + r] = board[r * 9 + c];
  return out;
}

function swapRowBands(board, b1, b2) {
  const out = [...board];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 9; c++) {
      out[(b1 * 3 + r) * 9 + c] = board[(b2 * 3 + r) * 9 + c];
      out[(b2 * 3 + r) * 9 + c] = board[(b1 * 3 + r) * 9 + c];
    }
  return out;
}

function swapRowsInBand(board, band, r1, r2) {
  const out = [...board];
  const row1 = band * 3 + r1, row2 = band * 3 + r2;
  for (let c = 0; c < 9; c++) {
    out[row1 * 9 + c] = board[row2 * 9 + c];
    out[row2 * 9 + c] = board[row1 * 9 + c];
  }
  return out;
}

function swapColBands(board, b1, b2) {
  const out = [...board];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 3; c++) {
      out[r * 9 + b1 * 3 + c] = board[r * 9 + b2 * 3 + c];
      out[r * 9 + b2 * 3 + c] = board[r * 9 + b1 * 3 + c];
    }
  return out;
}

function swapColsInBand(board, band, c1, c2) {
  const out = [...board];
  const col1 = band * 3 + c1, col2 = band * 3 + c2;
  for (let r = 0; r < 9; r++) {
    out[r * 9 + col1] = board[r * 9 + col2];
    out[r * 9 + col2] = board[r * 9 + col1];
  }
  return out;
}

/** Apply random combination of structure-preserving transforms */
function permuteOnce(puzzle, solution) {
  let p = [...puzzle], s = [...solution];

  // 1. Digit relabeling (always)
  const digits = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  p = p.map(n => n === 0 ? 0 : digits[n - 1]);
  s = s.map(n => digits[n - 1]);

  // 2. Transpose (50%)
  if (crypto.randomInt(2)) {
    p = transpose(p);
    s = transpose(s);
  }

  // 3. Row band swap (33%)
  if (crypto.randomInt(3) === 0) {
    const bands = shuffleArray([0, 1, 2]);
    if (bands[0] !== 0) {
      p = swapRowBands(p, 0, bands[0]);
      s = swapRowBands(s, 0, bands[0]);
    }
  }

  // 4. Col band swap (33%)
  if (crypto.randomInt(3) === 0) {
    const bands = shuffleArray([0, 1, 2]);
    if (bands[0] !== 0) {
      p = swapColBands(p, 0, bands[0]);
      s = swapColBands(s, 0, bands[0]);
    }
  }

  // 5. Row swap within random band
  const rBand = crypto.randomInt(3);
  const rRows = shuffleArray([0, 1, 2]);
  if (rRows[0] !== 0) {
    p = swapRowsInBand(p, rBand, 0, rRows[0]);
    s = swapRowsInBand(s, rBand, 0, rRows[0]);
  }

  // 6. Col swap within random band
  const cBand = crypto.randomInt(3);
  const cCols = shuffleArray([0, 1, 2]);
  if (cCols[0] !== 0) {
    p = swapColsInBand(p, cBand, 0, cCols[0]);
    s = swapColsInBand(s, cBand, 0, cCols[0]);
  }

  return { puzzle: p, solution: s };
}

/** Validate solution is consistent with puzzle */
function validatePuzzle(puzzle, solution) {
  // Givens must match
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0 && puzzle[i] !== solution[i]) return false;
  }
  // Solution must be complete and valid
  for (let i = 0; i < 81; i++) {
    if (solution[i] < 1 || solution[i] > 9) return false;
  }
  // Check rows, cols, boxes
  for (let u = 0; u < 9; u++) {
    const rowSet = new Set(), colSet = new Set(), boxSet = new Set();
    for (let i = 0; i < 9; i++) {
      rowSet.add(solution[u * 9 + i]);
      colSet.add(solution[i * 9 + u]);
      const br = Math.floor(u / 3) * 3, bc = (u % 3) * 3;
      boxSet.add(solution[(br + Math.floor(i / 3)) * 9 + bc + (i % 3)]);
    }
    if (rowSet.size !== 9 || colSet.size !== 9 || boxSet.size !== 9) return false;
  }
  return true;
}

/** Generate N unique permutations from seed puzzles */
function generatePermutations(seeds, needed, existingKeys) {
  const newPuzzles = [];
  const allKeys = new Set(existingKeys);
  let attempts = 0;
  const maxAttempts = needed * 200;

  while (newPuzzles.length < needed && attempts < maxAttempts) {
    const seed = seeds[crypto.randomInt(seeds.length)];
    const { puzzle, solution } = permuteOnce(seed.puzzle, seed.solution);
    const key = puzzle.join('');

    if (!allKeys.has(key) && validatePuzzle(puzzle, solution)) {
      allKeys.add(key);
      newPuzzles.push({ puzzle, solution });
    }
    attempts++;
  }

  return newPuzzles;
}

// ── Main ──

const levels = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const allPuzzleKeys = new Set(levels.map(l => l.puzzle.join('')));

// Load generated files for difficulty metadata
const genFxw = JSON.parse(fs.readFileSync('generated/finned_x_wing.json', 'utf8'));
const genSky = JSON.parse(fs.readFileSync('generated/skyscraper.json', 'utf8'));

// Average difficulty_score and single_ratio from generated files
function avgMeta(genPuzzles) {
  const scores = genPuzzles.filter(p => p.difficulty_score != null).map(p => p.difficulty_score);
  const ratios = genPuzzles.filter(p => p.single_ratio != null).map(p => p.single_ratio);
  return {
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    avgRatio: ratios.length ? +(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(4) : 0,
  };
}

const fxwMeta = avgMeta(genFxw);
const skyMeta = avgMeta(genSky);

console.log('finned_x_wing avg:', fxwMeta);
console.log('skyscraper avg:', skyMeta);

// ── Step 1: Remove duplicates from 天望 and 鋒刃 ──

const realmConfigs = [
  { realm: '天望', technique: 'finned_x_wing', stars: 5.1, genMeta: fxwMeta, genPuzzles: genFxw, techTier: 'T09' },
  { realm: '鋒刃', technique: 'skyscraper', stars: 5.2, genMeta: skyMeta, genPuzzles: genSky, techTier: 'T10' },
];

for (const cfg of realmConfigs) {
  console.log(`\n=== ${cfg.realm} (${cfg.technique}) ===`);

  // Find all visible levels in this realm
  const realmLevels = levels.filter(l => l.difficultyName === cfg.realm && !l.hidden);
  console.log(`  current: ${realmLevels.length} levels`);

  // Deduplicate: keep first occurrence
  const seen = new Set();
  const toRemove = [];
  for (const l of realmLevels) {
    const key = l.puzzle.join('');
    if (seen.has(key)) {
      toRemove.push(l.id);
    } else {
      seen.add(key);
    }
  }
  console.log(`  duplicates to remove: ${toRemove.length}`);

  // Remove duplicates from levels array
  for (const id of toRemove) {
    const idx = levels.findIndex(l => l.id === id);
    if (idx >= 0) levels.splice(idx, 1);
  }

  // After dedup
  const remaining = levels.filter(l => l.difficultyName === cfg.realm && !l.hidden);
  console.log(`  after dedup: ${remaining.length} levels`);

  // ── Step 2: Generate new puzzles to fill to 40 ──
  const needed = 40 - remaining.length;
  if (needed > 0) {
    console.log(`  need ${needed} more puzzles`);

    // Seeds: existing unique puzzles from this realm
    const seeds = remaining.map(l => ({ puzzle: l.puzzle, solution: l.solution }));
    const newPuzzles = generatePermutations(seeds, needed, allPuzzleKeys);
    console.log(`  generated: ${newPuzzles.length} new puzzles`);

    // Find max ID
    let maxId = Math.max(...levels.map(l => l.id));

    for (let i = 0; i < newPuzzles.length; i++) {
      maxId++;
      const np = newPuzzles[i];
      allPuzzleKeys.add(np.puzzle.join(''));
      levels.push({
        id: maxId,
        stars: cfg.stars,
        difficultyName: cfg.realm,
        displayName: `${cfg.realm}-${String(remaining.length + i + 1).padStart(2, '0')}`,
        puzzle: np.puzzle,
        solution: np.solution,
        maxTechnique: cfg.technique,
        techTier: cfg.techTier,
        difficultyScore: cfg.genMeta.avgScore,
        logicSolvable: true,
        singleRatio: cfg.genMeta.avgRatio,
        source: 'in-house-generated',
      });
    }
  }

  // ── Step 3: Back-fill missing annotations on existing levels ──
  const realmFinal = levels.filter(l => l.difficultyName === cfg.realm && !l.hidden);

  // Try to match with generated file for per-puzzle metadata
  const genByKey = {};
  for (const gp of cfg.genPuzzles) {
    genByKey[gp.puzzle.join('')] = gp;
  }

  let backfilled = 0;
  for (const l of realmFinal) {
    const gp = genByKey[l.puzzle.join('')];
    if (!l.techTier) { l.techTier = cfg.techTier; backfilled++; }
    if (l.difficultyScore == null) {
      l.difficultyScore = gp?.difficulty_score ?? cfg.genMeta.avgScore;
    }
    if (l.logicSolvable == null) l.logicSolvable = true;
    if (l.singleRatio == null) {
      l.singleRatio = gp?.single_ratio ?? cfg.genMeta.avgRatio;
    }
  }
  console.log(`  back-filled annotations: ${backfilled}`);
  console.log(`  final count: ${realmFinal.length}`);
}

// ── Write back ──
fs.writeFileSync('levels-data.json', JSON.stringify(levels, null, 2), 'utf8');

// Verify
const final = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const visibleFinal = final.filter(l => !l.hidden);
for (const cfg of realmConfigs) {
  const r = visibleFinal.filter(l => l.difficultyName === cfg.realm);
  const uniq = new Set(r.map(l => l.puzzle.join('')));
  const missingTier = r.filter(l => !l.techTier).length;
  const missingScore = r.filter(l => l.difficultyScore == null).length;
  console.log(`\n✓ ${cfg.realm}: ${r.length} levels, ${uniq.size} unique, missingTier=${missingTier}, missingScore=${missingScore}`);
}
console.log(`\nTotal levels: ${final.length} (visible: ${visibleFinal.length})`);
