const fs = require('fs');

// --- ORIGIN SEED (22 Hints) ---
const ORIGIN_SEED = [0, 0, 4, 0, 0, 0, 6, 0, 5, 0, 0, 3, 0, 0, 7, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 9, 0, 5, 7, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 9, 0, 3, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 1, 2, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 8, 0, 0, 9, 0, 0, 7, 0, 9, 0, 0, 0, 3, 0, 0];

// --- Solver Class ---
class LogicalSolver {
    constructor(board) {
        this.board = [...board];
        this.candidates = Array(81).fill(null).map((_, i) => {
            if (this.board[i] !== 0) return [];
            return [1, 2, 3, 4, 5, 6, 7, 8, 9];
        });
        this.updateCandidates();
    }
    updateCandidates() {
        for (let i = 0; i < 81; i++) {
            if (this.board[i] !== 0) {
                this.candidates[i] = [];
                continue;
            }
            const row = Math.floor(i / 9), col = i % 9;
            this.candidates[i] = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => this.isSafeCheck(this.board, row, col, n));
        }
    }
    isSafeCheck(board, row, col, num) {
        for (let i = 0; i < 9; i++) {
            if (board[row * 9 + i] === num) return false;
            if (board[i * 9 + col] === num) return false;
        }
        const sr = Math.floor(row / 3) * 3, sc = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[(sr + i) * 9 + (sc + j)] === num) return false;
        return true;
    }
    getUnitIndices(type, idx) {
        const indices = [];
        if (type === 0) for (let i = 0; i < 9; i++) indices.push(idx * 9 + i);
        else if (type === 1) for (let i = 0; i < 9; i++) indices.push(i * 9 + idx);
        else {
            const r = Math.floor(idx / 3) * 3, c = (idx % 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) indices.push((r + i) * 9 + (c + j));
        }
        return indices;
    }
    applySingles() {
        for (let i = 0; i < 81; i++) {
            if (this.board[i] === 0 && this.candidates[i].length === 1) {
                this.board[i] = this.candidates[i][0]; this.updateCandidates(); return true;
            }
        }
        for (let type = 0; type < 3; type++) {
            for (let idx = 0; idx < 9; idx++) {
                const indices = this.getUnitIndices(type, idx);
                for (let n = 1; n <= 9; n++) {
                    const pos = indices.filter(i => this.board[i] === 0 && this.candidates[i].includes(n));
                    if (pos.length === 1) { this.board[pos[0]] = n; this.updateCandidates(); return true; }
                }
            }
        }
        return false;
    }
    applyPointing() {
        let changed = false;
        for (let boxIdx = 0; boxIdx < 9; boxIdx++) {
            const indices = this.getUnitIndices(2, boxIdx);
            for (let num = 1; num <= 9; num++) {
                const possible = indices.filter(i => this.board[i] === 0 && this.candidates[i].includes(num));
                if (possible.length > 1 && possible.length <= 3) {
                    const rows = new Set(possible.map(i => Math.floor(i / 9)));
                    const cols = new Set(possible.map(i => i % 9));
                    if (rows.size === 1) {
                        const r = [...rows][0];
                        for (let ri of this.getUnitIndices(0, r)) {
                            if (!indices.includes(ri) && this.candidates[ri] && this.candidates[ri].includes(num)) {
                                this.candidates[ri] = this.candidates[ri].filter(c => c !== num); changed = true;
                            }
                        }
                    }
                    if (cols.size === 1) {
                        const c = [...cols][0];
                        for (let ci of this.getUnitIndices(1, c)) {
                            if (!indices.includes(ci) && this.candidates[ci] && this.candidates[ci].includes(num)) {
                                this.candidates[ci] = this.candidates[ci].filter(n => n !== num); changed = true;
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }
    applyPairsTriples() { return false; } // Minimal check logic
    applyXWing() { return false; }
    applyXYWing() { return false; }

    solveAdvanced() {
        // Just checking basic logic for "Easy" classification
        let changed = true;
        while (changed) {
            changed = false;
            if (this.applySingles()) { changed = true; continue; }
            if (this.applyPointing()) { changed = true; continue; }
        }
        return this.board.every(v => v !== 0);
    }
}

// --- Combinatorics ---

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const first = arr[0];
    const rest = arr.slice(1);
    const combsWithoutFirst = getCombinations(rest, k);
    const combsWithFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    return [...combsWithFirst, ...combsWithoutFirst];
}

// --- Helpers ---

function isSafe(board, row, col, num) {
    for (let i = 0; i < 9; i++) if (board[row * 9 + i] === num || board[i * 9 + col] === num) return false;
    const sr = Math.floor(row / 3) * 3, sc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[(sr + i) * 9 + (sc + j)] === num) return false;
    return true;
}

function countSolutions(board, limit = 2) {
    let count = 0;
    function backtrack(b) {
        if (count >= limit) return;
        let empty = b.indexOf(0);
        if (empty === -1) { count++; return; }
        const r = Math.floor(empty / 9), c = empty % 9;
        for (let n = 1; n <= 9; n++) {
            if (isSafe(b, r, c, n)) {
                b[empty] = n;
                backtrack(b);
                b[empty] = 0;
                if (count >= limit) return;
            }
        }
    }
    backtrack([...board]);
    return count;
}


// --- Main ---

console.log("Evolution Strategy: Reducing ORIGIN SEED (22 hints)...");

// 1. Identify Hint Indices
const hintIndices = [];
for (let i = 0; i < 81; i++) {
    if (ORIGIN_SEED[i] !== 0) hintIndices.push(i);
}
console.log(`Original Hints: ${hintIndices.length}`);

// 2. Try removing 4 (Target 18)
console.log("Targeting 18 hints (Remove 4)...");
// 22 choose 4 = 7315.
const combs4 = getCombinations(hintIndices, 4);
console.log(`Combinations to check: ${combs4.length}`);

let found18 = 0;
for (let removeIndices of combs4) {
    let puzzle = [...ORIGIN_SEED];
    removeIndices.forEach(idx => puzzle[idx] = 0);

    if (countSolutions(puzzle, 2) === 1) {
        // Found valid 18!
        console.log(`\nFOUND EXTINCTION SEED (18 hints)`);
        console.log("Remove Indices: " + removeIndices);
        console.log("Puzzle: " + JSON.stringify(puzzle));

        // Check Logic
        const ls = new LogicalSolver(puzzle);
        if (!ls.solveAdvanced()) {
            console.log("Logic: HARD (Singles/Pointing Failed) - GOOD!");
            process.exit(0); // Stop at first good one
        } else {
            console.log("Logic: Simple (Too easy) - Skip");
        }
        found18++;
    }
}

if (found18 === 0) {
    console.log("No valid 18 hint puzzles found.");
}

// 3. Try removing 5 (Target 17)
console.log("Targeting 17 hints (Remove 5)...");
// 22 choose 5 = 26334
const combs5 = getCombinations(hintIndices, 5);
console.log(`Combinations to check: ${combs5.length}`);

for (let removeIndices of combs5) {
    let puzzle = [...ORIGIN_SEED];
    removeIndices.forEach(idx => puzzle[idx] = 0);

    if (countSolutions(puzzle, 2) === 1) {
        console.log(`\nFOUND EXTINCTION SEED (17 hints)`);
        console.log("Remove Indices: " + removeIndices);
        console.log("Puzzle: " + JSON.stringify(puzzle));
        process.exit(0);
    }
}

console.log("Search complete.");
