const seed = [0, 0, 4, 0, 0, 0, 6, 0, 5, 0, 0, 3, 0, 0, 7, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 9, 0, 5, 7, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 9, 0, 3, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 1, 2, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 8, 0, 0, 9, 0, 0, 7, 0, 9, 0, 0, 0, 3, 0, 0];

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

// 1. Check Seed
console.log("Checking Seed...");
let b1 = [...seed];
if (solveBacktrack(b1)) console.log("Seed OK"); else console.log("Seed FAIL");

// 2. Check Digit Permutation
console.log("Checking Digit Permutation...");
const map = [2, 3, 4, 5, 6, 7, 8, 9, 1]; // Simple shift
let b2 = seed.map(n => n === 0 ? 0 : map[n - 1]);
if (solveBacktrack([...b2])) console.log("Digit Perm OK"); else console.log("Digit Perm FAIL");

// 3. Check Transpose
console.log("Checking Transpose...");
const tBoard = new Array(81).fill(0);
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) tBoard[c * 9 + r] = seed[r * 9 + c];
if (solveBacktrack([...tBoard])) console.log("Transpose OK"); else console.log("Transpose FAIL");
