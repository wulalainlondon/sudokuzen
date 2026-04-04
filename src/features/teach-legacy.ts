// Legacy teach / practice modal logic — DOM-based fallback
// Extracted from legacyRuntime.ts for modularity.
// Library UI split to teachLibrary.ts, practice mode split to teachPractice.ts.

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getTeachData, getTeachShard, hasTeachModule } from '../data/dataRegistry';
import { t } from '../i18n/t';
import { renderLibraryCards, openLibraryOverlay } from './teachLibrary';

// ── Re-exports from teachLibrary ──────────────────────────────────
export {
  isTeachReadable,
  getLibraryItemsFromTeachData,
  getLibraryItemsAsync,
  getLibraryLearningGroups,
  renderLibraryCards,
  openLibraryOverlay,
  closeLibraryOverlay,
  openTeachFromLibrary,
} from './teachLibrary';
export type { LibraryItem } from './teachLibrary';

// ── Re-exports from teachPractice ─────────────────────────────────
export {
  startPractice,
  renderPracticeBoard,
  toggleElimination,
  updatePracticeCounter,
  confirmPractice,
  showPracticeHint,
  revealPracticeAnswer,
  formatPracticeExplanation,
} from './teachPractice';

// ── Tech name mapping ─────────────────────────────────────────────

/** Localised technique name map — reads from i18n at access time via Proxy. */
export const TECH_MAP: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    const val = t(`techMap.${prop}`);
    // t() returns the key itself when missing — fall back to prop
    return val === `techMap.${prop}` ? prop : val;
  },
  has() { return true; },
});

// ── Learning order & group definitions ────────────────────────────

export const LEARNING_ORDER = [
  1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 12, 14, 27, 29, 9, 16, 17, 30, 31, 26, 28, 32, 15, 18, 19, 20, 33, 21, 24, 34, 35,
  22, 23, 37, 38, 39, 36, 25, 40,
];

const GROUP_DEFS = [
  { id: 'foundation', ids: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'candidate', ids: [8, 10, 11, 13, 12, 14, 27, 29] },
  { id: 'pattern', ids: [9, 16, 17, 30, 31, 26, 28, 32] },
  { id: 'chain', ids: [15, 18, 19, 20, 33, 21, 24, 34, 35] },
  { id: 'master', ids: [22, 23, 37, 38, 39, 36] },
  { id: 'legend', ids: [25, 40] },
];

export function getGroups() {
  return GROUP_DEFS.map((g) => ({
    ...g,
    name: t(`learnGroups.${g.id}`),
    hint: t(`learnGroups.${g.id}Hint`),
  }));
}

export function getTeachStageLabel(stars: number | string): string {
  const n = Number(stars);
  if (!Number.isFinite(n)) return t('stageLabels.studying');
  if (n <= 7) return t('stageLabels.beginner');
  if (n <= 17) return t('stageLabels.intermediate');
  if (n <= 25) return t('stageLabels.advanced');
  if (n <= 35) return t('stageLabels.expert');
  return t('stageLabels.godlike');
}

// ── Teach modal functions ─────────────────────────────────────────

export function showTeachModal(stars: number | string, source = 'tier'): void {
  // Try sync blob first, then lazy shard
  const td = getTeachData();
  const syncData = td?.[stars];
  if (syncData) {
    renderTeachModalContent(syncData, stars, source);
  } else {
    // Async fallback: fetch shard on demand
    getTeachShard(stars).then((data) => {
      if (data) renderTeachModalContent(data, stars, source);
    });
  }
}

export function renderTeachModalContent(data: any, stars: number | string, source: string): void {
  gs.teachData = data;
  gs.teachStarsKey = String(stars);
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
    practiceBtn.style.display = data.practice && data.practice.length > 0 ? '' : 'none';
  }

  document.getElementById('teach-modal')!.classList.add('show');
}

export function hideTeachModal(returnToLibrary = true): void {
  document.getElementById('teach-modal')!.classList.remove('show');

  // Mark as read
  if (gs.teachStarsKey) {
    const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
    read[gs.teachStarsKey] = true;
    writeJson(SK.TEACH_READ, read);
  }
  gs.teachData = null;
  gs.teachStarsKey = null;

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
  (document.getElementById('teach-next-btn') as HTMLButtonElement).disabled =
    gs.teachCurrentStep === gs.teachSteps.length - 1;
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
  cells.forEach((c) => {
    c.classList.remove('focus', 'eliminate', 'warn', 'masked');
    c.querySelectorAll('.tc-note').forEach((n) => {
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
    (digits as number[]).forEach((d) => {
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
  if (!hasTeachModule(stars)) return false;
  const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  return !read[String(stars)];
}

export function closePracticeModal(): void {
  document.getElementById('practice-modal')!.classList.remove('show');
  document.getElementById('practice-panel')!.classList.remove('success-flash');
  gs.practiceState = null;
}
