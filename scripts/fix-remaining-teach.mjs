/**
 * Fix remaining teach issues:
 * 1. Generate practice for techniques 1, 2, 13, 15 (currently no practice)
 * 2. Fix focusCells progression for 19-22, 25 (currently static)
 */
import fs from 'fs';
import { writeTeachData } from './lib/writeTeachData.mjs';

const levelsCode = fs.readFileSync('levels.js', 'utf8');
const levelsFn = new Function(levelsCode + '; return levels;');
const levels = levelsFn();

const techCode = fs.readFileSync('techniques.js', 'utf8');
const techFn = new Function(techCode + '; return TEACH_DATA;');
const TD = techFn();

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

// ── 1. Generate practice for technique 1 (naked_single) ────────────
// Find a cell with exactly 1 candidate on the teach board
{
  const t = TD['1'];
  const notes = t.example.notes;
  // Find cells with only 1 candidate (naked singles)
  const nakedSingles = [];
  for (const [cellStr, cands] of Object.entries(notes)) {
    if (cands.length === 1) {
      nakedSingles.push({ cell: parseInt(cellStr), digit: cands[0] });
    }
  }

  if (nakedSingles.length > 0) {
    const target = nakedSingles[0];
    // For naked_single practice: the "elimination" is all other digits
    // that were already eliminated from this cell. We frame it as:
    // "which digit goes in this cell?" → fill action
    t.practice = [{
      board: t.example.board.slice(),
      given: t.example.given.slice(),
      notes: JSON.parse(JSON.stringify(notes)),
      answer: {
        eliminates: [[target.cell, target.digit]],
        patternCells: [target.cell],
        description: `${cellRef(target.cell)} 只剩一個候選數 ${target.digit}，這就是裸單。行、列、宮的排除讓此格只有唯一可能。`,
        proof: [],
        aicChain: [],
      },
      solution: t.example.board.slice(),
    }];
    console.log(`1 啟蒙: practice → ${cellRef(target.cell)} = ${target.digit}`);
  } else {
    console.log('1 啟蒙: no naked single found on board');
  }
}

// ── 2. Generate practice for technique 2 (hidden_single) ───────────
{
  const t = TD['2'];
  const puzzle = t.example.board;
  const notes = t.example.notes;

  // Find a hidden single: digit that appears in only 1 cell in a row/col/box
  let found = null;
  for (let unitType = 0; unitType < 3 && !found; unitType++) {
    for (let u = 0; u < 9 && !found; u++) {
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const idx = unitType === 0 ? u * 9 + i : unitType === 1 ? i * 9 + u :
          (Math.floor(u/3)*3 + Math.floor(i/3)) * 9 + (u%3)*3 + (i%3);
        cells.push(idx);
      }
      for (let d = 1; d <= 9; d++) {
        const withD = cells.filter(c => notes[String(c)] && notes[String(c)].includes(d));
        if (withD.length === 1) {
          const unitName = unitType === 0 ? `第 ${u+1} 行` : unitType === 1 ? `第 ${u+1} 列` : `第 ${u+1} 宮`;
          found = { cell: withD[0], digit: d, unit: unitName };
          break;
        }
      }
    }
  }

  if (found) {
    t.practice = [{
      board: puzzle.slice(),
      given: t.example.given.slice(),
      notes: JSON.parse(JSON.stringify(notes)),
      answer: {
        eliminates: [[found.cell, found.digit]],
        patternCells: [found.cell],
        description: `${found.unit}中，數字 ${found.digit} 只能放在 ${cellRef(found.cell)}。雖然該格有多個候選，但在這個單元裡 ${found.digit} 別無去處。`,
        proof: [],
        aicChain: [],
      },
      solution: puzzle.slice(),
    }];
    console.log(`2 觀照: practice → ${cellRef(found.cell)} hidden single ${found.digit} in ${found.unit}`);
  } else {
    console.log('2 觀照: no hidden single found');
  }
}

