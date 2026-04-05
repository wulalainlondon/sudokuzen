import { escapeHtml } from '../shared/html/escape';

interface GameHeaderPayload {
  isWild: boolean;
  isPractice: boolean;
  worldLabel: string;
  practiceLabel: string;
  quitWildLabel: string;
  quitPracticeLabel: string;
  quitNormalLabel: string;
  encounterName?: string;
}

export function setGameHeaderByMode(payload: GameHeaderPayload): void {
  const gameTitle = document.getElementById('game-title');
  const gameModeChip = document.getElementById('game-mode-chip');
  const quitBtn = document.getElementById('quit-btn');
  const gameContainer = document.querySelector('.game-container') as HTMLElement | null;

  if (gameTitle) gameTitle.textContent = payload.isWild ? payload.worldLabel : payload.isPractice ? payload.practiceLabel : 'SUDOKU';
  // In Wild mode, show encounter name in the mode chip
  if (gameModeChip) {
    if (payload.isWild && payload.encounterName) {
      gameModeChip.textContent = payload.encounterName;
      gameModeChip.classList.remove('hidden');
    } else {
      gameModeChip.classList.add('hidden');
    }
  }
  if (gameContainer) gameContainer.classList.toggle('world-play-active', payload.isWild);
  if (quitBtn) {
    // Wild mode: hide quit btn — pause screen has leave/abandon actions
    if (payload.isWild) {
      quitBtn.style.display = 'none';
    } else {
      quitBtn.style.display = '';
      quitBtn.textContent = payload.isPractice ? payload.quitPracticeLabel : payload.quitNormalLabel;
      quitBtn.setAttribute('onclick', 'showLevelScreen(true)');
    }
  }
}

export function setGhostProgressVisible(visible: boolean): void {
  document.getElementById('ghost-progress-container')?.classList.toggle('hidden', !visible);
}

export function clearGhostMarkedCells(state: { gridEl: HTMLElement | null }): void {
  if (!state.gridEl) return;
  Array.from(state.gridEl.children).forEach((c) => c.classList.remove('ghost-marked'));
}

export function hidePauseScreen(): void {
  const el = document.getElementById('pause-screen');
  if (el) el.style.display = 'none';
}

export function hideLevelScreen(): void {
  const el = document.getElementById('level-screen');
  if (el) el.style.display = 'none';
}

export function showGameContainer(): void {
  const el = document.querySelector('.game-container') as HTMLElement | null;
  if (el) el.style.display = 'flex';
}

export function setUndoButtonVisible(visible: boolean): void {
  document.getElementById('undo-btn')?.classList.toggle('hidden', !visible);
}

export function setPauseScreenContent(levelName: string, timerText: string): void {
  const levelEl = document.getElementById('pause-level-name');
  const timerEl = document.getElementById('pause-timer');
  if (levelEl) levelEl.textContent = levelName;
  if (timerEl) timerEl.textContent = timerText;
}

export function showPauseScreen(): void {
  const el = document.getElementById('pause-screen');
  if (el) el.style.display = 'flex';
}

