#!/usr/bin/env node
// Validate the canonical Duo shards before tests or release. This is read-only.
import fs from 'node:fs';
import crypto from 'node:crypto';

const ALL = 0x3fe;
const manifest = JSON.parse(fs.readFileSync('public/data/manifest.json', 'utf8'));
const seenBoards = new Set();
const seenIds = new Set();
let checked = 0;

function fail(message) {
  throw new Error(`[duo-puzzles] ${message}`);
}

function countSolutions(puzzle) {
  const board = puzzle.slice();
  const rows = new Int32Array(9);
  const columns = new Int32Array(9);
  const boxes = new Int32Array(9);
  const blanks = [];
  for (let pos = 0; pos < 81; pos++) {
    const value = board[pos];
    if (!value) {
      blanks.push(pos);
      continue;
    }
    const row = Math.floor(pos / 9);
    const col = pos % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const bit = 1 << value;
    if ((rows[row] | columns[col] | boxes[box]) & bit) return { count: 0, solution: null };
    rows[row] |= bit;
    columns[col] |= bit;
    boxes[box] |= bit;
  }

  let count = 0;
  let solution = null;
  function search(depth) {
    if (count >= 2) return;
    if (depth === blanks.length) {
      count++;
      if (!solution) solution = board.slice();
      return;
    }
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    for (let index = depth; index < blanks.length; index++) {
      const pos = blanks[index];
      const row = Math.floor(pos / 9);
      const col = pos % 9;
      const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
      const mask = ALL & ~(rows[row] | columns[col] | boxes[box]);
      let size = 0;
      for (let bits = mask; bits; bits &= bits - 1) size++;
      if (!size) return;
      if (size < bestSize) {
        best = index;
        bestMask = mask;
        bestSize = size;
        if (size === 1) break;
      }
    }
    [blanks[depth], blanks[best]] = [blanks[best], blanks[depth]];
    const pos = blanks[depth];
    const row = Math.floor(pos / 9);
    const col = pos % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    for (let mask = bestMask; mask && count < 2; mask &= mask - 1) {
      const bit = mask & -mask;
      rows[row] |= bit;
      columns[col] |= bit;
      boxes[box] |= bit;
      board[pos] = Math.log2(bit);
      search(depth + 1);
      board[pos] = 0;
      rows[row] ^= bit;
      columns[col] ^= bit;
      boxes[box] ^= bit;
    }
    [blanks[depth], blanks[best]] = [blanks[best], blanks[depth]];
  }
  search(0);
  return { count, solution };
}

function candidates(board, pos) {
  const row = Math.floor(pos / 9);
  const col = pos % 9;
  let used = 0;
  for (let i = 0; i < 9; i++) {
    used |= 1 << board[row * 9 + i];
    used |= 1 << board[i * 9 + col];
    const r = Math.floor(row / 3) * 3 + Math.floor(i / 3);
    const c = Math.floor(col / 3) * 3 + (i % 3);
    used |= 1 << board[r * 9 + c];
  }
  const possible = [];
  for (let digit = 1; digit <= 9; digit++) if (!(used & (1 << digit))) possible.push(digit);
  return possible;
}

function nakedOnly(puzzle) {
  const board = puzzle.slice();
  while (board.includes(0)) {
    let changed = false;
    for (let pos = 0; pos < 81; pos++) {
      if (board[pos]) continue;
      const possible = candidates(board, pos);
      if (possible.length === 1) {
        board[pos] = possible[0];
        changed = true;
      }
    }
    if (!changed) return false;
  }
  return true;
}

for (let number = 0; number <= 12; number++) {
  const tier = `T${String(number).padStart(2, '0')}`;
  const name = `duo-${tier}`;
  const file = `public/data/${name}.json`;
  const bytes = fs.readFileSync(file);
  const rows = JSON.parse(bytes.toString('utf8'));
  const meta = manifest.shards[name];
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  if (!meta || meta.file !== `${name}.json` || meta.count !== rows.length || meta.size !== bytes.length || meta.hash !== hash)
    fail(`${name} manifest mismatch`);
  if (!rows.length) fail(`${name} is empty`);
  let previousAvg = -Infinity;
  for (let index = 0; index < rows.length; index++) {
    const entry = rows[index];
    const reference = `${name}[${index}]`;
    if (!Array.isArray(entry.p) || entry.p.length !== 81 || !entry.p.every((value) => Number.isInteger(value) && value >= 0 && value <= 9))
      fail(`${reference} invalid puzzle`);
    if (!Array.isArray(entry.sl) || entry.sl.length !== 81 || !entry.sl.every((value) => Number.isInteger(value) && value >= 1 && value <= 9))
      fail(`${reference} invalid solution`);
    const boardKey = entry.p.join('');
    if (seenBoards.has(boardKey)) fail(`${reference} duplicate puzzle`);
    seenBoards.add(boardKey);
    const expectedId = -parseInt(crypto.createHash('sha256').update(boardKey).digest('hex').slice(0, 12), 16);
    if (entry.id !== expectedId || seenIds.has(entry.id)) fail(`${reference} unstable or duplicate ID`);
    seenIds.add(entry.id);
    const solved = countSolutions(entry.p);
    if (solved.count !== 1 || solved.solution?.join('') !== entry.sl.join('')) fail(`${reference} not uniquely solved by stored answer`);
    const givens = entry.p.filter(Boolean).length;
    const candidateTotal = entry.p.reduce((sum, value, pos) => sum + (value ? 0 : candidates(entry.p, pos).length), 0);
    const avg = Math.round((candidateTotal / (81 - givens)) * 100) / 100;
    if (entry.gv !== givens || entry.cd !== candidateTotal || entry.ac !== avg) fail(`${reference} candidate metadata mismatch`);
    if (entry.ac < previousAvg) fail(`${reference} out of candidate order`);
    previousAvg = entry.ac;
    if (entry.tt !== tier || typeof entry.ds !== 'number' || !Number.isFinite(entry.ds) || typeof entry.ls !== 'boolean' || typeof entry.mt !== 'string' || !entry.mt)
      fail(`${reference} invalid difficulty metadata`);
    if (tier === 'T00' && entry.mt !== (nakedOnly(entry.p) ? 'naked_single' : 'hidden_single'))
      fail(`${reference} incorrect single-technique label`);
    checked++;
  }
  console.log(`✓ ${name}: ${rows.length} unique puzzles`);
}
console.log(`✓ Duo bank validated: ${checked} puzzles, unique IDs/solutions, complete metadata and manifest`);
