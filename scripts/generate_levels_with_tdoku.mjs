#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TECHNIQUE_PLAN = [
  { stars: 1, technique: 'naked_single', titleZh: '啟蒙', titleEn: 'Awakening' },
  { stars: 2, technique: 'hidden_single', titleZh: '初心', titleEn: 'Initiate' },
  { stars: 3, technique: 'locked_candidates', titleZh: '觀照', titleEn: 'Observe' },
  { stars: 4, technique: 'naked_pair', titleZh: '本源', titleEn: 'Origin' },
  { stars: 5, technique: 'hidden_pair', titleZh: '寂滅', titleEn: 'Stillness' },
  { stars: 6, technique: 'naked_triple', titleZh: '編織', titleEn: 'Weave' },
  { stars: 7, technique: 'hidden_triple', titleZh: '隱流', titleEn: 'Hidden Flow' },
  { stars: 8, technique: 'x_wing', titleZh: '鋒刃', titleEn: 'Edge' },
  { stars: 9, technique: 'finned_x_wing', titleZh: '空鏡', titleEn: 'Mirror' },
  { stars: 10, technique: 'skyscraper', titleZh: '破陣', titleEn: 'Breakthrough' },
  { stars: 11, technique: 'xy_wing', titleZh: '天衡', titleEn: 'Sky Balance' },
  { stars: 12, technique: 'xyz_wing', titleZh: '天望', titleEn: 'Sky Sight' },
  { stars: 13, technique: 'w_wing', titleZh: '天鏈', titleEn: 'Sky Chain' },
  { stars: 14, technique: 'unique_rectangle', titleZh: '法印', titleEn: 'Seal' },
  { stars: 15, technique: 'x_cycle_simple_coloring', titleZh: '染鏈', titleEn: 'Color Chain' },
  { stars: 16, technique: 'swordfish', titleZh: '三翼', titleEn: 'Trident' },
  { stars: 17, technique: 'finned_swordfish', titleZh: '星潮', titleEn: 'Stellar Tide' },
  { stars: 18, technique: 'aic', titleZh: '荊棘', titleEn: 'Thorn' },
  { stars: 19, technique: 'aic_mid_chain', titleZh: '深淵', titleEn: 'Abyss' },
  { stars: 20, technique: 'grouped_aic_nice_loop', titleZh: '玄鏈', titleEn: 'Arc Loop' },
  { stars: 21, technique: 'aic_long_chain', titleZh: '無相', titleEn: 'Formless' },
  { stars: 22, technique: 'als_xz', titleZh: '觀海', titleEn: 'Tide Watch' },
  { stars: 23, technique: 'als_chain', titleZh: '破執', titleEn: 'Release' },
  { stars: 24, technique: 'forcing_chain_net', titleZh: '照界', titleEn: 'Net' },
  { stars: 25, technique: 'mixed_mastery_boss', titleZh: '神人', titleEn: 'Zenith' },
];

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

function parseTechniquePlanFromFile(planPath) {
  const raw = fs.readFileSync(planPath, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`Invalid plan file: ${planPath}`);
  }
  const out = [];
  for (const item of list) {
    const count = Number(item.count ?? 1);
    if (!item.technique || !item.titleZh || !item.titleEn || !Number.isFinite(item.stars) || count < 1) {
      throw new Error(`Invalid plan item: ${JSON.stringify(item)}`);
    }
    for (let i = 0; i < count; i += 1) {
      out.push({
        stars: Number(item.stars),
        technique: String(item.technique),
        titleZh: String(item.titleZh),
        titleEn: String(item.titleEn),
        clueMin: item.clueMin == null ? null : Number(item.clueMin),
        clueMax: item.clueMax == null ? null : Number(item.clueMax),
        targetClues: item.targetClues == null ? null : Number(item.targetClues),
      });
    }
  }
  return out;
}

