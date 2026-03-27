/**
 * Fix techniques 19-40:
 *
 * Problems identified:
 * - 19-25: Real boards but only 1 notes cell, generic proof, focusCells=1
 * - 26-40: ALL share identical fake board/notes data (placeholder)
 *
 * What we can fix:
 * 1. Example steps: extract cell refs from proof, expand focusCells progressively
 * 2. Practice patternCells: use proof-derived cells
 * 3. For 19-25: expand notes to show relevant cells from proof chain
 * 4. For 26-40: use the example board+notes as practice base (same approach as 1-18 fix)
 */
import fs from 'fs';
import { writeTeachData } from './lib/writeTeachData.mjs';

const code = fs.readFileSync('techniques.js', 'utf8');
const fn = new Function(code + '; return TEACH_DATA;');
const TD = fn();

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

function cellRef(idx) {
  return 'R' + (Math.floor(idx / 9) + 1) + 'C' + ((idx % 9) + 1);
}

// ── Fix example steps for 19-40 ────────────────────────────────────
// Make focusCells progressive using proof/aic chain data
for (let k = 19; k <= 40; k++) {
  const t = TD[String(k)];
  if (!t) continue;
  const ex = t.example;
  const steps = ex.steps;
  const p = t.practice && t.practice[0] ? t.practice[0] : null;

  // Collect all referenced cells from proof
  const proofCells = [];
  if (p && p.answer.proof) {
    p.answer.proof.forEach(line => proofCells.push(...extractCellRefs(line)));
  }
  // Also from step texts
  steps.forEach(s => proofCells.push(...extractCellRefs(s.text)));
  const uniqueProofCells = [...new Set(proofCells)];

  // Target elimination cell
  const elimCell = steps.find(s => s.eliminateCells && s.eliminateCells.length > 0);
  const elimIdx = elimCell ? (elimCell.eliminateCells[0].cell ?? elimCell.eliminateCells[0][0]) : null;

  // For the example, get all cells that have notes (these are the relevant cells)
  const noteCells = Object.keys(ex.notes).map(Number).filter(Number.isFinite);

  // Build progressive focusCells from available data
  let step0Focus, step1Focus, step2Focus;

  if (uniqueProofCells.length >= 3) {
    // Use proof cells progressively
    step0Focus = uniqueProofCells.slice(0, 2);
    step1Focus = uniqueProofCells.slice(0, Math.min(uniqueProofCells.length, 4));
    step2Focus = uniqueProofCells;
  } else if (noteCells.length >= 2) {
    // Use note cells
    step0Focus = noteCells.slice(0, 2);
    step1Focus = noteCells.slice(0, Math.min(noteCells.length, 4));
    step2Focus = noteCells;
  } else {
    // Fallback: use highlight digit cells
    const hlCells = [];
    steps.forEach(s => {
      if (s.highlightDigits) Object.keys(s.highlightDigits).forEach(c => hlCells.push(parseInt(c)));
    });
    const uniqueHl = [...new Set(hlCells)];
    if (uniqueHl.length >= 2) {
      step0Focus = uniqueHl.slice(0, 2);
      step1Focus = uniqueHl;
      step2Focus = uniqueHl;
    } else {
      // Keep existing (can't improve)
      step0Focus = steps[0].focusCells;
      step1Focus = steps[1] ? steps[1].focusCells : steps[0].focusCells;
      step2Focus = steps[2] ? steps[2].focusCells : steps[0].focusCells;
    }
  }

  // Apply progressive focusCells
  if (steps[0]) steps[0].focusCells = step0Focus;
  if (steps[1]) steps[1].focusCells = step1Focus;
  if (steps[2]) steps[2].focusCells = step2Focus;

  // Ensure last step has eliminateCells (move from middle step if needed)
  const lastStep = steps[steps.length - 1];
  if ((!lastStep.eliminateCells || lastStep.eliminateCells.length === 0)) {
    for (let i = steps.length - 2; i >= 0; i--) {
      if (steps[i].eliminateCells && steps[i].eliminateCells.length > 0) {
        lastStep.eliminateCells = steps[i].eliminateCells;
        steps[i].eliminateCells = [];
        break;
      }
    }
  }
}

