/**
 * Rewrite technique 3 (locked_candidates / 封鎖) with a real puzzle-based example.
 * Uses level 9001 (靈台封印) as the base puzzle.
 */
import { readTeachData, writeTeachData } from './lib/writeTeachData.mjs';

const TD = readTeachData();

const puzzle = [0,0,7,4,0,3,0,0,5,0,6,0,0,8,0,0,2,0,0,0,1,5,0,6,0,0,0,0,3,0,1,5,7,2,0,0,7,5,0,0,6,4,0,0,0,1,2,6,0,0,0,0,4,0,0,0,0,6,4,5,7,0,0,0,7,5,9,0,1,4,0,0,0,1,0,8,7,2,3,5,0];
const solution = [2,8,7,4,1,3,6,9,5,5,6,3,7,8,9,1,2,4,9,4,1,5,2,6,8,7,3,4,3,9,1,5,7,2,8,6,7,5,8,2,6,4,9,3,1,1,2,6,3,9,8,5,4,7,3,9,2,6,4,5,7,1,8,8,7,5,9,3,1,4,6,2,6,1,4,8,7,2,3,5,9];

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

// Generate notes for ALL empty cells (needed for proper board display)
const allNotes = {};
for (let i = 0; i < 81; i++) {
  if (puzzle[i] === 0) {
    const c = getCandidates(puzzle, i);
    if (c.length > 0) allNotes[String(i)] = c;
  }
}

// The locked candidates pattern:
// Digit 9 in Box(1,1) [R4-R6, C4-C6] only appears in R6 (cells 49,50)
// So 9 can be eliminated from R6 outside Box(1,1): cells 51 and 53

// Visible cells for teach: focus on Row 6 and Box(1,1)
// Box(1,1) cells: 30,31,32,39,40,41,48,49,50
// Row 6 cells: 45,46,47,48,49,50,51,52,53
const box11 = [30,31,32,39,40,41,48,49,50];
const row6 = [45,46,47,48,49,50,51,52,53];
const relevantCells = [...new Set([...box11, ...row6])];

// Show only relevant cells' notes to keep the board clean
const teachNotes = {};
for (const idx of relevantCells) {
  if (allNotes[String(idx)]) {
    teachNotes[String(idx)] = allNotes[String(idx)];
  }
}

// Also include a few nearby cells for context
for (const idx of [27, 29, 34, 35, 38, 42, 43, 44]) {
  if (allNotes[String(idx)]) {
    teachNotes[String(idx)] = allNotes[String(idx)];
  }
}

const t = TD['3'];

// ── Rewrite example ────────────────────────────────────────────────
t.example = {
  board: puzzle.slice(),
  given: puzzle.map(v => v !== 0 ? v : 0),
  notes: teachNotes,
  steps: [
    {
      text: "觀察中央宮（Box 5）：在 R4-R6、C4-C6 的九宮格中，數字 9 只出現在 R6C5 與 R6C6 的候選裡。R4 和 R5 的候選都不含 9。",
      focusCells: [49, 50],
      visibleCells: [...box11, ...row6],
      highlightDigits: {
        "49": [9],
        "50": [9],
      },
      eliminateCells: [],
      warnCells: [],
      warnDigit: null,
    },
    {
      text: "判定互鎖成立：中央宮的 9 只能落在 R6（第 6 行），因此 R6 中宮外的其他格子就不可能再放 9。這就是「宮鎖行」的經典型態。",
      focusCells: [49, 50, 51, 53],
      highlightDigits: {
        "49": [9],
        "50": [9],
      },
      eliminateCells: [],
      warnCells: [51, 53],
      warnDigit: 9,
    },
    {
      text: "操作：刪除 R6C7 和 R6C9 的候選 9。刪減後 R6C7 收斂為 {5,8}、R6C9 收斂為 {3,7,8}，為後續推理打開空間。",
      focusCells: [49, 50, 51, 53],
      highlightDigits: {
        "49": [9],
        "50": [9],
      },
      eliminateCells: [
        { cell: 51, digit: 9 },
        { cell: 53, digit: 9 },
      ],
      warnCells: [],
      warnDigit: null,
    },
  ],
};

// ── Rewrite explanation ────────────────────────────────────────────
t.explanation = [
  "鎖定候選（Locked Candidates）是跨區域推理的入門技巧，也叫 Pointing 或 Claiming。",
  "核心邏輯：如果某個數字在一個宮內只出現在同一行（或列），那麼該行（或列）的宮外格就不可能再放這個數字。",
  "實戰口訣：逐宮掃描，看候選是否排成一條線；若是，就鎖住該線，清除宮外同線候選。",
];

// ── Rewrite practice ──────────────────────────────────────────────
// Use the same puzzle but show more cells, targeting the row-2-col-1 pattern
// Digit 2 in Box(0,0) only in col 1: R1C1 and R3C1 → eliminate from R7C1, R8C1

const practiceNotes = {};
// Show notes for col 1 cells and box(0,0) cells
const practiceCells = [0, 1, 9, 18, 19, 27, 54, 55, 56, 63, 72];
for (const idx of practiceCells) {
  if (allNotes[String(idx)]) {
    practiceNotes[String(idx)] = allNotes[String(idx)];
  }
}

t.practice = [
  {
    board: puzzle.slice(),
    given: puzzle.map(v => v !== 0 ? v : 0),
    notes: practiceNotes,
    answer: {
      eliminates: [
        [54, 2],
        [63, 2],
      ],
      patternCells: [0, 18, 54, 63],
      description: "宮鎖列：數字 2 在左上宮只出現在第 1 列（R1C1、R3C1），因此可消去第 1 列宮外的 R7C1 和 R8C1 的候選 2。",
      proof: [
        "左上宮（R1-R3, C1-C3）中，數字 2 只在 R1C1 和 R3C1 的候選裡出現。",
        "這代表該宮的 2 必定在第 1 列。",
        "因此第 1 列的其他宮格（R7C1、R8C1）不可能是 2。",
      ],
      aicChain: [],
    },
    solution: solution.slice(),
  },
];

// ── Write back ─────────────────────────────────────────────────────
writeTeachData(TD);
console.log('Technique 3 rewritten with real puzzle data.');
console.log('Example: digit 9 locked in Box(1,1) R6 → eliminate R6C7, R6C9');
console.log('Practice: digit 2 locked in Box(0,0) C1 → eliminate R7C1, R8C1');
