#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function boardToPuzzleString(board) {
  return board.map((v) => (v === 0 ? '.' : String(v))).join('');
}

function parseTdokuSolveLine(line) {
  const t = line.trim();
  const first = t.indexOf(':');
  const second = t.indexOf(':', first + 1);
  if (first < 0 || second < 0) throw new Error(`Unexpected tdoku output: ${line}`);
  return {
    count: Number(t.slice(first + 1, second)),
    solution: t.slice(second + 1).trim().slice(0, 81),
  };
}

function tdokuSolve({ tdokuBin, puzzleString, limit = 2 }) {
  const out = execFileSync(tdokuBin, [String(limit)], {
    input: `${puzzleString}\n`,
    encoding: 'utf8',
  });
  const line = out.trim().split('\n').pop() || '';
  return parseTdokuSolveLine(line);
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const levelsPath = args['levels-path'] ?? 'assets/data/levels.i18n.json';
  const tdokuBin = args['tdoku-bin'] ?? '/tmp/tdoku_data/tdoku_solve_arm';
  const runId = args['run-id'] ?? null;
  const runDir = runId ? path.join('artifacts', 'runs', runId) : null;
  const validationLog = runDir ? path.join(runDir, 'validation.log') : null;

  const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error(`No levels found in ${levelsPath}`);
  }
  if (!fs.existsSync(tdokuBin)) {
    throw new Error(`tdoku binary not found: ${tdokuBin}`);
  }
  if (validationLog && !fs.existsSync(validationLog)) {
    throw new Error(`Validation log missing: ${validationLog}`);
  }

  let ok = 0;
  for (const lv of levels) {
    const puzzleString = boardToPuzzleString(lv.puzzle);
    const res = tdokuSolve({ tdokuBin, puzzleString, limit: 2 });
    const expectedSolution = lv.solution.join('');
    const solutionMatches = res.solution === expectedSolution;
    const unique = res.count === 1;
    const pass = unique && solutionMatches;
    if (!pass) {
      const msg = `Level ${lv.id} failed: unique=${unique} solutionMatches=${solutionMatches}`;
      if (validationLog) appendLine(validationLog, msg);
      throw new Error(msg);
    }
    ok += 1;
    if (validationLog) appendLine(validationLog, `revalidate_ok level=${lv.id} unique=1`);
  }
  console.log(`Validated ${ok} levels with tdoku.`);
}

main();
