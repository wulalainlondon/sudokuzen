const fs = require('fs');
const path = require('path');

// --- Seed ---
// Found Golden Seed (22 hints, 180-degree symmetric)
const ORIGIN_SEED = [0, 0, 4, 0, 0, 0, 6, 0, 5, 0, 0, 3, 0, 0, 7, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 9, 0, 5, 7, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 9, 0, 3, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 1, 2, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 8, 0, 0, 9, 0, 0, 7, 0, 9, 0, 0, 0, 3, 0, 0];

// --- Helpers ---

function applyPermutation(board) {
    // 1. Digit Permutation
    const map = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
    let newBoard = board.map(n => n === 0 ? 0 : map[n - 1]);

    // 2. Transpose (Randomly)
    if (Math.random() > 0.5) {
        const tBoard = new Array(81).fill(0);
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) tBoard[c * 9 + r] = newBoard[r * 9 + c];
        newBoard = tBoard;
    }

    // 3. Row Band Swaps (Symmetric) - SKIPPED
    // Row swaps do not preserve 180 symmetry in general.
    // Transpose is sufficient for variation.

    return newBoard;
}



function solveBacktrack(board) {
    let empty = board.indexOf(0);
    if (empty === -1) return true;
    const r = Math.floor(empty / 9), c = empty % 9;
    for (let n = 1; n <= 9; n++) {
        if (isSafe(board, r, c, n)) {
            board[empty] = n;
            if (solveBacktrack(board)) return true;
            board[empty] = 0;
        }
    }
    return false;
}

function isSafe(board, row, col, num) {
    for (let i = 0; i < 9; i++) if (board[row * 9 + i] === num || board[i * 9 + col] === num) return false;
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[(startRow + i) * 9 + (startCol + j)] === num) return false;
    return true;
}

// --- Main execution ---

const levelsFilePath = path.join(__dirname, 'levels.js');
const levelsContent = fs.readFileSync(levelsFilePath, 'utf8');
const match = levelsContent.match(/const levels = (\[[\s\S]*?\]);/);
const levels = eval(match[1]);

console.log(`Regenerating ORIGIN levels using Golden Seed (22 hints, 180-deg)...`);

const regeneratedLevels = levels.map((level) => {
    // Target ORIGIN levels
    if (level.difficultyName !== 'ORIGIN 本源') return level;

    let puzzle = applyPermutation([...ORIGIN_SEED]);

    // Solve it to get solution string
    let full = [...puzzle];
    solveBacktrack(full);

    const hints = puzzle.filter(x => x !== 0).length;
    console.log(`Generated ORIGIN level ${level.id} (${level.displayName}) - Hints: ${hints} (Permuted)`);

    return { ...level, puzzle, solution: full };
});

const outputContent = `const levels = ${JSON.stringify(regeneratedLevels, null, 2)};`;
fs.writeFileSync(levelsFilePath, outputContent);
console.log("\nRegeneration complete!");
