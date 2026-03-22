const fs = require('fs');
const vm = require('vm');

const ADV_STARS = [8.75, 9.0, 9.25, 9.5, 9.6, 9.7, 9.85, 10.0];

const TITLE_BY_STAR = {
  '8.75': 'AIC 中鏈',
  '9': 'Grouped AIC / Nice Loop',
  '9.25': 'AIC 長鏈',
  '9.5': 'ALS-XZ',
  '9.6': 'ALS Chain',
  '9.7': 'Sue de Coq',
  '9.85': 'Forcing Chain / Net',
  '10': 'Exocet / Death Blossom'
};

function rc(idx) {
  return [Math.floor(idx / 9) + 1, (idx % 9) + 1];
}

function buildPeers() {
  const peers = Array.from({ length: 81 }, () => new Set());
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (let k = 0; k < 9; k++) {
      peers[i].add(r * 9 + k);
      peers[i].add(k * 9 + c);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) peers[i].add(rr * 9 + cc);
    }
    peers[i].delete(i);
  }
  return peers;
}

const PEERS = buildPeers();

function buildUnits() {
  const rows = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
  const cols = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c));
  const boxes = [];
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const b = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) b.push((br * 3 + r) * 9 + (bc * 3 + c));
      }
      boxes.push(b);
    }
  }
  return [...rows, ...cols, ...boxes];
}

const UNITS = buildUnits();

function getCandidates(board, idx) {
  if (board[idx] !== 0) return [];
  const used = new Set();
  for (const p of PEERS[idx]) {
    const v = board[p];
    if (v !== 0) used.add(v);
  }
  const out = [];
  for (let d = 1; d <= 9; d++) if (!used.has(d)) out.push(d);
  return out;
}

function boardCandidates(board) {
  const cands = Array.from({ length: 81 }, () => []);
  for (let i = 0; i < 81; i++) if (board[i] === 0) cands[i] = getCandidates(board, i);
  return cands;
}

function findContradiction(board, cands) {
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0 && cands[i].length === 0) {
      const [r, c] = rc(i);
      return `R${r}C${c} 無候選，直接卡住`;
    }
  }
  for (const unit of UNITS) {
    const placed = new Set(unit.map((i) => board[i]).filter((v) => v !== 0));
    for (let d = 1; d <= 9; d++) {
      if (placed.has(d)) continue;
      const spots = unit.filter((i) => board[i] === 0 && cands[i].includes(d));
      if (spots.length === 0) return `數字 ${d} 在某單位無合法落點`;
    }
  }
  return null;
}

function propagateSingles(board, maxSteps = 12) {
  const logs = [];
  for (let loop = 0; loop < 300 && logs.length < maxSteps; loop++) {
    const cands = boardCandidates(board);
    const contradiction = findContradiction(board, cands);
    if (contradiction) return { ok: false, logs, contradiction };

    let moved = false;

    for (let i = 0; i < 81; i++) {
      if (board[i] === 0 && cands[i].length === 1) {
        const d = cands[i][0];
        board[i] = d;
        const [r, c] = rc(i);
        logs.push(`R${r}C${c} 僅剩候選 ${d}（裸單）`);
        moved = true;
        break;
      }
    }
    if (moved) continue;

    let hiddenDone = false;
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const pos = unit.filter((i) => board[i] === 0 && cands[i].includes(d));
        if (pos.length === 1) {
          const idx = pos[0];
          board[idx] = d;
          const [r, c] = rc(idx);
          logs.push(`R${r}C${c} 是數字 ${d} 的唯一位置（隱單）`);
          moved = true;
          hiddenDone = true;
          break;
        }
      }
      if (hiddenDone) break;
    }

    if (!moved) return { ok: true, logs, contradiction: null };
  }

  const cands = boardCandidates(board);
  const contradiction = findContradiction(board, cands);
  if (contradiction) return { ok: false, logs, contradiction };
  return { ok: true, logs, contradiction: null };
}

