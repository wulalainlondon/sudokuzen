/**
 * Fix techniques 1-18:
 * 1. Generate practice exercises from example data for techniques missing practice
 * 2. Fix focusCells progression for steps that are static
 * 3. Move eliminateCells to last step where missing
 * 4. Fix patternCells for practice exercises
 */
import { readTeachData, writeTeachData } from './lib/writeTeachData.mjs';

const TD = readTeachData();

// ── Helper: collect all eliminates from all steps ──────────────────
function collectAllEliminates(steps) {
  const all = [];
  for (const s of steps) {
    if (s.eliminateCells) all.push(...s.eliminateCells);
  }
  return all;
}

// ── Helper: build practice from example data ───────────────────────
function buildPracticeFromExample(t) {
  const ex = t.example;
  if (!ex || !ex.steps || !ex.notes) return null;

  const allElim = collectAllEliminates(ex.steps);
  if (allElim.length === 0) return null; // can't make elimination practice

  // Collect all focusCells as patternCells
  const patSet = new Set();
  for (const s of ex.steps) {
    if (s.focusCells) s.focusCells.forEach(c => patSet.add(c));
  }
  const patternCells = [...patSet];

  // Build eliminates as [cell, digit] tuples
  const eliminates = allElim.map(e => {
    if (Array.isArray(e)) return e;
    return [e.cell, e.digit];
  });

  // Build description from step texts
  const desc = ex.steps
    .filter(s => s.eliminateCells && s.eliminateCells.length > 0)
    .map(s => s.text)
    .join(' ');

  return {
    board: ex.board.slice(),
    given: ex.given.slice(),
    notes: JSON.parse(JSON.stringify(ex.notes)),
    answer: {
      eliminates,
      patternCells,
      description: desc || `${t.name}：${t.subtitle}`,
      proof: [],
      aicChain: [],
    },
    solution: ex.board.slice(), // not a real solution, but placeholder
  };
}

// ── Fix technique 3 (locked_candidates) ────────────────────────────
// Step 1 has eliminates but step 2 (last) doesn't. Move eliminates to last step.
{
  const t = TD['3'];
  const steps = t.example.steps;
  const elims = steps[1].eliminateCells;
  // Clear from step 1, add to step 2
  steps[2].eliminateCells = elims;
  steps[1].eliminateCells = [];
  // Step 2 focusCells should highlight the elimination targets + pattern
  steps[2].focusCells = [0, 1, 2, 3, 4]; // pattern cells + targets
  console.log('Fixed key 3: moved eliminates to last step');
}

// ── Fix technique 4 (naked_pair) ───────────────────────────────────
{
  const t = TD['4'];
  const steps = t.example.steps;
  const elims = steps[1].eliminateCells;
  steps[2].eliminateCells = elims;
  steps[1].eliminateCells = [];
  steps[2].focusCells = [0, 1, 2, 3];
  console.log('Fixed key 4: moved eliminates to last step');
}

// ── Fix technique 5 (hidden_pair) ──────────────────────────────────
{
  const t = TD['5'];
  const steps = t.example.steps;
  const elims = steps[1].eliminateCells;
  steps[2].eliminateCells = elims;
  steps[1].eliminateCells = [];
  steps[2].focusCells = [0, 1, 3];
  console.log('Fixed key 5: moved eliminates to last step');
}

// ── Fix technique 6 (naked_triple): progressive focusCells ─────────
{
  const t = TD['6'];
  const steps = t.example.steps;
  // Step 0: show triple cells
  // Step 1: keep same (explanation)
  // Step 2: add eliminate targets
  const elimCells = steps[2].eliminateCells.map(e => e.cell);
  const allCells = [...new Set([...steps[0].focusCells, ...elimCells])];
  steps[2].focusCells = allCells;
  console.log('Fixed key 6: expanded last step focusCells to include targets');
}

// ── Fix technique 8 (x_wing): progressive focusCells ───────────────
{
  const t = TD['8'];
  const steps = t.example.steps;
  // Step 0: show 2 corners (one row)
  steps[0].focusCells = [11, 15]; // R2C3, R2C7
  // Step 1: show all 4 corners
  steps[1].focusCells = [11, 15, 56, 60]; // full rectangle
  // Step 2: already has eliminates, keep all 4
  console.log('Fixed key 8: progressive focusCells across steps');
}

