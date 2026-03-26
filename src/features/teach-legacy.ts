// Legacy teach / practice modal logic — DOM-based fallback
// Extracted from legacyRuntime.ts for modularity.

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getTeachData } from '../data/dataRegistry';

// ── Tech name mapping ─────────────────────────────────────────────

export const TECH_MAP: Record<string, string> = {
  'naked_single': '顯性單數',
  'hidden_single': '隱藏單數',
  'locked_candidates': '鎖定候選數',
  'naked_pair': '顯性數對',
  'hidden_pair': '隱藏數對',
  'naked_triple': '顯性三數組',
  'hidden_triple': '隱藏三數組',
  'x_wing': 'X-Wing',
  'w_wing': 'W-Wing',
  'x_cycle_simple_coloring': 'X-Cycle / Simple Coloring',
  'skyscraper': '摩天樓 (Skyscraper)',
  'unique_rectangle': '唯一矩形 (UR)',
  'xy_wing': 'XY-Wing',
  'xyz_wing': 'XYZ-Wing',
  'swordfish': '劍魚跡 (Swordfish)',
  'finned_swordfish': '帶鰭劍魚',
  'finned_x_wing': '帶鰭 X-Wing',
  'aic': 'AIC 強弱鏈',
  'aic_mid_chain': 'AIC 中鏈',
  'grouped_aic_nice_loop': 'Grouped AIC / Nice Loop',
  'aic_long_chain': 'AIC 長鏈',
  'als_xz': 'ALS-XZ',
  'als_chain': 'ALS Chain',
  'sue_de_coq': 'Sue de Coq',
  'forcing_chain_net': 'Forcing Chain / Net',
  'exocet_death_blossom': 'Exocet / Death Blossom',
  'unknown': '綜合技巧',
};

// ── Learning order & group definitions ────────────────────────────

const LEARNING_ORDER = [
  1, 2, 3, 4, 5, 6, 7,
  8, 10, 27, 11, 13, 12, 14, 29,
  9, 16, 17, 30, 31, 15, 26, 28, 32,
  18, 19, 20, 33, 21, 24, 34, 35,
  22, 23, 37, 38, 39, 36, 25, 40,
];

const GROUPS = [
  { id: 'foundation', name: '第一層・基礎定式', hint: '先建立基本觀念與候選數紀律', ids: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'candidate', name: '第二層・候選數結構', hint: '看懂線上/宮內候選關係與初階刪減', ids: [8, 10, 27, 11, 13, 12, 14, 29] },
  { id: 'pattern', name: '第三層・圖形與刪減', hint: '翼型、魚型與鎖定鏈的實戰應用', ids: [9, 16, 17, 30, 31, 15, 26, 28, 32] },
  { id: 'chain', name: '第四層・鏈式推理', hint: '進入顏色鏈、唯一矩形與高階魚型', ids: [18, 19, 20, 33, 21, 24, 34, 35] },
  { id: 'master', name: '第五層・高階極限', hint: 'ALS、AIC、Death Blossom 與終局型技巧', ids: [22, 23, 37, 38, 39, 36, 25, 40] },
];

// ── Library functions ─────────────────────────────────────────────

export function isTeachReadable(stars: number | string): boolean {
  const td = getTeachData();
  if (!td) return false;
  const t = td[stars];
  return !!(t && t.name && t.subtitle && t.example && Array.isArray(t.example.steps) && t.example.steps.length > 0);
}

export function getLibraryItemsFromTeachData(): { book: number; key: string; teach: any }[] {
  const td = getTeachData();
  if (!td || Object.keys(td).length === 0) return [];

  const orderIndex = new Map(LEARNING_ORDER.map((id, idx) => [id, idx]));

  return Object.entries(td)
    .map(([book, teach]) => ({ book: parseFloat(book), key: String(book), teach }))
    .filter(item => Number.isFinite(item.book) && isTeachReadable(item.key))
    .sort((a, b) => {
      const ai = orderIndex.has(a.book) ? orderIndex.get(a.book)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.book) ? orderIndex.get(b.book)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.book - b.book;
    });
}

export function getLibraryLearningGroups(items: { book: number; key: string; teach: any }[]) {
  const byId = new Map(items.map(item => [item.book, item]));
  const used = new Set<number>();

  const groups = GROUPS.map(group => {
    const groupItems = group.ids
      .map(id => byId.get(id))
      .filter(Boolean) as { book: number; key: string; teach: any }[];
    groupItems.forEach(item => used.add(item.book));
    return { ...group, items: groupItems };
  }).filter(group => group.items.length > 0);

  const ungrouped = items.filter(item => !used.has(item.book));
  if (ungrouped.length) {
    groups.push({
      id: 'extra',
      name: '補充・延伸秘笈',
      hint: '額外補充的技巧，建議在前面路徑完成後再讀',
      ids: [],
      items: ungrouped,
    });
  }

  return groups;
}