function mulberry32(a) {
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  return h.readUInt32LE(0);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function idx(r, c) {
  return r * 9 + c;
}

function possibleDigits(board, r, c) {
  if (board[idx(r, c)] !== 0) return [];
  const used = new Set();
  for (let i = 0; i < 9; i += 1) {
    const rv = board[idx(r, i)];
    const cv = board[idx(i, c)];
    if (rv) used.add(rv);
    if (cv) used.add(cv);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr += 1) {
    for (let cc = bc; cc < bc + 3; cc += 1) {
      const v = board[idx(rr, cc)];
      if (v) used.add(v);
    }
  }
  const out = [];
  for (let d = 1; d <= 9; d += 1) {
    if (!used.has(d)) out.push(d);
  }
  return out;
}

function fillBoardRandom(board, rng) {
  let best = -1;
  let bestCandidates = null;
  for (let i = 0; i < 81; i += 1) {
    if (board[i] !== 0) continue;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cands = possibleDigits(board, r, c);
    if (cands.length === 0) return false;
    if (best === -1 || cands.length < bestCandidates.length) {
      best = i;
      bestCandidates = cands;
      if (cands.length === 1) break;
    }
  }
  if (best === -1) return true;
  const r = Math.floor(best / 9);
  const c = best % 9;
  for (const d of shuffle(bestCandidates, rng)) {
    board[idx(r, c)] = d;
    if (fillBoardRandom(board, rng)) return true;
    board[idx(r, c)] = 0;
  }
  return false;
}

function generateSolvedBoard(rng) {
  const board = Array(81).fill(0);
  if (!fillBoardRandom(board, rng)) {
    throw new Error('Failed to generate solved board.');
  }
  return board;
}

function boardToPuzzleString(board) {
  return board.map((v) => (v === 0 ? '.' : String(v))).join('');
}

function parseTdokuSolveLine(line) {
  const trimmed = line.trim();
  const first = trimmed.indexOf(':');
  const second = trimmed.indexOf(':', first + 1);
  if (first < 0 || second < 0) throw new Error(`Unexpected tdoku output: ${line}`);
  const count = Number(trimmed.slice(first + 1, second));
  const solution = trimmed.slice(second + 1).trim();
  return { count, solution };
}

function tdokuSolve({ tdokuBin, puzzleString, limit = 2 }) {
  const out = execFileSync(tdokuBin, [String(limit)], {
    input: `${puzzleString}\n`,
    encoding: 'utf8',
  });
  const line = out.trim().split('\n').pop() || '';
  return parseTdokuSolveLine(line);
}

function parseBool(v, defaultValue = true) {
  if (v === undefined || v === null) return defaultValue;
  const s = String(v).toLowerCase().trim();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

function gateCheck({
  enabled,
  puzzleString,
  targetTechnique,
  gateScript,
  gatePython,
  generationLog,
  levelIndex,
  attempt,
  requireWithoutUnsolved,
  requireGateHighest,
  gateCapAtTarget,
  disableRelaxedFallback,
  exactGateTechnique,
}) {
  if (!enabled) {
    return { pass: true, mode: 'disabled' };
  }
  const gateArgs = [
    gateScript,
    '--puzzle',
    puzzleString,
    '--target-technique',
    targetTechnique,
  ];
  if (requireWithoutUnsolved) gateArgs.push('--require-without-unsolved');
  if (requireGateHighest) gateArgs.push('--require-gate-highest');
  if (gateCapAtTarget) gateArgs.push('--cap-at-target');
  if (disableRelaxedFallback) gateArgs.push('--disable-relaxed-fallback');
  if (exactGateTechnique) gateArgs.push('--exact-gate-technique');
  const proc = spawnSync(
    gatePython,
    gateArgs,
    { encoding: 'utf8' },
  );
  const raw = (proc.stdout || '').trim();
  if (!raw) {
    return {
      pass: false,
      mode: 'strict',
      error: 'gate_script_no_output',
      stderr: (proc.stderr || '').trim(),
    };
  }
  const line = raw.split('\n').pop() || '{}';
  const result = JSON.parse(line);
  if (generationLog) {
    appendLine(
      generationLog,
      `gate_check level=${levelIndex + 1} attempt=${attempt} target=${targetTechnique} result=${JSON.stringify(result)}`,
    );
  }
  return result;
}

function buildClueTargets(levelCount) {
  const suggested = [
    48, 44, 40, 38, 36, 34, 33, 32, 31, 30,
    30, 29, 28, 27, 26, 26, 25, 25, 24, 24,
    24, 23, 23, 23, 22,
  ];
  if (levelCount <= suggested.length) return suggested.slice(0, levelCount);
  const out = suggested.slice();
  while (out.length < levelCount) out.push(22);
  return out;
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function ensureRunDir(runDir) {
  if (!runDir) return;
  if (!fs.existsSync(runDir)) {
    throw new Error(`Run directory not found: ${runDir}`);
  }
  for (const f of ['generation.log', 'validation.log', 'puzzles.ndjson', 'config.json']) {
    const p = path.join(runDir, f);
    if (!fs.existsSync(p)) {
      throw new Error(`Run file missing: ${p}. Run provenance_init_run first.`);
    }
  }
}

function clueCount(board) {
  return board.reduce((acc, v) => acc + (v === 0 ? 0 : 1), 0);
}

function digPuzzleToTarget({ solved, targetClues, rng, tdokuBin, generationLog, validationLog }) {
  const puzzle = solved.slice();
  const order = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng,
  );
  let uniqueChecks = 0;
  let kept = 0;
  let reverted = 0;
  for (const i of order) {
    if (clueCount(puzzle) <= targetClues) break;
    const prev = puzzle[i];
    if (prev === 0) continue;
    puzzle[i] = 0;
    const s = tdokuSolve({ tdokuBin, puzzleString: boardToPuzzleString(puzzle), limit: 2 });
    uniqueChecks += 1;
    if (s.count === 1) {
      kept += 1;
      if (validationLog) appendLine(validationLog, `keep_remove idx=${i} count=1`);
    } else {
      puzzle[i] = prev;
      reverted += 1;
      if (validationLog) appendLine(validationLog, `revert_remove idx=${i} count=${s.count}`);
    }
  }
  if (generationLog) {
    appendLine(
      generationLog,
      `dig_done target=${targetClues} clues=${clueCount(puzzle)} checks=${uniqueChecks} kept=${kept} reverted=${reverted}`,
    );
  }
  return { puzzle, uniqueChecks };
}

function makeLevel({ index, techniquePlan, puzzle, solution, targetClues }) {
  const levelNo = String(index + 1).padStart(2, '0');
  const clues = clueCount(puzzle);
  const empties = 81 - clues;
  return {
    id: index + 1,
    stars: techniquePlan.stars,
    display_name_i18n: {
      zh_Hant: `第${levelNo}關`,
      en: `Level ${levelNo}`,
    },
    difficulty_name_i18n: {
      zh_Hant: techniquePlan.titleZh,
      en: techniquePlan.titleEn,
    },
    puzzle,
    solution,
    max_technique: techniquePlan.technique,
    tech_tier: `T${String(index + 1).padStart(2, '0')}`,
    difficulty_score: Number((empties * 10 + (index + 1) * 2).toFixed(2)),
    single_ratio: Number((clues / 81).toFixed(4)),
    logic_solvable: true,
    source: 'in-house-generated+tdoku-validated',
    metadata: {
      target_clues: targetClues,
      actual_clues: clues,
    },
  };
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function main() {
  const args = parseArgs(process.argv);
  const count = Number(args.count ?? 25);
  const maxAttemptsPerLevel = Number(args['max-attempts-per-level'] ?? 3000);
  const seed = String(args.seed ?? '20260323_sudoku25');
  const outLevels = args['out-levels'] ?? 'assets/data/levels.i18n.json';
  const tdokuBin = args['tdoku-bin'] ?? '/tmp/tdoku_data/tdoku_solve_arm';
  const enableGateCheck = parseBool(args['gate-check'], true);
  const gateScript = args['gate-script'] ?? 'tool/technique_gate_check.py';
  const gatePython = args['gate-python'] ?? 'python3';
  const requireWithoutUnsolved = parseBool(args['gate-require-without-unsolved'], false);
  const requireGateHighest = parseBool(args['gate-require-gate-highest'], false);
  const gateCapAtTarget = parseBool(args['gate-cap-at-target'], false);
  const disableRelaxedFallback = parseBool(args['gate-disable-relaxed-fallback'], false);
  const exactGateTechnique = parseBool(args['gate-exact-technique'], false);
  const runId = args['run-id'] ?? null;
  const runDir = runId ? path.join('artifacts', 'runs', runId) : null;

  if (!fs.existsSync(tdokuBin)) {
    throw new Error(`tdoku binary not found: ${tdokuBin}`);
  }
  if (enableGateCheck && !fs.existsSync(gateScript)) {
    throw new Error(`gate script not found: ${gateScript}`);
  }
  ensureRunDir(runDir);

  const generationLog = runDir ? path.join(runDir, 'generation.log') : null;
  const validationLog = runDir ? path.join(runDir, 'validation.log') : null;
  const ndjsonPath = runDir ? path.join(runDir, 'puzzles.ndjson') : null;

  const customPlan = args['plan-json'] ? parseTechniquePlanFromFile(args['plan-json']) : null;
  const plan = customPlan ?? TECHNIQUE_PLAN.slice(0, count);
  const levelCount = customPlan ? plan.length : count;
  const rng = mulberry32(hashSeed(seed));
  const targets = buildClueTargets(levelCount);
  const used = new Set();
  const levels = [];

  if (generationLog) appendLine(generationLog, `start seed=${seed} count=${levelCount} tdoku_bin=${tdokuBin}`);
  if (validationLog) appendLine(validationLog, `start uniqueness_check limit=2`);

  for (let i = 0; i < levelCount; i += 1) {
    const techniquePlan = plan[i] ?? {
      stars: i + 1,
      technique: 'mixed_mastery_boss',
      titleZh: `關卡${i + 1}`,
      titleEn: `Stage ${i + 1}`,
    };
    let targetClues = targets[i];
    if (Number.isFinite(techniquePlan.targetClues)) {
      targetClues = Number(techniquePlan.targetClues);
    } else if (Number.isFinite(techniquePlan.clueMin) && Number.isFinite(techniquePlan.clueMax)) {
      const min = Math.min(Number(techniquePlan.clueMin), Number(techniquePlan.clueMax));
      const max = Math.max(Number(techniquePlan.clueMin), Number(techniquePlan.clueMax));
      targetClues = min + Math.floor(rng() * (max - min + 1));
    }

    let attempt = 0;
    let chosenLevel = null;
    while (attempt < maxAttemptsPerLevel && !chosenLevel) {
      attempt += 1;
      const solved = generateSolvedBoard(rng);
      const dynamicTargetClues = Math.max(22, targetClues - Math.floor(attempt / 20));
      const { puzzle } = digPuzzleToTarget({
        solved,
        targetClues: dynamicTargetClues,
        rng,
        tdokuBin,
        generationLog,
        validationLog,
      });
      const pstr = boardToPuzzleString(puzzle);
      if (used.has(pstr)) {
        if (generationLog) appendLine(generationLog, `duplicate_rejected level=${i + 1} attempt=${attempt}`);
        continue;
      }
      const solve = tdokuSolve({ tdokuBin, puzzleString: pstr, limit: 2 });
      if (solve.count !== 1 || solve.solution.length < 81) {
        if (validationLog) {
          appendLine(
            validationLog,
            `final_reject level=${i + 1} attempt=${attempt} solution_count=${solve.count}`,
          );
        }
        continue;
      }
      const gate = gateCheck({
        enabled: enableGateCheck,
        puzzleString: pstr,
        targetTechnique: techniquePlan.technique,
        gateScript,
        gatePython,
        generationLog,
        levelIndex: i,
        attempt,
        requireWithoutUnsolved,
        requireGateHighest,
        gateCapAtTarget,
        disableRelaxedFallback,
        exactGateTechnique,
      });
      if (!gate.pass) {
        if (validationLog) {
          appendLine(
            validationLog,
            `gate_reject level=${i + 1} attempt=${attempt} target=${techniquePlan.technique} detail=${JSON.stringify(gate)}`,
          );
        }
        continue;
      }
      used.add(pstr);
      const solution = solve.solution
        .slice(0, 81)
        .split('')
        .map((ch) => Number(ch));
      chosenLevel = makeLevel({
        index: i,
        techniquePlan,
        puzzle,
        solution,
        targetClues,
      });

      if (generationLog) {
        appendLine(
          generationLog,
          `accepted level=${i + 1} attempt=${attempt} clues=${clueCount(puzzle)} technique=${techniquePlan.technique}`,
        );
      }
      if (validationLog) {
        appendLine(validationLog, `accepted level=${i + 1} unique=1`);
      }
      if (ndjsonPath) {
        const nd = {
          puzzle_id: `puz_${String(i + 1).padStart(2, '0')}`,
          run_id: runId,
          seed,
          grid: pstr,
          solution_hash: `sha256:${sha256Hex(solution.join(''))}`,
          required_techniques: [techniquePlan.technique],
          generator_trace: {
            attempt,
            target_clues: targetClues,
            dynamic_target_clues: dynamicTargetClues,
            actual_clues: clueCount(puzzle),
          },
          tdoku: {
            binary: tdokuBin,
            unique_solution: true,
          },
          technique_gate: gate,
          generated_at: new Date().toISOString(),
        };
        appendLine(ndjsonPath, JSON.stringify(nd));
      }
    }
    if (!chosenLevel) {
      throw new Error(`Failed generating level ${i + 1} after ${maxAttemptsPerLevel} attempts.`);
    }
    levels.push(chosenLevel);
  }

  fs.writeFileSync(outLevels, `${JSON.stringify(levels, null, 2)}\n`, 'utf8');
  console.log(`Generated ${levels.length} levels -> ${outLevels}`);
  if (runDir) console.log(`Provenance run updated: ${runDir}`);
}

main();
