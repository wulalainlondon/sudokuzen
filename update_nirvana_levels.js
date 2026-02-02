const fs = require('fs');
const path = require('path');

// --- Seedable Random Number Generator (Mulberry32) ---
// Since we need deterministic random based on level id
function sfc32(a, b, c, d) {
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

function createRandom(seed) {
    // Generate initial states from seed
    let a = seed ^ 0xDEADBEEF;
    let b = (seed << 13) ^ 0x12345678;
    let c = (seed >>> 7) ^ 0x87654321;
    let d = seed + 0xABCDEF01;
    let rand = sfc32(a, b, c, d);
    // Warm up
    for (let i = 0; i < 20; i++) rand();

    return {
        next: rand,
        nextInt: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
        shuffle: (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        },
        choice: (array) => array[Math.floor(rand() * array.length)]
    };
}

// --- Sudoku Solver (from regenerate_levels.js) ---
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

// --- SudokuLevelSystem ---
class SudokuLevelSystem {
    constructor() {
        this.base_seeds = [
            "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
            "000000001002000030400050000010000060000700000008000400000302000050000100700000000",
            "000000012000000003400005000006000070000000008000900000500020060080300000020000000",
            "000000010000002030400500000010000060000070000008000400000305000002000010700000000",
            "000000010002000030400050000000006002007000800030400000500100000000000406700000000",
            "000000010000000023400005000006007000000100000002080000300000040050060000000020000",
            "000000010000203000400050000001000060020700000008000400000300002050000100700000000",
            "000000001002003000400000050010006000000700002030000000000500600700010000000004000",
            "000000010000000200300400000000050060007000800040000030200000004060300000100000000",
            "000000010020000003400050000000600002007003000010000040500000600000100000000800000"
        ];
    }

    getLevel(levelNum) {
        const rng = createRandom(levelNum);

        // 1. Pick base seed
        const baseStr = rng.choice(this.base_seeds);
        let grid = [];
        for (let i = 0; i < 81; i += 9) {
            grid.push(baseStr.substring(i, i + 9).split('').map(Number));
        }

        // 2. Transpose helper
        const transpose = (m) => m[0].map((_, i) => m.map(row => row[i]));
        const reverseRows = (m) => m.map(row => [...row].reverse());

        // 3. Digit Permutation
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        rng.shuffle(nums);
        const mapping = { 0: 0 };
        for (let i = 0; i < 9; i++) mapping[i + 1] = nums[i];
        grid = grid.map(row => row.map(n => mapping[n]));

        // 4. Random rotation and flip
        const rotations = rng.nextInt(0, 3);
        for (let i = 0; i < rotations; i++) {
            grid = reverseRows(transpose(grid));
        }
        if (rng.next() > 0.5) {
            grid = reverseRows(grid);
        }

        // Flatten
        return grid.flat();
    }
}

// --- Main execution ---
const levelsFilePath = path.join(__dirname, 'levels.js');
const levelsContent = fs.readFileSync(levelsFilePath, 'utf8');
const match = levelsContent.match(/const levels = (\[[\s\S]*?\]);/);
if (!match) {
    console.error("Could not find levels array in levels.js");
    process.exit(1);
}

const levels = eval(match[1]);
const engine = new SudokuLevelSystem();

console.log(`Updating NIRVANA levels...`);

const updatedLevels = levels.map((level) => {
    // Check if difficulty is NIRVANA (EXTINCTION 寂滅 in levels.js)
    if (level.difficultyName !== 'EXTINCTION 寂滅') return level;

    const puzzle = engine.getLevel(level.id);
    const solution = [...puzzle];
    const success = solveBacktrack(solution);

    if (!success) {
        console.error(`Failed to solve level ${level.id} (${level.displayName})`);
        return level;
    }

    const hints = puzzle.filter(x => x !== 0).length;
    console.log(`Updated NIRVANA level ${level.id} (${level.displayName}) - Hints: ${hints}`);

    return { ...level, puzzle, solution };
});

const outputContent = `const levels = ${JSON.stringify(updatedLevels, null, 2)};`;
fs.writeFileSync(levelsFilePath, outputContent);
console.log("\nNirvana levels update complete!");
