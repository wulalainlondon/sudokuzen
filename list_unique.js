const fs = require('fs');
const path = require('path');

// --- Sudoku Solver Logic (Same as before) ---
function isValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) {
        if (board[row * 9 + i] === num) return false;
        if (board[i * 9 + col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[(startRow + i) * 9 + (startCol + j)] === num) return false;
        }
    }
    return true;
}

function countSolutions(board, limit = 2) {
    let solutionsFound = 0;
    function solve() {
        if (solutionsFound >= limit) return;
        let emptyCell = -1;
        for (let i = 0; i < 81; i++) {
            if (board[i] === 0) { emptyCell = i; break; }
        }
        if (emptyCell === -1) { solutionsFound++; return; }
        const row = Math.floor(emptyCell / 9);
        const col = emptyCell % 9;
        for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
                board[emptyCell] = num;
                solve();
                board[emptyCell] = 0;
                if (solutionsFound >= limit) return;
            }
        }
    }
    solve();
    return solutionsFound;
}

const levelsFilePath = path.join(__dirname, 'levels.js');
const levelsContent = fs.readFileSync(levelsFilePath, 'utf8');
const match = levelsContent.match(/const levels = (\[[\s\S]*?\]);/);
const levels = eval(match[1]);

const uniqueIds = [];
levels.forEach(level => {
    const solutions = countSolutions([...level.puzzle], 2);
    if (solutions === 1) uniqueIds.push(level.id);
});

console.log("Unique Level IDs:", uniqueIds.join(", "));
console.log("Count:", uniqueIds.length);
