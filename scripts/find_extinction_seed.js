const fs = require('fs');

// --- Logical Solver Class (Enhanced with Swordfish) ---
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
        // Naked Singles
        for (let i = 0; i < 81; i++) {
            if (this.board[i] === 0 && this.candidates[i].length === 1) {
                this.board[i] = this.candidates[i][0];
                this.updateCandidates();
                return true;
            }
        }
        // Hidden Singles
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

    applyXWing() {
        let changed = false;
        for (let n = 1; n <= 9; n++) {
            // Rows
            const rows = [];
            for (let r = 0; r < 9; r++) {
                const cols = [];
                for (let c = 0; c < 9; c++) {
                    const idx = r * 9 + c;
                    if (this.board[idx] === 0 && this.candidates[idx].includes(n)) cols.push(c);
                }
                if (cols.length === 2) rows.push({ r, cols });
            }
            for (let i = 0; i < rows.length - 1; i++) {
                for (let j = i + 1; j < rows.length; j++) {
                    const r1 = rows[i], r2 = rows[j];
                    if (r1.cols[0] === r2.cols[0] && r1.cols[1] === r2.cols[1]) {
                        const c1 = r1.cols[0], c2 = r1.cols[1];
                        const rA = r1.r, rB = r2.r;
                        for (let r = 0; r < 9; r++) {
                            // Eliminate from columns c1 and c2 in other rows
                            if (r !== rA && r !== rB) {
                                const idx1 = r * 9 + c1, idx2 = r * 9 + c2;
                                if (this.board[idx1] === 0 && this.candidates[idx1].includes(n)) {
                                    this.candidates[idx1] = this.candidates[idx1].filter(x => x !== n);
                                    changed = true;
                                }
                                if (this.board[idx2] === 0 && this.candidates[idx2].includes(n)) {
                                    this.candidates[idx2] = this.candidates[idx2].filter(x => x !== n);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
            // Cols (Dual) ... simplified for brevity, X-Wing usually symmetrical
            // But let's check cols logic to match row logic
            const colsData = [];
            for (let c = 0; c < 9; c++) {
                const rws = [];
                for (let r = 0; r < 9; r++) {
                    const idx = r * 9 + c;
                    if (this.board[idx] === 0 && this.candidates[idx].includes(n)) rws.push(r);
                }
                if (rws.length === 2) colsData.push({ c, rows: rws });
            }
            for (let i = 0; i < colsData.length - 1; i++) {
                for (let j = i + 1; j < colsData.length; j++) {
                    const c1 = colsData[i], c2 = colsData[j];
                    if (c1.rows[0] === c2.rows[0] && c1.rows[1] === c2.rows[1]) {
                        const r1 = c1.rows[0], r2 = c1.rows[1];
                        const cA = c1.c, cB = c2.c;
                        for (let c = 0; c < 9; c++) {
                            if (c !== cA && c !== cB) {
                                const idx1 = r1 * 9 + c, idx2 = r2 * 9 + c;
                                if (this.board[idx1] === 0 && this.candidates[idx1].includes(n)) {
                                    this.candidates[idx1] = this.candidates[idx1].filter(x => x !== n);
                                    changed = true;
                                }
                                if (this.board[idx2] === 0 && this.candidates[idx2].includes(n)) {
                                    this.candidates[idx2] = this.candidates[idx2].filter(x => x !== n);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }

        }
        return changed;
    }

    applyXYWing() {
        let changed = false;
        const bivalueCells = [];
        for (let i = 0; i < 81; i++) {
            if (this.board[i] === 0 && this.candidates[i].length === 2) bivalueCells.push(i);
        }
        for (let pivot of bivalueCells) {
            const [X, Y] = this.candidates[pivot];
            const wings = bivalueCells.filter(cell => cell !== pivot && this.areVisible(pivot, cell));
            for (let wing1 of wings) {
                if (!this.candidates[wing1].includes(X) && !this.candidates[wing1].includes(Y)) continue;
                const A = this.candidates[pivot][0]; // X
                const B = this.candidates[pivot][1]; // Y

                if (this.candidates[wing1].includes(A)) {
                    const C = this.candidates[wing1].find(v => v !== A);
                    if (C === B) continue;
                    const wing2Candidates = wings.filter(w => w !== wing1 && this.candidates[w].includes(B) && this.candidates[w].includes(C));
                    for (let wing2 of wing2Candidates) {
                        for (let k = 0; k < 81; k++) {
                            if (this.board[k] === 0 && k !== pivot && k !== wing1 && k !== wing2 && this.candidates[k].includes(C)) {
                                if (this.areVisible(k, wing1) && this.areVisible(k, wing2)) {
                                    this.candidates[k] = this.candidates[k].filter(v => v !== C);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }

    // Check if cell1 and cell2 see each other
    areVisible(cell1, cell2) {
        if (cell1 === cell2) return false;
        const r1 = Math.floor(cell1 / 9), c1 = cell1 % 9;
        const r2 = Math.floor(cell2 / 9), c2 = cell2 % 9;
        if (r1 === r2 || c1 === c2) return true;
        const br1 = Math.floor(r1 / 3), bc1 = Math.floor(c1 / 3);
        const br2 = Math.floor(r2 / 3), bc2 = Math.floor(c2 / 3);
        return br1 === br2 && bc1 === bc2;
    }

    applySwordfish() {
        let changed = false;
        for (let n = 1; n <= 9; n++) {
            // Rows
            const rows = [];
            for (let r = 0; r < 9; r++) {
                const cols = [];
                for (let c = 0; c < 9; c++) {
                    const idx = r * 9 + c;
                    if (this.board[idx] === 0 && this.candidates[idx].includes(n)) cols.push(c);
                }
                // Swordfish needs rows with 2 OR 3 candidates
                if (cols.length >= 2 && cols.length <= 3) rows.push({ r, cols });
            }
            if (rows.length >= 3) {
                // Try to find a triplet of rows that share at most 3 columns total
                // This is a simplified check (exact 3 cols shared by 3 rows)
                // A full implementation is more complex, but let's try finding 3 rows whoses indices union is size 3
                for (let i = 0; i < rows.length - 2; i++) {
                    for (let j = i + 1; j < rows.length - 1; j++) {
                        for (let k = j + 1; k < rows.length; k++) {
                            const r1 = rows[i], r2 = rows[j], r3 = rows[k];
                            const unionCols = new Set([...r1.cols, ...r2.cols, ...r3.cols]);
                            if (unionCols.size === 3) {
                                // Found Swordfish!
                                const cCoords = [...unionCols];
                                const rCoords = [r1.r, r2.r, r3.r];

                                // Eliminate n from these columns in other rows
                                for (let r = 0; r < 9; r++) {
                                    if (!rCoords.includes(r)) {
                                        for (let c of cCoords) {
                                            const idx = r * 9 + c;
                                            if (this.board[idx] === 0 && this.candidates[idx].includes(n)) {
                                                this.candidates[idx] = this.candidates[idx].filter(x => x !== n);
                                                changed = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Cols logic omitted for brevity in search script, focus on rows
        }
        return changed;
    }

    solveAdvanced() {
        let changed = true;
        while (changed) {
            changed = false;
            if (this.applySingles()) { changed = true; continue; }
            if (this.applyPointing()) { changed = true; continue; }
            if (this.applyPairsTriples()) { changed = true; continue; }
            if (this.applyXWing()) { changed = true; continue; }
            if (this.applyXYWing()) { changed = true; continue; }
            if (this.applySwordfish()) { changed = true; continue; }
        }
        return this.board.every(v => v !== 0);
    }

    // Check if it FAILS X-Wing/XY-Wing but MIGHT succeed with harder logic?
    // User wants "Must involve Chains or Swordfish".
    // Definition: Solvable (Unique) AND !solveWithXWing().
    solveWithXWing() {
        let changed = true;
        while (changed) {
            changed = false;
            if (this.applySingles()) { changed = true; continue; }
            if (this.applyPointing()) { changed = true; continue; }
            if (this.applyPairsTriples()) { changed = true; continue; }
            if (this.applyXWing()) { changed = true; continue; }
            if (this.applyXYWing()) { changed = true; continue; }
        }
        return this.board.every(v => v !== 0);
    }
}

// --- Generation Helpers ---

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


// --- Main Search ---

console.log("Searching for Chaos Seeds (17-19 Hints, Extreme Logic)...");

let attempts = 0;
while (true) {
    attempts++;
    if (attempts % 1000 === 0) process.stdout.write('.');

    // 1. Generate full board
    let board = new Array(81).fill(0);
    solveBacktrack(board, true);
    let full = [...board];
    let puzzle = [...full];

    // 2. Remove aggressively to 17-19
    // Asymmetric removal: Just random indices
    let indices = Array.from({ length: 81 }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);

    // Target 18 hints first (easier than 17)
    let targetHints = Math.random() > 0.8 ? 17 : 18;

    // Naive removal: just clear and check uniqueness later? Too slow.
    // Better: Remove one by one, check uniqueness? Too slow for 1000s of attempts.
    // Hybrid: Bulk remove to ~25, then strict remove?

    // Fast path: Just make a random pattern of 18 clues and populate from board?
    // No, generating a valid 18-clue pattern is hard.

    // Standard random removal:
    for (let idx of indices) {
        let temp = puzzle[idx];
        puzzle[idx] = 0;

        // Critical: Check uniqueness periodically? or only at end?
        // Checking at every step is slow but safe.
        // Let's check when hints < 25
        const currentHints = puzzle.filter(x => x !== 0).length;
        if (currentHints < 25) {
            let sols = countSolutions(puzzle, 2);
            if (sols !== 1) {
                puzzle[idx] = temp; // Put back
                // If we fail to remove too many, we won't reach 18.
                // Heuristic: swap this removal for another?
            }
        }

        if (currentHints <= targetHints) break; // Reached goal?
    }

    const count = puzzle.filter(x => x !== 0).length;

    // 3. Verify Constraints
    if (count <= 19) { // Accept 19 as "almost" to log
        if (countSolutions(puzzle, 2) === 1) {

            // 4. Logic Check
            const ls = new LogicalSolver(puzzle);
            // Must FAIL X-Wing (meaning process returns false)
            const solvedByHard = ls.solveWithXWing();

            if (!solvedByHard) {
                // It is Unique, but Fails X-Wing -> EXTREME LOGIC FOUND (Swordfish/Chain)
                console.log(`\n\nFOUND CHAOS SEED! (${count} hints)`);
                console.log(`Logic: EXTREME (Failed X-Wing)`);
                console.log("Puzzle: " + JSON.stringify(puzzle));
                console.log("Solution: " + JSON.stringify(full));
                process.exit(0);
            } else {
                console.log(`\n[${count}] Found unique, but logic was too easy (Singles/Pairs/X-Wing solvable).`);
            }
        }
    }
}
