const seed = [0, 0, 4, 0, 0, 0, 6, 0, 5, 0, 0, 3, 0, 0, 7, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 9, 0, 5, 7, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 9, 0, 3, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 1, 2, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 8, 0, 0, 9, 0, 0, 7, 0, 9, 0, 0, 0, 3, 0, 0];

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
            if (this.board[i] !== 0) { this.candidates[i] = []; continue; }
            const row = Math.floor(i / 9), col = i % 9;
            this.candidates[i] = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => this.isSafeCheck(this.board, row, col, n));
        }
    }
    isSafeCheck(board, row, col, num) {
        for (let i = 0; i < 9; i++) {
            if (board[row * 9 + i] === num) return false;
            if (board[i * 9 + col] === num) return false;
        }
        const startRow = Math.floor(row / 3) * 3, startCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[(startRow + i) * 9 + (startCol + j)] === num) return false;
        return true;
    }
    getUnitIndices(type, idx) {
        const indices = [];
        if (type === 0) for (let i = 0; i < 9; i++) indices.push(idx * 9 + i);
        else if (type === 1) for (let i = 0; i < 9; i++) indices.push(i * 9 + idx);
        else { const r = Math.floor(idx / 3) * 3, c = (idx % 3) * 3; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) indices.push((r + i) * 9 + (c + j)); }
        return indices;
    }
    applySingles() {
        let changed = false;
        for (let i = 0; i < 81; i++) {
            if (this.board[i] === 0 && this.candidates[i].length === 1) { this.board[i] = this.candidates[i][0]; this.updateCandidates(); return true; }
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
    solveSimple() {
        let changed = true;
        while (changed) {
            changed = false;
            if (this.applySingles()) { changed = true; continue; }
            if (this.applyPointing()) { changed = true; continue; }
        }
        return this.board.every(v => v !== 0);
    }
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

function isSafe(board, row, col, num) {
    for (let i = 0; i < 9; i++) if (board[row * 9 + i] === num || board[i * 9 + col] === num) return false;
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[(startRow + i) * 9 + (startCol + j)] === num) return false;
    return true;
}

function get180DegSymmetricIndices(idx) {
    const r = Math.floor(idx / 9), c = idx % 9;
    const i2 = (8 - r) * 9 + (8 - c);
    return [...new Set([idx, i2])];
}

console.log("Attempting to reduce seed (22 hints) to 20 hints...");

// Find all symmetric pairs present
let pairs = [];
let seen = new Set();
for (let i = 0; i < 81; i++) {
    if (seed[i] !== 0) {
        if (seen.has(i)) continue;
        const sym = get180DegSymmetricIndices(i);
        if (sym.length === 2 && seed[sym[0]] !== 0 && seed[sym[1]] !== 0) { // Should be true if symmetric
            pairs.push(sym);
            sym.forEach(s => seen.add(s));
        }
    }
}

console.log(`Found ${pairs.length} symmetric pairs.`);

for (let p of pairs) {
    let testBoard = [...seed];
    testBoard[p[0]] = 0;
    testBoard[p[1]] = 0;

    if (countSolutions(testBoard, 2) === 1) {
        console.log(`\nSUCCESS! Reduced to 20 hints by removing indices ${p}`);
        console.log("Puzzle: " + JSON.stringify(testBoard));

        const ls = new LogicalSolver(testBoard);
        if (!ls.solveSimple()) {
            console.log("Logic: HARD (Simple Failed) - JACKPOT!");
        } else {
            console.log("Logic: Simple (Still too easy)");
        }
    }
}
console.log("Finished reduction attempts.");