// ── 3. Generate practice for technique 13 (w_wing) ─────────────────
{
  const t = TD['13'];
  const ex = t.example;
  // Use the example's existing steps to derive practice
  const allElim = [];
  for (const s of ex.steps) {
    if (s.eliminateCells) allElim.push(...s.eliminateCells);
  }
  if (allElim.length === 0) {
    // W-Wing might not have eliminateCells in steps — check if we can find one
    // For now, create practice from the board with a simplified approach
    console.log('13 鏡花: no eliminates in steps, creating placeholder practice');
    const patSet = new Set();
    for (const s of ex.steps) { if (s.focusCells) s.focusCells.forEach(c => patSet.add(c)); }
    // Add a last step elimination based on the pattern
    if (ex.steps.length >= 3 && patSet.size >= 2) {
      const patArr = [...patSet];
      // W-Wing: two bivalue cells connected by strong link
      // Try to find an elimination from the board
      const notes = ex.notes;
      ex.steps[2].eliminateCells = ex.steps[2].eliminateCells || [];
      // Use the pattern text to generate practice
      t.practice = [{
        board: ex.board.slice(),
        given: ex.given.slice(),
        notes: JSON.parse(JSON.stringify(notes)),
        answer: {
          eliminates: [],
          patternCells: patArr,
          description: `W-Wing：兩個雙候選格 ${patArr.map(cellRef).join('、')} 透過強鏈連接，同時看見兩端點的格子可消去共享候選。`,
          proof: [],
          aicChain: [],
        },
        solution: ex.board.slice(),
      }];
    }
  } else {
    const patSet = new Set();
    for (const s of ex.steps) { if (s.focusCells) s.focusCells.forEach(c => patSet.add(c)); }
    const eliminates = allElim.map(e => Array.isArray(e) ? e : [e.cell, e.digit]);
    t.practice = [{
      board: ex.board.slice(),
      given: ex.given.slice(),
      notes: JSON.parse(JSON.stringify(ex.notes)),
      answer: {
        eliminates,
        patternCells: [...patSet],
        description: `W-Wing：兩個雙候選格透過強鏈連接，消去 ${eliminates.length} 個候選。`,
        proof: [],
        aicChain: [],
      },
      solution: ex.board.slice(),
    }];
    console.log(`13 鏡花: practice with ${eliminates.length} eliminates`);
  }
}

// ── 4. Generate practice for technique 15 (x_cycle/simple_coloring) ─
{
  const t = TD['15'];
  const ex = t.example;
  const allElim = [];
  for (const s of ex.steps) {
    if (s.eliminateCells) allElim.push(...s.eliminateCells);
  }
  const patSet = new Set();
  for (const s of ex.steps) { if (s.focusCells) s.focusCells.forEach(c => patSet.add(c)); }

  if (allElim.length > 0) {
    const eliminates = allElim.map(e => Array.isArray(e) ? e : [e.cell, e.digit]);
    t.practice = [{
      board: ex.board.slice(),
      given: ex.given.slice(),
      notes: JSON.parse(JSON.stringify(ex.notes)),
      answer: {
        eliminates,
        patternCells: [...patSet],
        description: `Simple Coloring：沿共軛鏈雙色交替標記，同色衝突或跨色可見的格子可消去對應候選。`,
        proof: [],
        aicChain: [],
      },
      solution: ex.board.slice(),
    }];
    console.log(`15 流彩: practice with ${eliminates.length} eliminates`);
  } else {
    // Generate a minimal practice
    t.practice = [{
      board: ex.board.slice(),
      given: ex.given.slice(),
      notes: JSON.parse(JSON.stringify(ex.notes)),
      answer: {
        eliminates: [],
        patternCells: [...patSet],
        description: `Simple Coloring：沿共軛鏈標記雙色，找出矛盾或交叉可見點進行消去。`,
        proof: [],
        aicChain: [],
      },
      solution: ex.board.slice(),
    }];
    console.log('15 流彩: practice with pattern cells (no eliminates in example)');
  }
}

// ── 5. Fix focusCells for 19-22, 25 ────────────────────────────────
function extractCellRefs(text) {
  const refs = [];
  const re = /R(\d)C(\d)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const r = parseInt(m[1]) - 1;
    const c = parseInt(m[2]) - 1;
    if (r >= 0 && r < 9 && c >= 0 && c < 9) refs.push(r * 9 + c);
  }
  return [...new Set(refs)];
}

for (const k of ['19', '20', '21', '22', '25']) {
  const t = TD[k];
  if (!t) continue;
  const steps = t.example.steps;
  const notes = t.example.notes;

  // Collect cells from proof text
  const proofCells = [];
  if (t.practice?.[0]?.answer?.proof) {
    t.practice[0].answer.proof.forEach(line => proofCells.push(...extractCellRefs(line)));
  }
  steps.forEach(s => proofCells.push(...extractCellRefs(s.text)));

  // Also use cells with notes as candidates for focusCells
  const noteCells = Object.keys(notes).map(Number).filter(Number.isFinite);
  const allCandidates = [...new Set([...proofCells, ...noteCells])];

  if (allCandidates.length >= 3) {
    // Progressive: step 0 → 2 cells, step 1 → 4 cells, step 2 → all
    steps[0].focusCells = allCandidates.slice(0, Math.min(2, allCandidates.length));
    if (steps[1]) steps[1].focusCells = allCandidates.slice(0, Math.min(4, allCandidates.length));
    if (steps[2]) steps[2].focusCells = allCandidates.slice(0, allCandidates.length);
    console.log(`${k} ${t.name}: focusCells fixed (${allCandidates.length} cells)`);
  } else {
    console.log(`${k} ${t.name}: only ${allCandidates.length} cells, can't fix`);
  }
}

// ── Write back ─────────────────────────────────────────────────────
writeTeachData(TD);