// ── Fix practice for 19-25 (real boards, expand notes + patternCells) ──
for (let k = 19; k <= 25; k++) {
  const t = TD[String(k)];
  if (!t || !t.practice) continue;

  for (const p of t.practice) {
    // Extract cells from proof text
    const proofCells = [];
    if (p.answer.proof) p.answer.proof.forEach(line => proofCells.push(...extractCellRefs(line)));

    // Expand patternCells with proof-referenced cells
    const patSet = new Set(p.answer.patternCells || []);
    proofCells.forEach(c => patSet.add(c));

    // If still < 2, add cells from board that are empty and near the target
    if (patSet.size < 2) {
      const elimCell = p.answer.eliminates[0];
      const ec = typeof elimCell === 'object' && !Array.isArray(elimCell) ? elimCell.cell : elimCell[0];
      const row = Math.floor(ec / 9);
      const col = ec % 9;
      // Find nearby empty cells
      for (let r = Math.max(0, row - 1); r <= Math.min(8, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(8, col + 1); c++) {
          const idx = r * 9 + c;
          if (idx !== ec && p.board[idx] === 0) { patSet.add(idx); break; }
        }
        if (patSet.size >= 3) break;
      }
    }

    p.answer.patternCells = [...patSet];

    // Expand notes: for proof-referenced cells that are empty, add their candidates
    // We need to generate valid candidates from the board
    if (Object.keys(p.notes).length <= 2) {
      const board = p.board;
      for (const cellIdx of patSet) {
        if (board[cellIdx] !== 0) continue;
        if (p.notes[cellIdx] || p.notes[String(cellIdx)]) continue;
        // Generate candidates from constraints
        const used = new Set();
        const r = Math.floor(cellIdx / 9);
        const c = cellIdx % 9;
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        // Row
        for (let i = 0; i < 9; i++) { if (board[r * 9 + i]) used.add(board[r * 9 + i]); }
        // Col
        for (let i = 0; i < 9; i++) { if (board[i * 9 + c]) used.add(board[i * 9 + c]); }
        // Box
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const v = board[(br + dr) * 9 + (bc + dc)];
            if (v) used.add(v);
          }
        }
        const cands = [];
        for (let d = 1; d <= 9; d++) { if (!used.has(d)) cands.push(d); }
        if (cands.length > 0) p.notes[String(cellIdx)] = cands;
      }
    }
  }
  console.log(`Fixed key ${k} (${t.name}): patternCells=${t.practice[0].answer.patternCells.length}, notes=${Object.keys(t.practice[0].notes).length}`);
}

// ── Fix practice for 26-40 (replace fake data with example-derived) ──
for (let k = 26; k <= 40; k++) {
  const t = TD[String(k)];
  if (!t) continue;
  const ex = t.example;

  // Collect all eliminates from example steps
  const allElim = [];
  for (const s of ex.steps) {
    if (s.eliminateCells) allElim.push(...s.eliminateCells);
  }

  if (allElim.length === 0) {
    console.log(`Key ${k} (${t.name}): no eliminates in example, skipping practice rebuild`);
    continue;
  }

  // Collect all focusCells as patternCells
  const patSet = new Set();
  for (const s of ex.steps) {
    if (s.focusCells) s.focusCells.forEach(c => patSet.add(c));
  }

  // Build eliminates as [cell, digit] tuples
  const eliminates = allElim.map(e => Array.isArray(e) ? e : [e.cell, e.digit]);

  // Build description
  const desc = t.practice[0].answer.description || `${t.name}：${t.subtitle}`;
  const proof = t.practice[0].answer.proof || [];
  const aic = t.practice[0].answer.aicChain || [];

  // Replace practice with example-derived data
  t.practice = [{
    board: ex.board.slice(),
    given: ex.given.slice(),
    notes: JSON.parse(JSON.stringify(ex.notes)),
    answer: {
      eliminates,
      patternCells: [...patSet],
      description: desc,
      proof,
      aicChain: aic,
    },
    solution: ex.board.slice(),
  }];

  console.log(`Rebuilt key ${k} (${t.name}): patternCells=${t.practice[0].answer.patternCells.length}, notes=${Object.keys(t.practice[0].notes).length}, elim=${eliminates.length}`);
}

// ── Write back ─────────────────────────────────────────────────────
writeTeachData(TD);
