const fs = require('fs');
const path = require('path');

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

function solveAndFindSolutions(board, limit = 2) {
    let solutions = [];
    function solve() {
        if (solutions.length >= limit) return;
        let emptyCell = -1;
        for (let i = 0; i < 81; i++) {
            if (board[i] === 0) { emptyCell = i; break; }
        }
        if (emptyCell === -1) { solutions.push([...board]); return; }
        const row = Math.floor(emptyCell / 9);
        const col = emptyCell % 9;
        for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
                board[emptyCell] = num;
                solve();
                board[emptyCell] = 0;
                if (solutions.length >= limit) return;
            }
        }
    }
    solve();
    return solutions;
}

const levelsFilePath = path.join(__dirname, 'levels.js');
const levelsContent = fs.readFileSync(levelsFilePath, 'utf8');
const match = levelsContent.match(/const levels = (\[[\s\S]*?\]);/);
const levels = eval(match[1]);

const level1 = levels.find(l => l.id === 1);
const puzzle = [...level1.puzzle];
const solution = level1.solution;

console.log("Initial hints:", puzzle.filter(n => n !== 0).length);

let added = 0;
while (true) {
    const solutions = solveAndFindSolutions([...puzzle], 2);
    if (solutions.length <= 1) break;

    // Find first cell where solutions differ
    const s1 = solutions[0];
    const s2 = solutions[1];
    let diffIdx = -1;
    for (let i = 0; i < 81; i++) {
        if (s1[i] !== s2[i]) {
            diffIdx = i;
            break;
        }
    }

    if (diffIdx !== -1) {
        puzzle[diffIdx] = solution[diffIdx];
        added++;
    }
}

console.log("Final hints needed for uniqueness:", puzzle.filter(n => n !== 0).length);
console.log("Added hints:", added);
