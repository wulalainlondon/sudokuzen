const fs = require('fs');
const path = require('path');

// --- Sudoku Solver Logic ---

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
            if (board[i] === 0) {
                emptyCell = i;
                break;
            }
        }

        if (emptyCell === -1) {
            solutionsFound++;
            return;
        }

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

// --- Load Levels ---

const levelsFilePath = path.join(__dirname, 'levels.js');
const levelsContent = fs.readFileSync(levelsFilePath, 'utf8');

// Simple extraction of the levels array from the JS file
// This assumes 'const levels = [' structure
const match = levelsContent.match(/const levels = (\[[\s\S]*?\]);/);
if (!match) {
    console.error("Could not find 'levels' array in levels.js");
    process.exit(1);
}

let levels;
try {
    // Using eval to handle potential comments or trailing commas in the JS object
    levels = eval(match[1]);
} catch (e) {
    console.error("Error parsing levels:", e.message);
    process.exit(1);
}

// --- Verification ---

console.log(`Starting verification of ${levels.length} levels...\n`);

let multiSolutionCount = 0;
let zeroSolutionCount = 0;
let singleSolutionCount = 0;

levels.forEach(level => {
    const puzzle = [...level.puzzle];
    const solutions = countSolutions(puzzle, 2);

    if (solutions === 0) {
        console.log(`[FAILED] Level ${level.id} ("${level.displayName}") has NO solutions.`);
        zeroSolutionCount++;
    } else if (solutions > 1) {
        console.log(`[FAILED] Level ${level.id} ("${level.displayName}") has MULTIPLE solutions.`);
        multiSolutionCount++;
    } else {
        // Optionially verify against the provided solution
        const providedSolution = level.solution;
        // (Just a quick check if needed, but the requirement is uniqueness)
        singleSolutionCount++;
    }
});

console.log('\n--- Summary ---');
console.log(`Total levels: ${levels.length}`);
console.log(`Unique solutions: ${singleSolutionCount}`);
console.log(`Multiple solutions: ${multiSolutionCount}`);
console.log(`Zero solutions: ${zeroSolutionCount}`);

if (multiSolutionCount > 0 || zeroSolutionCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