export function setDocumentTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getDocumentTheme(): string {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

export function setNoteToggleActive(active: boolean): void {
  document.getElementById('note-toggle')?.classList.toggle('active', active);
}

export function setContinuousFillToggleActive(active: boolean): void {
  document.getElementById('continuous-fill-toggle')?.classList.toggle('active', active);
}

export function setNumpadContinuousState(buttons: HTMLButtonElement[], activeDigit: number | null): void {
  buttons.forEach((b, i) => {
    b.classList.toggle('continuous-active', activeDigit === i + 1);
  });
}

export function addCellClasses(cellEl: HTMLElement, ...classes: string[]): void {
  cellEl.classList.add(...classes);
}

export function removeCellClasses(cellEl: HTMLElement, ...classes: string[]): void {
  cellEl.classList.remove(...classes);
}

export function addGridClass(gridEl: HTMLElement | null, className: string): void {
  if (!gridEl) return;
  Array.from(gridEl.children).forEach((c) => c.classList.add(className));
}

export function removeGridClass(gridEl: HTMLElement | null, className: string): void {
  if (!gridEl) return;
  Array.from(gridEl.children).forEach((c) => c.classList.remove(className));
}

export function markBlindReveal(cellEl: HTMLElement, isCorrect: boolean): void {
  if (isCorrect) {
    cellEl.classList.add('blind-reveal-correct');
    return;
  }
  cellEl.classList.add('blind-reveal-error', 'error');
}

export function clearBlindRevealClasses(gridEl: HTMLElement | null): void {
  gridEl?.querySelectorAll('.blind-reveal-correct, .blind-reveal-error').forEach((el) => {
    el.classList.remove('blind-reveal-correct', 'blind-reveal-error');
  });
}

export function setLivesSpeedrun(livesEl: HTMLElement | null): void {
  if (!livesEl) return;
  livesEl.innerHTML = '<span style="color: #FFC107; text-shadow: 0 0 5px rgba(255,193,7,0.5);">⚡</span>';
}

export function setLivesBlind(livesEl: HTMLElement | null, blindLabel: string): void {
  if (!livesEl) return;
  livesEl.innerHTML =
    `<span style="color: var(--accent-strong); font-size: 0.72rem; letter-spacing: 0.08em;">${escapeHtml(blindLabel)}</span>`;
}

export function setLivesNoRemaining(livesEl: HTMLElement | null, noLivesLabel: string, surrenderLabel: string): void {
  if (!livesEl) return;
  livesEl.innerHTML = `<span style="color: var(--error-color); font-size: 0.8rem;">${escapeHtml(noLivesLabel)}</span> <button class="duo-surrender-btn" onclick="surrenderDuo()">${escapeHtml(surrenderLabel)}</button>`;
}

export function setLivesRemaining(livesEl: HTMLElement | null, remaining: number): void {
  if (!livesEl) return;
  let html = '';
  for (let i = 0; i < remaining; i++) html += '<span>✖</span> ';
  livesEl.innerHTML = html;
}

export function setDuoCooldownText(livesEl: HTMLElement | null, leftSeconds: number): void {
  if (!livesEl) return;
  livesEl.innerHTML = `<span style="color: var(--error-color); font-size: 0.8rem; font-weight: 600;">🔒 ${leftSeconds}s</span>`;
}

export function applyUnitCompleteClass(gridEl: HTMLElement | null, cellIndices: number[], stepMs: number): void {
  if (!gridEl) return;
  cellIndices.forEach((i, order) => {
    const el = gridEl.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.style.animationDelay = `${order * stepMs}ms`;
    el.classList.add('unit-complete');
  });
}

export function clearUnitCompleteClass(gridEl: HTMLElement | null, cellIndices: number[]): void {
  if (!gridEl) return;
  cellIndices.forEach((i) => {
    const el = gridEl.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.classList.remove('unit-complete');
    el.style.animationDelay = '';
  });
}

export function addCooldownMask(gridEl: HTMLElement | null, targetIdx: number, seconds: number): void {
  if (!gridEl || targetIdx < 0) return;
  const cellEl = gridEl.children[targetIdx] as HTMLElement | undefined;
  if (!cellEl) return;
  const mask = document.createElement('div');
  mask.className = 'cell-cooldown-mask';
  mask.style.animationDuration = `${seconds}s`;
  cellEl.appendChild(mask);
}

export function removeCooldownMasks(): void {
  document.querySelectorAll('.cell-cooldown-mask').forEach((el) => el.remove());
}

export function highlightDigitOnGrid(
  gridEl: HTMLElement | null,
  cellsData: Array<{ value: number; notes: number[] }>,
  digit: number,
): void {
  if (!gridEl || digit < 1 || digit > 9) return;
  Array.from(gridEl.children).forEach((c, i) => {
    c.classList.remove('selected', 'related', 'match', 'note-match');
    c.querySelectorAll('.note-num.note-highlight').forEach((n) => n.classList.remove('note-highlight'));
    const cell = cellsData[i];
    if (cell.value === digit) {
      c.classList.add('match');
    } else if (cell.value === 0 && cell.notes.includes(digit)) {
      c.classList.add('note-match');
      const noteEl = c.querySelector(`.note-num:nth-child(${digit})`);
      if (noteEl) noteEl.classList.add('note-highlight');
    }
  });
}

export function createCandidateRipple(gridEl: HTMLElement | null): SVGSVGElement | null {
  if (!gridEl) return null;
  gridEl.style.position = 'relative';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;overflow:visible';

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('cx', '50');
  ring.setAttribute('cy', '50');
  ring.setAttribute('r', '2');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'var(--accent-strong)');
  ring.setAttribute('stroke-width', '1');
  ring.style.animation = 'skill-ripple-expand 1s ease-out forwards';
  svg.appendChild(ring);
  gridEl.appendChild(svg);
  return svg;
}

export function triggerCandidateReveal(cellEl: HTMLElement): void {
  cellEl.classList.add('candidate-reveal');
  setTimeout(() => cellEl.classList.remove('candidate-reveal'), 300);
}