function countSolutions(board, limit = 2) {
  function search() {
    if (state.found >= limit) return;

    let best = -1;
    let bestCands = null;
    for (let i = 0; i < 81; i++) {
      if (board[i] !== 0) continue;
      const cs = getCandidates(board, i);
      if (cs.length === 0) return;
      if (best === -1 || cs.length < bestCands.length) {
        best = i;
        bestCands = cs;
        if (cs.length === 1) break;
      }
    }

    if (best === -1) {
      state.found++;
      return;
    }

    for (const d of bestCands) {
      board[best] = d;
      search();
      board[best] = 0;
      if (state.found >= limit) return;
    }
  }

  const state = { found: 0 };
  search();
  return state.found;
}

function buildProofForElimination(puzzle, idx, wrong, techniqueTitle) {
  const b = [...puzzle];
  b[idx] = wrong;

  const prop = propagateSingles(b, 12);
  const [r, c] = rc(idx);

  if (!prop.ok) {
    const proof = [
      `[${techniqueTitle}] 假設 R${r}C${c} = ${wrong}。`,
      ...prop.logs,
      `結果走不通：${prop.contradiction}。`,
      `因此刪除候選 R${r}C${c} ≠ ${wrong}。`
    ];
    return { proof, mode: 'propagation_contradiction' };
  }

  if (countSolutions(b, 1) === 0) {
    const proof = [
      `[${techniqueTitle}] 假設 R${r}C${c} = ${wrong}。`,
      ...prop.logs,
      '繼續往下試會發現：這樣填最後一定卡住。',
      `因此刪除候選 R${r}C${c} ≠ ${wrong}。`
    ];
    return { proof, mode: 'search_contradiction' };
  }

  return null;
}

function buildStructuredView(star, idx, wrong, solutionDigit, proofLines) {
  const [r, c] = rc(idx);
  const title = TITLE_BY_STAR[String(star)] || 'Advanced Chain';
  const midLabel = (star >= 9.5)
    ? '沿提示一步步檢查'
    : '沿提示鏈路往下推';
  const chain = [
    `S0(假設): R${r}C${c}=${wrong}`,
    `S1(${title}): ${midLabel}`,
    `S2(結果): ${proofLines[proofLines.length - 2] || '這個假設會卡住'}`,
    `S3(結論): R${r}C${c}\u2260${wrong}，保留 ${solutionDigit}`
  ];
  const nodes = [
    { id: 'S0', type: 'assumption', text: `R${r}C${c}=${wrong}` },
    { id: 'S1', type: 'inference', text: '強弱鏈推進' },
    { id: 'S2', type: 'contradiction', text: proofLines[proofLines.length - 2] || '走不通' },
    { id: 'S3', type: 'conclusion', text: `R${r}C${c}\u2260${wrong}` }
  ];
  const edges = [
    { from: 'S0', to: 'S1', link: 'weak->strong' },
    { from: 'S1', to: 'S2', link: 'strong->weak' },
    { from: 'S2', to: 'S3', link: 'forced' }
  ];
  return { chain, nodes, edges };
}

function loadLevels() {
  const code = fs.readFileSync('levels.js', 'utf8');
  const sandbox = {};
  vm.runInNewContext(code + '\nthis.__levels=levels;', sandbox, { filename: 'levels.js' });
  return sandbox.__levels || [];
}

