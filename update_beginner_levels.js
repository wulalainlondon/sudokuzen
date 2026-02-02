const fs = require('fs');
const path = require('path');

// --- Seedable Random Number Generator (Mulberry32) ---
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
    let a = seed ^ 0xDEADBEEF;
    let b = (seed << 13) ^ 0x12345678;
    let c = (seed >>> 7) ^ 0x87654321;
    let d = seed + 0xABCDEF01;
    let rand = sfc32(a, b, c, d);
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

// --- Sudoku Logic ---
function isSafe(grid, r, c, num) {
    for (let i = 0; i < 9; i++) {
        if (grid[r * 9 + i] === num || grid[i * 9 + c] === num) return false;
    }
    const sr = Math.floor(r / 3) * 3;
    const sc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (grid[(sr + i) * 9 + (sc + j)] === num) return false;
        }
    }
    return true;
}

function findEmpty(grid) {
    let minOptions = 10;
    let bestCell = null;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (grid[r * 9 + c] === 0) {
                let options = 0;
                for (let n = 1; n <= 9; n++) {
                    if (isSafe(grid, r, c, n)) options++;
                }
                if (options < minOptions) {
                    minOptions = options;
                    bestCell = { r, c };
                }
            }
        }
    }
    return bestCell;
}

function fillGrid(grid, rng) {
    const cell = findEmpty(grid);
    if (!cell) return true;
    const { r, c } = cell;
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    rng.shuffle(nums);
    for (const n of nums) {
        if (isSafe(grid, r, c, n)) {
            grid[r * 9 + c] = n;
            if (fillGrid(grid, rng)) return true;
            grid[r * 9 + c] = 0;
        }
    }
    return false;
}

function countSolutions(grid, limit = 2) {
    const cell = findEmpty(grid);
    if (!cell) return 1;
    let count = 0;
    const { r, c } = cell;
    for (let n = 1; n <= 9; n++) {
        if (isSafe(grid, r, c, n)) {
            grid[r * 9 + c] = n;
            count += countSolutions(grid, limit);
            grid[r * 9 + c] = 0;
            if (count >= limit) return count;
        }
    }
    return count;
}

function checkMinPerBox(grid, minCount = 2) {
    for (let bRow = 0; bRow < 9; bRow += 3) {
        for (let bCol = 0; bCol < 9; bCol += 3) {
            let count = 0;
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (grid[(bRow + r) * 9 + (bCol + c)] !== 0) count++;
                }
            }
            if (count < minCount) return false;
        }
    }
    return true;
}

// --- Generator ---
class BeginnerSudokuGenerator {
    generateLevel(levelId, hintRange) {
        const rng = createRandom(levelId);

        while (true) {
            let fullGrid = new Array(81).fill(0);
            fillGrid(fullGrid, rng);
            let puzzle = [...fullGrid];

            // 90-degree rotational symmetry groups
            const groups = [];
            const visited = new Set();
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (!visited.has(r * 9 + c)) {
                        const s = new Set();
                        s.add(r * 9 + c);
                        s.add(c * 9 + (8 - r));
                        s.add((8 - r) * 9 + (8 - c));
                        s.add((8 - c) * 9 + r);
                        groups.push(Array.from(s));
                        s.forEach(idx => visited.add(idx));
                    }
                }
            }

            rng.shuffle(groups);
            const target = rng.nextInt(hintRange.min, hintRange.max);
            let currentClues = 81;

            for (const group of groups) {
                if (currentClues - group.length < target) continue;

                const backup = group.map(idx => ({ idx, val: puzzle[idx] }));
                group.forEach(idx => puzzle[idx] = 0);

                if (countSolutions([...puzzle], 2) === 1) {
                    currentClues -= group.length;
                } else {
                    backup.forEach(b => puzzle[b.idx] = b.val);
                }
            }

            if (currentClues >= hintRange.min && currentClues <= hintRange.max && checkMinPerBox(puzzle, 2)) {
                return { puzzle, solution: fullGrid, clues: currentClues };
            }
        }
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
const gen = new BeginnerSudokuGenerator();

console.log(`Updating BEGINNER levels...`);

let beginnerIndex = 0;
const updatedLevels = levels.map((level) => {
    if (level.difficultyName !== 'BEGINNER 初心') return level;

    beginnerIndex++; // 1-indexed for the difficulty group

    let hintRange;
    if (beginnerIndex <= 10) {
        hintRange = { min: 42, max: 45 };
    } else if (beginnerIndex <= 20) {
        hintRange = { min: 39, max: 41 };
    } else {
        hintRange = { min: 36, max: 38 };
    }

    // Seed set to 1000 + beginnerIndex to match user preference/Python script
    const { puzzle, solution, clues } = gen.generateLevel(1000 + beginnerIndex, hintRange);

    console.log(`Updated BEGINNER level ${level.id} (Group Index: ${beginnerIndex}) - Hints: ${clues} (Range: ${hintRange.min}-${hintRange.max})`);

    return { ...level, puzzle, solution };
});

const outputContent = `const levels = ${JSON.stringify(updatedLevels, null, 2)};`;
fs.writeFileSync(levelsFilePath, outputContent);
console.log("\nBeginner levels update complete!");
