const fs = require('fs');

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
            const row = Math.floor(i / 9);
            const col = i % 9;
            this.candidates[i] = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => this.isSafeCheck(this.board, row, col, n));
        }
    }

    isSafeCheck(board, row, col, num) {
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

    getUnitIndices(type, idx) {
        const indices = [];
        if (type === 0) for (let i = 0; i < 9; i++) indices.push(idx * 9 + i);
        else if (type === 1) for (let i = 0; i < 9; i++) indices.push(i * 9 + idx);
        else {
            const r = Math.floor(idx / 3) * 3;
            const c = (idx % 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) indices.push((r + i) * 9 + (c + j));
        }
        return indices;
    }

    applySingles() {
        let changed = false;
        for (let i = 0; i < 81; i++) {
            if (this.board[i] === 0 && this.candidates[i].length === 1) {
                this.board[i] = this.candidates[i][0];
                this.updateCandidates();
                return true;
            }
        }
        for (let type = 0; type < 3; type++) {
            for (let idx = 0; idx < 9; idx++) {
                const indices = this.getUnitIndices(type, idx);
                for (let n = 1; n <= 9; n++) {
                    const pos = indices.filter(i => this.board[i] === 0 && this.candidates[i].includes(n));
                    if (pos.length === 1) {
                        this.board[pos[0]] = n;
                        this.updateCandidates();
                        return true;
                    }
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
                                this.candidates[ri] = this.candidates[ri].filter(c => c !== num);
                                changed = true;
                            }
                        }
                    }
                    if (cols.size === 1) {
                        const c = [...cols][0];
                        for (let ci of this.getUnitIndices(1, c)) {
                            if (!indices.includes(ci) && this.candidates[ci] && this.candidates[ci].includes(num)) {
                                this.candidates[ci] = this.candidates[ci].filter(n => n !== num);
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }

    applyPairsTriples() {
        let changed = false;
        for (let type = 0; type < 3; type++) {
            for (let idx = 0; idx < 9; idx++) {
                const indices = this.getUnitIndices(type, idx).filter(i => this.board[i] === 0);
                if (indices.length < 2) continue;
                for (let i = 0; i < indices.length - 1; i++) {
                    for (let j = i + 1; j < indices.length; j++) {
                        const c1 = indices[i], c2 = indices[j];
                        if (this.candidates[c1].length === 2 && this.candidates[c2].length === 2 &&
                            this.candidates[c1][0] === this.candidates[c2][0] &&
                            this.candidates[c1][1] === this.candidates[c2][1]) {
                            const vals = this.candidates[c1];
                            for (let k of indices) {
                                if (k !== c1 && k !== c2) {
                                    let original = this.candidates[k].length;
                                    this.candidates[k] = this.candidates[k].filter(x => !vals.includes(x));
                                    if (this.candidates[k].length < original) changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }

    solveSimple() {
        let changed = true;
        while (changed) {
            changed = false;
            if (this.applySingles()) { changed = true; continue; }
            if (this.applyPointing()) { changed = true; continue; }
            if (this.applyPairsTriples()) { changed = true; continue; }
        }
        return this.board.every(v => v !== 0);
    }
}

function solveBacktrack(board, shuffle = false) {
    let empty = board.indexOf(0);
    if (empty === -1) return true;
    const r = Math.floor(empty / 9), c = empty % 9;
    let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (shuffle) nums.sort(() => Math.random() - 0.5);
    for (let n of nums) {
        if (isSafe(board, r, c, n)) {
            board[empty] = n;
            if (solveBacktrack(board, shuffle)) return true;
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

function get180DegSymmetricIndices(idx) {
    const r = Math.floor(idx / 9), c = idx % 9;
    const i2 = (8 - r) * 9 + (8 - c);
    return [...new Set([idx, i2])];
}

console.log("Searching for ANY 20-21 hint template...");

while (true) {
    let board = new Array(81).fill(0);
    solveBacktrack(board, true);
    let full = [...board];
    let puzzle = [...full];

    let groups = [];
    let seen = new Set();
    for (let i = 0; i < 81; i++) {
        if (seen.has(i)) continue;
        const sym = get180DegSymmetricIndices(i);
        groups.push(sym);
        sym.forEach(s => seen.add(s));
    }
    groups.sort(() => Math.random() - 0.5);

    for (let group of groups) {
        let tempVals = group.map(i => puzzle[i]);
        group.forEach(i => puzzle[i] = 0);

        // Quick check: if we drop below 20, abort this branch immediately to save time?
        // No, we might be at 22 and removing 2 takes us to 20.

        let solutions = countSolutions(puzzle, 2);
        if (solutions !== 1) {
            group.forEach((idx, i) => puzzle[idx] = tempVals[i]);
        }
    }

    const hintsCount = puzzle.filter(x => x !== 0).length;
    if (hintsCount <= 22) {
        process.stdout.write(`[${hintsCount}]`);
        const lsSimple = new LogicalSolver(puzzle);
        if (!lsSimple.solveSimple()) {
            console.log(`\nFOUND HARD SEED (${hintsCount} hints)`);
            console.log("Puzzle: " + JSON.stringify(puzzle));
            console.log("Solution: " + JSON.stringify(full));
            process.exit(0);
        } else {
            // It was solved by simple logic. Too easy. Keep searching.
            process.stdout.write('E');
        }
    }
}
