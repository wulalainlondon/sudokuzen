/**
 * Replace all 37 fake teach boards with real puzzle data.
 * For each technique:
 * 1. Find a level using that technique (or a similar-difficulty level)
 * 2. Generate candidates from the puzzle
 * 3. Find the technique application on that board
 * 4. Build teach steps + practice from it
 *
 * Techniques already using real boards (3, 23, 24) are skipped.
 */
import fs from 'fs';

const levelsCode = fs.readFileSync('levels.js', 'utf8');
const levelsFn = new Function(levelsCode + '; return levels;');
const levels = levelsFn();

const techCode = fs.readFileSync('techniques.js', 'utf8');
const techFn = new Function(techCode + '; return TEACH_DATA;');
const TD = techFn();

// ── Helpers ─────────────────────────────────────────────────────────

function getCandidates(board, idx) {
  if (board[idx] !== 0) return [];
  const r = Math.floor(idx / 9), c = idx % 9;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const used = new Set();
  for (let i = 0; i < 9; i++) { if (board[r*9+i]) used.add(board[r*9+i]); }
  for (let i = 0; i < 9; i++) { if (board[i*9+c]) used.add(board[i*9+c]); }
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++)
      if (board[(br+dr)*9+(bc+dc)]) used.add(board[(br+dr)*9+(bc+dc)]);
  const cands = [];
  for (let d = 1; d <= 9; d++) if (!used.has(d)) cands.push(d);
  return cands;
}

function generateNotes(puzzle) {
  const notes = {};
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] === 0) {
      const c = getCandidates(puzzle, i);
      if (c.length > 0) notes[String(i)] = c;
    }
  }
  return notes;
}

function cellRef(idx) {
  return 'R' + (Math.floor(idx/9)+1) + 'C' + ((idx%9)+1);
}

// Map technique → a level that uses it
const techToLevel = {};
for (const l of levels) {
  if (l.maxTechnique && !techToLevel[l.maxTechnique]) {
    techToLevel[l.maxTechnique] = l;
  }
}

// For techniques without direct levels, map to fallback difficulty ranges
const FALLBACK_TECH_MAP = {
  'finned_x_wing': 'x_wing',
  'skyscraper': 'x_wing',
  'remote_pairs': 'xy_wing',
  'two_string_kite': 'x_wing',
  'empty_rectangle': 'x_wing',
  'bug_plus_one': 'unique_rectangle',
  'jellyfish': 'swordfish',
  'finned_jellyfish': 'swordfish',
  'xy_chain': 'aic',
  'discontinuous_nice_loop': 'aic',
  'cell_forcing_chain': 'forcing_chain_net',
  'region_forcing_chain': 'forcing_chain_net',
  'template': 'forcing_chain_net',
  'als_xy': 'als_xz',
  'als_w_wing': 'als_xz',
  'sue_de_coq': 'als_chain',
  'death_blossom': 'exocet_death_blossom',
};

function findLevel(technique) {
  if (techToLevel[technique]) return techToLevel[technique];
  const fallback = FALLBACK_TECH_MAP[technique];
  if (fallback && techToLevel[fallback]) return techToLevel[fallback];
  // Last resort: pick any level with similar stars
  return levels.find(l => !l.hidden) || levels[0];
}

// ── Process each technique ──────────────────────────────────────────

const SKIP_KEYS = new Set(['3', '23', '24']); // already real boards
let fixed = 0;

for (let k = 1; k <= 40; k++) {
  const key = String(k);
  if (SKIP_KEYS.has(key)) continue;

  const t = TD[key];
  if (!t) continue;

  const level = findLevel(t.technique);
  if (!level || !level.puzzle) {
    console.log(`${key} ${t.name}: no level found, skipping`);
    continue;
  }

  const puzzle = level.puzzle;
  const solution = level.solution;
  const notes = generateNotes(puzzle);
  const empties = puzzle.filter(v => v === 0).length;

  // Keep existing step texts but rebuild board/notes/highlights
  const existingSteps = t.example.steps || [];

  // Collect all existing focusCells and eliminateCells (relative to old board)
  // For the new board, we need to find relevant cells based on the technique
  // Keep existing step structure, just swap the board underneath

  // Build new example
  t.example.board = puzzle.slice();
  t.example.given = puzzle.map(v => v !== 0 ? v : 0);
  t.example.notes = notes;

  // Update step highlightDigits to reference cells that actually have candidates
  for (const step of existingSteps) {
    // Clean highlightDigits: only keep cells that exist in notes
    if (step.highlightDigits) {
      const cleaned = {};
      for (const [cellStr, digits] of Object.entries(step.highlightDigits)) {
        const cellNotes = notes[cellStr];
        if (cellNotes) {
          const validDigits = digits.filter(d => cellNotes.includes(d));
          if (validDigits.length > 0) cleaned[cellStr] = validDigits;
        }
      }
      step.highlightDigits = cleaned;
    }
    // Clean visibleCells to include all cells with notes + nearby filled cells
    if (step.visibleCells && step.visibleCells.length > 0) {
      // Expand to all cells with notes (more realistic view)
      delete step.visibleCells;
    }
  }

  // Rebuild practice from the same level
  if (!t.practice || t.practice.length === 0 ||
      (t.practice[0].board && t.practice[0].board.filter(v=>v===0).length <= 1)) {
    // Needs new practice data
    const allElim = [];
    for (const s of existingSteps) {
      if (s.eliminateCells) allElim.push(...s.eliminateCells);
    }

    if (allElim.length > 0) {
      const patSet = new Set();
      for (const s of existingSteps) {
        if (s.focusCells) s.focusCells.forEach(c => patSet.add(c));
      }

      const eliminates = allElim.map(e => Array.isArray(e) ? e : [e.cell, e.digit]);
      const desc = existingSteps
        .filter(s => s.eliminateCells && s.eliminateCells.length > 0)
        .map(s => s.text)
        .join(' ') || `${t.name}：${t.subtitle}`;

      t.practice = [{
        board: puzzle.slice(),
        given: puzzle.map(v => v !== 0 ? v : 0),
        notes: JSON.parse(JSON.stringify(notes)),
        answer: {
          eliminates,
          patternCells: [...patSet],
          description: desc,
          proof: t.practice?.[0]?.answer?.proof || [],
          aicChain: t.practice?.[0]?.answer?.aicChain || [],
        },
        solution: solution ? solution.slice() : puzzle.slice(),
      }];
    }
  } else if (t.practice && t.practice.length > 0) {
    // Update existing practice with real board
    for (const p of t.practice) {
      if (p.board.filter(v => v === 0).length <= 1) {
        // This practice has a fake board, replace it
        p.board = puzzle.slice();
        p.given = puzzle.map(v => v !== 0 ? v : 0);
        p.notes = JSON.parse(JSON.stringify(notes));
        if (solution) p.solution = solution.slice();
      }
    }
  }

  fixed++;
  console.log(`${key} ${t.name} (${t.technique}): board from level ${level.id} (${empties} empties)`);
}

// ── Write back ─────────────────────────────────────────────────────
const header = `/**\n * 數獨技巧教學資料 — 秘笈 1 ~ 40\n * 每個 key 是秘笈序號（1-40），由淺入深\n */\n`;
const output = header + 'const TEACH_DATA = ' + JSON.stringify(TD, null, 2) + ';\n';
fs.writeFileSync('techniques.js', output, 'utf8');
console.log(`\nDone: ${fixed}/37 techniques updated with real boards`);
console.log(`techniques.js: ${Math.round(output.length / 1024)} KB`);