export function getTeachStageLabel(stars: number | string): string {
  const n = Number(stars);
  if (!Number.isFinite(n)) return '研習中';
  if (n <= 7) return '入門';
  if (n <= 17) return '進階';
  if (n <= 25) return '高階';
  if (n <= 35) return '專家';
  return '神級';
}

export function renderLibraryCards(): void {
  if (!gs.libraryListEl) return;
  const items = getLibraryItemsFromTeachData();
  const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});

  if (!items.length) {
    gs.libraryListEl.innerHTML = '<div class="library-empty">目前沒有可研讀的秘笈內容</div>';
    return;
  }

  const orderIndex = new Map(items.map((item, idx) => [item.book, idx + 1]));
  const groups = getLibraryLearningGroups(items);

  gs.libraryListEl.innerHTML = groups.map((group) => {
    const cardsHtml = group.items.map(({ book, key, teach }) => {
      const isRead = !!read[key];
      const hasPractice = Array.isArray(teach.practice) && teach.practice.length > 0;
      const orderNo = orderIndex.get(book) || '-';
      const stage = getTeachStageLabel(book);
      return `
        <article class="library-card" data-star="${key}" role="button" tabindex="0"
            onclick="openTeachFromLibrary('${key}')"
            onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTeachFromLibrary('${key}'); }">
            <div class="library-card-head">
                <span class="library-star">#${orderNo} ・秘笈 ${book} ・${stage}</span>
                <div class="library-badges">
                    ${isRead ? '<span class="library-badge read">已讀</span>' : ''}
                    ${hasPractice ? '<span class="library-badge practice">可練習</span>' : ''}
                </div>
            </div>
            <h3 class="library-card-title">${teach.name}</h3>
            <p class="library-card-subtitle">${teach.subtitle}</p>
            <div class="library-card-key">${teach.technique || '-'}</div>
            <button class="library-open-btn" onclick="event.stopPropagation(); openTeachFromLibrary('${key}')">研讀秘笈</button>
        </article>
      `;
    }).join('');

    return `
      <section class="library-group" data-group="${group.id}">
          <header class="library-group-head">
              <h3 class="library-group-title">${group.name}</h3>
              <p class="library-group-hint">${group.hint}</p>
          </header>
          <div class="library-group-cards">${cardsHtml}</div>
      </section>
    `;
  }).join('');
}

export function openLibraryOverlay(): void {
  renderLibraryCards();
  if (gs.libraryOverlayEl) {
    gs.libraryOverlayEl.classList.add('show');
  }
  document.body.classList.add('library-open');
}

export function closeLibraryOverlay(): void {
  if (gs.libraryOverlayEl) {
    gs.libraryOverlayEl.classList.remove('show');
  }
  document.body.classList.remove('library-open');
}

export function openTeachFromLibrary(stars: string | number): void {
  showTeachModal(parseFloat(String(stars)), 'library');
}

// ── Teach modal functions ─────────────────────────────────────────

export function showTeachModal(stars: number | string, source = 'tier'): void {
  const td = getTeachData();
  if (!td) return;
  const data = td[stars];
  if (!data) return;

  gs.teachData = data;
  gs.teachLaunchSource = source;
  const stage = getTeachStageLabel(stars);

  document.getElementById('teach-title')!.textContent = data.name;
  document.getElementById('teach-subtitle')!.textContent = `【${stage}】${data.subtitle}`;

  const explEl = document.getElementById('teach-explanation')!;
  explEl.innerHTML = [`<p class="teach-level-note">章節定位：${stage}層</p>`]
    .concat(data.explanation.map((p: string) => `<p>${p}</p>`))
    .join('');

  gs.teachSteps = data.example.steps;
  gs.teachCurrentStep = 0;
  renderTeachBoard();
  updateTeachStep();

  // Show/hide practice button based on data availability
  const practiceBtn = document.getElementById('teach-practice-btn');
  if (practiceBtn) {
    practiceBtn.style.display = (data.practice && data.practice.length > 0) ? '' : 'none';
  }

  document.getElementById('teach-modal')!.classList.add('show');
}