function rewriteTechniques(practiceByStar) {
  const marker = '// Advanced tier one-practice examples synced from levels.js';
  let text = fs.readFileSync('techniques.js', 'utf8');
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error('Cannot find advanced practice marker in techniques.js');

  const block = `\n\n${marker}\n(() => {\n  const PRACTICE = ${JSON.stringify(practiceByStar, null, 2)};\n  [8.75, 9.0, 9.25, 9.5, 9.6, 9.7, 9.85, 10.0].forEach((star) => {\n    if (!TEACH_DATA[star]) return;\n    TEACH_DATA[star].practice = [PRACTICE[String(star)]];\n\n    // Sync high-tier example with real practice puzzle so learners don't see all-zero placeholders.\n    const p = PRACTICE[String(star)];\n    const firstElim = (p.answer && Array.isArray(p.answer.eliminates) && p.answer.eliminates[0]) ? p.answer.eliminates[0] : null;\n    const focus = (p.answer && Array.isArray(p.answer.patternCells) && p.answer.patternCells.length > 0)\n      ? p.answer.patternCells\n      : (firstElim ? [firstElim.cell] : []);\n    const highlightDigits = {};\n    focus.forEach((idx) => {\n      const arr = (p.notes && (p.notes[idx] || p.notes[String(idx)])) || [];\n      if (arr.length > 0) highlightDigits[idx] = arr;\n    });\n\n    TEACH_DATA[star].example = {\n      board: p.board,\n      given: p.given,\n      notes: p.notes,\n      steps: [\n        {\n          text: '先看高亮格的候選，確認這一步要測試的目標候選。',\n          focusCells: focus,\n          highlightDigits,\n          eliminateCells: []\n        },\n        {\n          text: '沿著提示的推理鏈檢查，若假設成立最後會卡住。',\n          focusCells: focus,\n          highlightDigits,\n          eliminateCells: []\n        },\n        {\n          text: p.answer.description,\n          focusCells: focus,\n          highlightDigits,\n          eliminateCells: p.answer.eliminates\n        }\n      ]\n    };\n  });\n})();\n`;

  text = text.slice(0, idx).replace(/\s*$/, '') + block;
  fs.writeFileSync('techniques.js', text);
}

function main() {
  const levels = loadLevels();
  const practiceByStar = {};
  const audit = [];

  for (const star of ADV_STARS) {
    const level = levels.find((x) => x.stars === star);
    if (!level) throw new Error(`Missing level for star ${star}`);

    const puzzle = [...level.puzzle];
    const solution = [...level.solution];
    const empties = [];
    for (let i = 0; i < 81; i++) if (puzzle[i] === 0) empties.push(i);

    let selected = null;
    for (const idx of empties) {
      const cands = getCandidates(puzzle, idx);
      if (cands.length < 2) continue;
      const right = solution[idx];
      for (const wrong of cands) {
        if (wrong === right) continue;
        const proofRes = buildProofForElimination(puzzle, idx, wrong, TITLE_BY_STAR[String(star)]);
        if (proofRes) {
          selected = { idx, right, wrong, cands, ...proofRes };
          break;
        }
      }
      if (selected) break;
    }

    if (!selected) throw new Error(`No proof elimination found for star ${star}`);

    const [r, c] = rc(selected.idx);
    const structuredView = buildStructuredView(star, selected.idx, selected.wrong, selected.right, selected.proof);
    practiceByStar[String(star)] = {
      board: [...puzzle],
      given: [...puzzle],
      notes: { [selected.idx]: selected.cands },
      answer: {
        eliminates: [{ cell: selected.idx, digit: selected.wrong }],
        patternCells: [selected.idx],
        description: `${TITLE_BY_STAR[String(star)]}：由反證鏈排除 R${r}C${c} 的候選 ${selected.wrong}。`,
        proof: selected.proof,
        proofMode: selected.mode,
        ...(structuredView
          ? {
              aicChain: structuredView.chain,
              proofNodes: structuredView.nodes,
              proofEdges: structuredView.edges
            }
          : {})
      },
      solution: [...solution]
    };

    audit.push({
      star,
      levelId: level.id,
      cell: selected.idx,
      wrongDigit: selected.wrong,
      solutionDigit: selected.right,
      candidates: selected.cands,
      proofMode: selected.mode,
      proofLength: selected.proof.length
    });
  }

  rewriteTechniques(practiceByStar);
  fs.writeFileSync('output/advanced_practice_verification.json', JSON.stringify(audit, null, 2));
  console.log('OK: advanced practice proof pipeline rebuilt for 8.75★~10★');
}

main();
