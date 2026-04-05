// Practice mode — extracted from teach-legacy.ts
// Manages practice board rendering, elimination toggling, and answer checking.

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { closeLibraryOverlay } from './teachLibrary';
import { hideTeachModal, closePracticeModal } from './teach-legacy';

type PracticeAnswer = {
  eliminates: Array<{ cell: number; digit: number }>;
  patternCells?: number[];
  description?: string;
  aicChain?: string[];
  proof?: string[];
};

// ── Practice functions ────────────────────────────────────────────

export function startPractice(): void {
  if (!gs.teachData || !gs.teachData.practice || gs.teachData.practice.length === 0) {
    hideTeachModal(false);
    return;
  }

  // Practice should not keep the library overlay mounted behind modals
  closeLibraryOverlay();

  // Save refs before hideTeachModal clears them
  const td = gs.teachData;
  const practiceList = td.practice ?? [];
  if (practiceList.length === 0) {
    hideTeachModal(false);
    return;
  }
  const stars = gs.teachStarsKey ? parseFloat(gs.teachStarsKey) : null;
  hideTeachModal(false);

  // Pick a random puzzle
  const idx = Math.floor(Math.random() * practiceList.length);
  const pData = practiceList[idx];

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
      cell.textContent = String(board[i]);
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
  const answer = gs.practiceState.data.answer as PracticeAnswer;
  const correctSet = new Set(answer.eliminates.map((e) => e.cell + ':' + e.digit));
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
      boardEl.querySelectorAll('.tc-note.wrong').forEach((n) => n.classList.remove('wrong'));
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

export function formatPracticeExplanation(answer: PracticeAnswer): string {
  const lines: string[] = [];
  if (answer && answer.description) lines.push(answer.description);
  if (answer && Array.isArray(answer.aicChain) && answer.aicChain.length > 0) {
    lines.push('');
    lines.push('推理節點鏈：');
    answer.aicChain.forEach((line: string, i: number) => {
      lines.push(i + 1 + '. ' + line);
    });
  }
  if (answer && Array.isArray(answer.proof) && answer.proof.length > 0) {
    lines.push('');
    lines.push('推理鏈：');
    answer.proof.forEach((line: string, i: number) => {
      lines.push(i + 1 + '. ' + line);
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
  boardEl.querySelectorAll('.tc-note.strike').forEach((n) => n.classList.remove('strike'));
  boardEl.querySelectorAll('.tc-note.wrong').forEach((n) => n.classList.remove('wrong'));

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