export function hideTeachModal(returnToLibrary = true): void {
  document.getElementById('teach-modal')!.classList.remove('show');

  // Mark as read
  if (gs.teachData) {
    const td = getTeachData();
    const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
    for (const [s, d] of Object.entries(td)) {
      if (d === gs.teachData) { read[s] = true; break; }
    }
    writeJson(SK.TEACH_READ, read);
  }
  gs.teachData = null;

  if (returnToLibrary && gs.teachLaunchSource === 'library') {
    renderLibraryCards();
    openLibraryOverlay();
  }
  gs.teachLaunchSource = 'tier';
}

export function teachNext(): void {
  if (gs.teachCurrentStep < gs.teachSteps.length - 1) {
    gs.teachCurrentStep++;
    updateTeachStep();
  }
}

export function teachPrev(): void {
  if (gs.teachCurrentStep > 0) {
    gs.teachCurrentStep--;
    updateTeachStep();
  }
}

export function updateTeachStep(): void {
  const step = gs.teachSteps[gs.teachCurrentStep];
  document.getElementById('teach-step-text')!.textContent = step.text;
  document.getElementById('teach-step-indicator')!.textContent = `${gs.teachCurrentStep + 1}/${gs.teachSteps.length}`;
  (document.getElementById('teach-prev-btn') as HTMLButtonElement).disabled = gs.teachCurrentStep === 0;
  (document.getElementById('teach-next-btn') as HTMLButtonElement).disabled = gs.teachCurrentStep === gs.teachSteps.length - 1;
  applyTeachHighlights(step);
}

export function renderTeachBoard(): void {
  const boardEl = document.getElementById('teach-board')!;
  boardEl.innerHTML = '';
  if (!gs.teachData) return;

  const ex = gs.teachData.example;
  const board = ex.board;
  const notes = ex.notes || {};

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'teach-cell';
    cell.dataset.idx = String(i);

    if (board[i] !== 0) {
      cell.textContent = board[i];
    } else if (notes[i]) {
      // Show candidate notes
      const notesGrid = document.createElement('div');
      notesGrid.className = 'tc-notes';
      for (let d = 1; d <= 9; d++) {
        const span = document.createElement('span');
        span.className = 'tc-note';
        span.dataset.digit = String(d);
        if (notes[i].includes(d)) {
          span.textContent = String(d);
        }
        notesGrid.appendChild(span);
      }
      cell.appendChild(notesGrid);
    }
    boardEl.appendChild(cell);
  }
}

export function applyTeachHighlights(step: any): void {
  const boardEl = document.getElementById('teach-board')!;
  const cells = boardEl.querySelectorAll('.teach-cell');

  // Reset all highlights
  cells.forEach(c => {
    c.classList.remove('focus', 'eliminate', 'warn', 'masked');
    c.querySelectorAll('.tc-note').forEach(n => {
      n.classList.remove('highlight', 'strike', 'warn-missing');
    });
  });

  const visibleCells: number[] = Array.isArray(step.visibleCells) ? step.visibleCells : [];
  if (visibleCells.length > 0) {
    const visibleSet = new Set(visibleCells);
    cells.forEach((c, idx) => {
      if (!visibleSet.has(idx)) c.classList.add('masked');
    });
  }

  // Apply focus cells
  (step.focusCells || []).forEach((idx: number) => {
    if (cells[idx]) cells[idx].classList.add('focus');
  });

  // Apply highlight digits (gold notes)
  const hd = step.highlightDigits || {};
  for (const [cellIdx, digits] of Object.entries(hd)) {
    const cell = cells[parseInt(cellIdx)];
    if (!cell) continue;
    (digits as number[]).forEach(d => {
      const note = cell.querySelector(`.tc-note[data-digit="${d}"]`);
      if (note) note.classList.add('highlight');
    });
  }

  // Apply eliminate cells (red bg + strikethrough)
  (step.eliminateCells || []).forEach(({ cell: idx, digit }: { cell: number; digit: number }) => {
    if (cells[idx]) {
      cells[idx].classList.add('eliminate');
      const note = cells[idx].querySelector(`.tc-note[data-digit="${digit}"]`);
      if (note) note.classList.add('strike');
    }
  });

  // Apply warning note slots: small red box on specific candidate position
  const warnDigit = Number(step.warnDigit);
  if (Number.isInteger(warnDigit) && warnDigit >= 1 && warnDigit <= 9) {
    (step.warnCells || []).forEach((idx: number) => {
      const cell = cells[idx];
      if (!cell) return;
      const note = cell.querySelector(`.tc-note[data-digit="${warnDigit}"]`);
      if (note) note.classList.add('warn-missing');
    });
  }
}

export function shouldShowTeach(stars: number | string): boolean {
  const td = getTeachData();
  if (!td || !td[stars]) return false;
  const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  return !read[String(stars)];
}