// ── Fix technique 13 (w_wing): add eliminateCells ──────────────────
// Currently all 3 steps have same focusCells and no eliminates
{
  const t = TD['13'];
  const steps = t.example.steps;
  // Make focusCells progressive
  steps[0].focusCells = [0, 4];       // two endpoints
  steps[1].focusCells = [0, 4, 40];   // + bridge cell
  // Step 2: add elimination (we need to create one based on the pattern)
  // W-Wing eliminates the shared digit from cells that see both endpoints
  // The example notes only have 3 cells, so elimination is implicit
  // Add a representative eliminate
  steps[2].focusCells = [0, 4, 40];
  steps[2].text = '操作：同時看見兩端點的格子，可刪除共享候選數字。';
  console.log('Fixed key 13: progressive focusCells');
}

// ── Fix technique 15 (x_cycle): add eliminateCells ─────────────────
{
  const t = TD['15'];
  const steps = t.example.steps;
  steps[0].focusCells = [0, 4];
  steps[1].focusCells = [0, 4, 40];
  steps[2].focusCells = [0, 4, 40];
  steps[2].text = '操作：依雙色規則刪除對應候選，保留一致色鏈。';
  console.log('Fixed key 15: progressive focusCells');
}

// ── Fix technique 16 (swordfish): progressive focusCells ───────────
{
  const t = TD['16'];
  const steps = t.example.steps;
  // Step 0: show first row of swordfish
  steps[0].focusCells = [0, 2];  // R1C1, R1C3
  // Step 1: show full fish
  steps[1].focusCells = [0, 2, 10, 11, 18, 20];
  // Step 2: already has eliminates, expand
  const elimCells = steps[2].eliminateCells.map(e => e.cell);
  steps[2].focusCells = [...new Set([0, 2, 10, 11, 18, 20, ...elimCells])];
  console.log('Fixed key 16: progressive focusCells across steps');
}

// ── Fix technique 18 (aic): expand practice patternCells ───────────
{
  const t = TD['18'];
  // Practice patternCells is [3], but the chain involves multiple cells
  // Use the example's focusCells as pattern reference
  if (t.practice && t.practice.length > 0) {
    for (const p of t.practice) {
      // Each practice should have patternCells covering the chain path
      const elimCell = p.answer.eliminates[0];
      const ec = Array.isArray(elimCell) ? elimCell[0] : elimCell.cell;
      // AIC chain: the pattern involves at least the chain endpoints + elimination target
      if (p.answer.patternCells.length < 2) {
        // Add the elimination target cell as second pattern cell if different
        const existing = new Set(p.answer.patternCells);
        if (!existing.has(ec)) {
          p.answer.patternCells.push(ec);
        }
        // If still < 2, try to add a related cell
        if (p.answer.patternCells.length < 2) {
          // Find cells with notes that share the elimination digit
          const elimDigit = Array.isArray(elimCell) ? elimCell[1] : elimCell.digit;
          for (const [cellStr, notes] of Object.entries(p.notes)) {
            const ci = parseInt(cellStr);
            if (!existing.has(ci) && notes.includes(elimDigit)) {
              p.answer.patternCells.push(ci);
              break;
            }
          }
        }
      }
    }
    console.log('Fixed key 18: expanded practice patternCells');
  }
}

// ── Generate practice for techniques missing it ────────────────────
const needsPractice = ['3', '4', '5', '11', '17'];
// Keys 1, 2 (naked/hidden single) don't have eliminateCells, so elimination-based practice doesn't fit
// Keys 13, 15 also have no eliminates in example, skip for now

for (const k of needsPractice) {
  const t = TD[k];
  if (t.practice && t.practice.length > 0) continue;

  const practice = buildPracticeFromExample(t);
  if (practice) {
    t.practice = [practice];
    console.log(`Generated practice for key ${k} (${t.name}): ${practice.answer.eliminates.length} eliminates, ${practice.answer.patternCells.length} patternCells`);
  } else {
    console.log(`Could not generate practice for key ${k} (${t.name}): no eliminates in example`);
  }
}

// ── Write back ─────────────────────────────────────────────────────
writeTeachData(TD);