// ── Practice functions ────────────────────────────────────────────

export function startPractice(): void {
  if (!gs.teachData || !gs.teachData.practice || gs.teachData.practice.length === 0) {
    hideTeachModal(false);
    return;
  }

  // Practice should not keep the library overlay mounted behind modals
  closeLibraryOverlay();

  // Save ref before hideTeachModal clears it
  const td = gs.teachData;

  // Find which stars this teachData belongs to
  const teachDataMap = getTeachData();
  let stars: number | null = null;
  for (const [s, d] of Object.entries(teachDataMap)) {
    if (d === td) { stars = parseFloat(s); break; }
  }
  hideTeachModal(false);

  // Pick a random puzzle
  const idx = Math.floor(Math.random() * td.practice.length);
  const pData = td.practice[idx];

  gs.practiceState = {
    stars,
    puzzleIdx: idx,
    marked: new Set<string>(),
    hintLevel: 0,
    data: pData,
    teachRef: td,
    revealed: false,
  };

  // Set title
  const nameEl = document.getElementById('practice-tech-name')!;
  nameEl.textContent = (td.name || '') + ' \u00b7 ' + (td.technique || '');

  document.getElementById('practice-result')!.textContent = '';
  document.getElementById('practice-result')!.className = 'practice-result';
  const actionsEl = document.getElementById('practice-actions')!;
  actionsEl.style.display = 'flex';
  actionsEl.innerHTML =
    '<button class="practice-confirm-btn" onclick="confirmPractice()">確認消去</button>' +
    '<button class="practice-reveal-btn" onclick="revealPracticeAnswer()">看答案</button>';

  renderPracticeBoard();
  document.getElementById('practice-modal')!.classList.add('show');
}

export function renderPracticeBoard(): void {
  const boardEl = document.getElementById('practice-board')!;
  boardEl.innerHTML = '';
  if (!gs.practiceState) return;

  const p = gs.practiceState.data;
  const board = p.board;
  const given = p.given;
  const notes = p.notes || {};

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'practice-cell';
    cell.dataset.idx = String(i);

    if (board[i] !== 0) {
      cell.textContent = board[i];
      if (given[i] !== 0) cell.classList.add('given-cell');
    } else if (notes[i] || notes[String(i)]) {
      const noteArr = notes[i] || notes[String(i)];
      const notesGrid = document.createElement('div');
      notesGrid.className = 'tc-notes';
      for (let d = 1; d <= 9; d++) {
        const span = document.createElement('span');
        span.className = 'tc-note';
        span.dataset.digit = String(d);
        span.dataset.cell = String(i);
        if (noteArr.includes(d)) {
          span.textContent = String(d);
          span.addEventListener('click', () => toggleElimination(i, d, span));
        }
        notesGrid.appendChild(span);
      }
      cell.appendChild(notesGrid);
    }
    boardEl.appendChild(cell);
  }
  updatePracticeCounter();
}

export function toggleElimination(cellIdx: number, digit: number, spanEl: HTMLElement): void {
  if (!gs.practiceState || gs.practiceState.revealed) return;
  const key = cellIdx + ':' + digit;
  if (gs.practiceState.marked.has(key)) {
    gs.practiceState.marked.delete(key);
    spanEl.classList.remove('strike');
  } else {
    gs.practiceState.marked.add(key);
    spanEl.classList.add('strike');
  }
  updatePracticeCounter();
  // Clear previous result message
  document.getElementById('practice-result')!.textContent = '';
  document.getElementById('practice-result')!.className = 'practice-result';
}

export function updatePracticeCounter(): void {
  const el = document.getElementById('practice-counter');
  if (el && gs.practiceState) {
    el.textContent = '已選 ' + gs.practiceState.marked.size + ' 個';
  }
}

export function confirmPractice(): void {
  if (!gs.practiceState || gs.practiceState.revealed) return;
  const answer = gs.practiceState.data.answer;
  const correctSet = new Set(answer.eliminates.map((e: any) => e.cell + ':' + e.digit));
  const markedSet: Set<string> = gs.practiceState.marked;

  // Check correctness
  let wrongCount = 0;
  let correctCount = 0;

  for (const key of markedSet) {
    if (correctSet.has(key)) {
      correctCount++;
    } else {
      wrongCount++;
    }
  }
  const missingCount = correctSet.size - correctCount;

  const resultEl = document.getElementById('practice-result')!;
  const boardEl = document.getElementById('practice-board')!;

  if (wrongCount === 0 && missingCount === 0) {
    // Perfect!
    resultEl.textContent = '太棒了！完全正確！';
    resultEl.className = 'practice-result success';
    document.getElementById('practice-panel')!.classList.add('success-flash');
    gs.practiceState.revealed = true;
    // Mark done
    const done = readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {});
    if (gs.practiceState.stars !== null) done[gs.practiceState.stars] = true;
    writeJson(SK.PRACTICE_DONE, done);
    // Auto close after delay
    setTimeout(() => closePracticeModal(), 1800);
  } else if (wrongCount === 0 && missingCount > 0) {
    resultEl.textContent = '還有 ' + missingCount + ' 個候選數可以消去';
    resultEl.className = 'practice-result partial';
  } else {
    resultEl.textContent = '有些消去不正確';
    resultEl.className = 'practice-result error';
    // Mark wrong ones orange
    for (const key of markedSet) {
      if (!correctSet.has(key)) {
        const [c, d] = key.split(':');
        const noteEl = boardEl.querySelector(`.practice-cell[data-idx="${c}"] .tc-note[data-digit="${d}"]`);
        if (noteEl) {
          noteEl.classList.remove('strike');
          noteEl.classList.add('wrong');
          // Remove from marked
          gs.practiceState.marked.delete(key);
        }
      }
    }
    updatePracticeCounter();
    // Clear wrong highlight after 2s
    setTimeout(() => {
      boardEl.querySelectorAll('.tc-note.wrong').forEach(n => n.classList.remove('wrong'));
    }, 2000);
  }
}

export function showPracticeHint(): void {
  if (!gs.practiceState) return;
  const answer = gs.practiceState.data.answer;
  const boardEl = document.getElementById('practice-board')!;
  const cells = boardEl.querySelectorAll('.practice-cell');

  gs.practiceState.hintLevel++;

  if (gs.practiceState.hintLevel === 1) {
    // Highlight pattern cells
    (answer.patternCells || []).forEach((idx: number) => {
      if (cells[idx]) cells[idx].classList.add('focus');
    });
  } else if (gs.practiceState.hintLevel === 2) {
    // Show description
    const resultEl = document.getElementById('practice-result')!;
    resultEl.textContent = formatPracticeExplanation(answer);
    resultEl.className = 'practice-result';
  } else if (gs.practiceState.hintLevel >= 3) {
    // Auto-mark correct answers
    revealPracticeAnswer();
  }
}

export function formatPracticeExplanation(answer: any): string {
  const lines: string[] = [];
  if (answer && answer.description) lines.push(answer.description);
  if (answer && Array.isArray(answer.aicChain) && answer.aicChain.length > 0) {
    lines.push('');
    lines.push('推理節點鏈：');
    answer.aicChain.forEach((line: string, i: number) => {
      lines.push((i + 1) + '. ' + line);
    });
  }
  if (answer && Array.isArray(answer.proof) && answer.proof.length > 0) {
    lines.push('');
    lines.push('推理鏈：');
    answer.proof.forEach((line: string, i: number) => {
      lines.push((i + 1) + '. ' + line);
    });
  }
  return lines.join('\n');
}

export function revealPracticeAnswer(): void {
  if (!gs.practiceState) return;
  gs.practiceState.revealed = true;
  const answer = gs.practiceState.data.answer;
  const boardEl = document.getElementById('practice-board')!;
  const cells = boardEl.querySelectorAll('.practice-cell');

  // Clear all current marks
  boardEl.querySelectorAll('.tc-note.strike').forEach(n => n.classList.remove('strike'));
  boardEl.querySelectorAll('.tc-note.wrong').forEach(n => n.classList.remove('wrong'));

  // Show correct eliminations
  answer.eliminates.forEach(({ cell: idx, digit }: { cell: number; digit: number }) => {
    const noteEl = boardEl.querySelector(`.practice-cell[data-idx="${idx}"] .tc-note[data-digit="${digit}"]`);
    if (noteEl) noteEl.classList.add('correct-reveal');
  });

  // Highlight pattern cells
  (answer.patternCells || []).forEach((idx: number) => {
    if (cells[idx]) cells[idx].classList.add('focus');
  });

  const resultEl = document.getElementById('practice-result')!;
  resultEl.textContent = formatPracticeExplanation(answer) || '答案已顯示';
  resultEl.className = 'practice-result';

  // Replace actions with close button
  document.getElementById('practice-actions')!.innerHTML =
    '<button class="practice-confirm-btn" onclick="closePracticeModal()">關閉</button>';
}

export function closePracticeModal(): void {
  document.getElementById('practice-modal')!.classList.remove('show');
  document.getElementById('practice-panel')!.classList.remove('success-flash');
  gs.practiceState = null;
}
