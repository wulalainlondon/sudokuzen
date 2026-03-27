// Core game logic — init, input, win detection, save/load

import { gs } from './state';
import { getAllLevels } from '../data/dataRegistry';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds, cellLabel, normalizeSavedCells } from './utils';
import {
  playFillSound,
  playUnitCompleteSound,
  playWinSound,
  playErrorFeedback,
  playNoteToggleSound,
  playEraseSound,
} from './audio';
import { showFeedback, markErrorArea } from '../ui/feedback';
import { renderGrid, updateCellDisplay, selectCell, getUnitIndices, isUnitComplete, updateNumpadState } from './board';
import { startTimer } from './timer';
import { loadLevelLeaderboard, submitFirstClear } from '../firebase/client';
import { recalculatePlayerFilledCount, updateGhostProgressUI } from '../features/ghost';
import { checkAllAchievements, unlockAchievement, recordElimination } from '../features/stats';

// Lazy imports to break circular: core ↔ duo ↔ levels ↔ core
async function callDuoProgress() {
  const m = await import('../features/duo');
  m.updateDuoProgress();
}
async function callDuoFinish(sec: number, stars: number) {
  const m = await import('../features/duo');
  m.submitDuoFinish(sec, stars);
}
async function callCloseReplay() {
  const m = await import('../features/replay');
  m.closeReplayModal();
}
async function callCloseLibrary() {
  const m = await import('../features/teach-legacy');
  m.closeLibraryOverlay();
}

// ── Auto-eliminate notes from peers ─────────────────────────────────

function eliminateNoteFromPeers(idx: number, digit: number): void {
  const { rowIndices, colIndices, boxIndices } = getUnitIndices(idx);
  const peers = new Set([...rowIndices, ...colIndices, ...boxIndices]);
  peers.delete(idx);
  for (const p of peers) {
    const cell = gs.cellsData[p];
    if (cell.value !== 0) continue;
    const ni = cell.notes.indexOf(digit);
    if (ni > -1) {
      cell.notes.splice(ni, 1);
      updateCellDisplay(gs.gridEl!.children[p] as HTMLElement, cell);
      recordAction('eliminate', `${cellLabel(p)} 消去候選 ${digit}`, p, digit, cell.notes);
      recordElimination();
    }
  }
}

// ── Action recording ────────────────────────────────────────────────

function recordAction(
  type: string,
  detail: string,
  idx: number | null = null,
  val: number | null = null,
  notes: number[] | null = null,
): void {
  gs.actionHistory.push({ t: gs.seconds, type, detail, idx, val, notes: notes ? notes.slice() : null });
  if (gs.actionHistory.length > 1200) gs.actionHistory.shift();
}

// ── Game lifecycle ──────────────────────────────────────────────────

export function initGame(levelId = 1, forceReset = false, playWithGhost = false, ghostData: any = null): void {
  callCloseLibrary();
  const levels = getAllLevels();
  gs.currentLevel = levels.find((l) => l.id === levelId) || levels[0];
  callCloseReplay();
  localStorage.setItem(SK.LAST_LEVEL, String(gs.currentLevel.id));

  gs.isGhostMode = playWithGhost;
  gs.ghostHistory = gs.isGhostMode && ghostData ? ghostData : [];
  document.getElementById('ghost-progress-container')!.classList.toggle('hidden', !gs.isGhostMode);
  Array.from(gs.gridEl!.children).forEach((c) => c.classList.remove('ghost-marked'));

  const saved = forceReset ? null : loadGameStatus(gs.currentLevel.id);

  if (saved) {
    const normalizedCells = normalizeSavedCells(saved.cellsData, gs.currentLevel.puzzle);
    if (normalizedCells) {
      gs.cellsData = normalizedCells;
      gs.seconds = Number.isFinite(saved.seconds) ? Math.max(0, Math.floor(saved.seconds)) : 0;
      gs.errors = Number.isFinite(saved.errors) ? Math.min(gs.maxErrors, Math.max(0, Math.floor(saved.errors))) : 0;
      gs.submissionCount = Number.isFinite(saved.submissionCount) ? Math.max(0, Math.floor(saved.submissionCount)) : 0;
      gs.actionHistory = Array.isArray(saved.actionHistory) ? saved.actionHistory : [];
    } else {
      clearGameStatus(gs.currentLevel.id);
      resetGameState();
    }
    if (saved.isGhostMode === true && saved.ghostHistory) {
      gs.isGhostMode = true;
      gs.ghostHistory = saved.ghostHistory;
      document.getElementById('ghost-progress-container')!.classList.remove('hidden');
    }
  } else {
    resetGameState();
  }

  updateLivesUI();
  gs.overlay!.style.display = 'none';
  document.getElementById('pause-screen')!.style.display = 'none';
  gs.winCelebrationEl!.style.display = 'none';
  renderGrid();
  startTimer(false);
  loadLevelLeaderboard(gs.currentLevel.id);
  document.getElementById('level-screen')!.style.display = 'none';
  (document.querySelector('.game-container') as HTMLElement).style.display = 'flex';
}

function resetGameState(): void {
  gs.errors = 0;
  gs.seconds = 0;
  gs.submissionCount = 0;
  gs.actionHistory = [];
  gs.cellsData = gs.currentLevel!.puzzle.map((val: number) => ({
    value: val,
    fixed: val !== 0,
    notes: [],
    isError: false,
  }));
}

// ── Save / Load ─────────────────────────────────────────────────────

export function saveGameStatus(): void {
  if (!gs.currentLevel) return;
  const data = {
    levelId: gs.currentLevel.id,
    cellsData: gs.cellsData,
    seconds: gs.seconds,
    errors: gs.errors,
    submissionCount: gs.submissionCount,
    actionHistory: gs.actionHistory,
    isGhostMode: gs.isGhostMode,
    ghostHistory: gs.isGhostMode ? gs.ghostHistory : null,
  };
  localStorage.setItem(SK.save(gs.currentLevel.id, gs.isSpeedrunMode), JSON.stringify(data));
  localStorage.setItem(SK.LAST_LEVEL, String(gs.currentLevel.id));
}

function loadGameStatus(levelId: number): any {
  const saved = localStorage.getItem(SK.save(levelId, gs.isSpeedrunMode));
  return saved ? JSON.parse(saved) : null;
}

function clearGameStatus(levelId: number): void {
  localStorage.removeItem(SK.save(levelId, gs.isSpeedrunMode));
}

// ── Input handling ──────────────────────────────────────────────────

export function handleInput(num: number): void {
  if (gs.selectedIdx === null || gs.cellsData[gs.selectedIdx].fixed) return;
  if (!gs.isDuoMode && gs.errors >= gs.maxErrors) return;
  if (isDuoCooldownActive()) return;

  const data = gs.cellsData[gs.selectedIdx];
  const cellEl = gs.gridEl!.children[gs.selectedIdx] as HTMLElement;

  if (gs.isNotesMode) {
    if (data.value !== 0) return;
    const ni = data.notes.indexOf(num);
    if (ni > -1) data.notes.splice(ni, 1);
    else data.notes.push(num);
    recordAction(
      'note',
      `${cellLabel(gs.selectedIdx)} 候選 ${num}${ni > -1 ? ' 取消' : ' 加入'}`,
      gs.selectedIdx,
      null,
      data.notes,
    );
    playNoteToggleSound();
    if (navigator.vibrate) navigator.vibrate(5);
  } else {
    if (gs.isSpeedrunMode) {
      data.value = num;
      data.notes = [];
      data.isError = false;
      recordAction('fill', `${cellLabel(gs.selectedIdx)} (競速) 填入 ${num}`, gs.selectedIdx, num);
      playFillSound();
      updateCellDisplay(cellEl, data);
      saveGameStatus();
      updateNumpadState();
      if (gs.isDuoMode) callDuoProgress();
      checkSpeedrunComplete(gs.selectedIdx);
      return;
    }

    if (num !== gs.currentLevel!.solution[gs.selectedIdx]) {
      gs.errors++;
      data.isError = true;
      cellEl.classList.add('error');
      const originalValue = data.value;
      const originalNotes = data.notes.slice();
      data.value = num;
      data.notes = [];
      cellEl.classList.add('wrong-preview');
      updateCellDisplay(cellEl, data);
      markErrorArea(gs.selectedIdx);

      if (gs.isDuoMode) {
        const remaining = gs.maxErrors - gs.errors;
        if (remaining > 0) {
          // Still have lives — lose a life, no cooldown
          updateLivesUI();
          showFeedback(`錯誤！${remaining} 次機會剩餘`, 'error');
        } else if (remaining === 0) {
          // Just lost the last life — show warning, start first cooldown
          updateLivesUI();
          showFeedback('命用完了！之後答錯將會冷卻', 'error');
        } else {
          // Lives already depleted: cooldown based on same-cell streak
          const now = Date.now();
          const BASE_CD = 5;
          if (gs.selectedIdx === gs.duoLastErrorCell && now - gs.duoLastErrorTime < 30000) {
            gs.duoSameCellStreak++;
          } else {
            gs.duoSameCellStreak = 1;
          }
          gs.duoLastErrorCell = gs.selectedIdx!;
          gs.duoLastErrorTime = now;
          const cooldownSec = Math.min(BASE_CD * gs.duoSameCellStreak, 30);
          startDuoCooldown(cooldownSec);
          showFeedback(`錯誤！冷卻 ${cooldownSec}s`, 'error');
        }
      } else {
        updateLivesUI();
        showFeedback(`錯誤！${gs.maxErrors - gs.errors} 次機會剩餘`, 'error');
      }

      playErrorFeedback();
      if (navigator.vibrate) navigator.vibrate([35, 20, 25]);
      recordAction('mistake', `${cellLabel(gs.selectedIdx)} 輸入 ${num}（錯誤）`, gs.selectedIdx, num);
      setTimeout(() => {
        data.isError = false;
        cellEl.classList.remove('error');
        cellEl.classList.remove('wrong-preview');
        data.value = originalValue;
        data.notes = originalNotes;
        updateCellDisplay(cellEl, data);
      }, 400);
      saveGameStatus();
      if (!gs.isDuoMode && gs.errors >= gs.maxErrors) showGameOver();
      return;
    }

    const { rowIndices, colIndices, boxIndices } = getUnitIndices(gs.selectedIdx);
    const beforeState = {
      row: isUnitComplete(rowIndices),
      col: isUnitComplete(colIndices),
      box: isUnitComplete(boxIndices),
    };
    gs.cellsData[gs.selectedIdx].value = num;
    gs.cellsData[gs.selectedIdx].notes = [];
    gs.cellsData[gs.selectedIdx].isError = false;
    recordAction('fill', `${cellLabel(gs.selectedIdx)} 填入 ${num}`, gs.selectedIdx, num);
    // Auto-clear this digit from peer cells' notes
    eliminateNoteFromPeers(gs.selectedIdx, num);
    playFillSound();
    if (navigator.vibrate) navigator.vibrate(12);

    if (gs.isGhostMode) {
      recalculatePlayerFilledCount();
      updateGhostProgressUI();
    }
    if (!gs.isSpeedrunMode) celebrateCompletedUnits(gs.selectedIdx, beforeState);
    if (gs.isDuoMode) callDuoProgress();
    checkWin();
  }
  updateCellDisplay(cellEl, data);
  saveGameStatus();
  updateNumpadState();
  selectCell(gs.selectedIdx);
}

export function erase(): void {
  if (isDuoCooldownActive()) return;
  if (gs.selectedIdx !== null && !gs.cellsData[gs.selectedIdx].fixed) {
    const oldVal = gs.cellsData[gs.selectedIdx].value;
    const oldNotes = gs.cellsData[gs.selectedIdx].notes.slice();
    gs.cellsData[gs.selectedIdx].value = 0;
    gs.cellsData[gs.selectedIdx].notes = [];
    updateCellDisplay(gs.gridEl!.children[gs.selectedIdx] as HTMLElement, gs.cellsData[gs.selectedIdx]);
    if (oldVal !== 0 || oldNotes.length) {
      recordAction('erase', `${cellLabel(gs.selectedIdx)} 清除`, gs.selectedIdx, 0);
      playEraseSound();
      if (navigator.vibrate) navigator.vibrate(5);
    }
    saveGameStatus();
    updateNumpadState();
  }
}

// ── Win / Game Over ─────────────────────────────────────────────────

function checkWin(): void {
  const isComplete = gs.cellsData.every((data, i) => data.value === gs.currentLevel!.solution[i]);
  if (!isComplete) return;
  clearInterval(gs.timerInterval!);
  // Clear duo cooldown if active
  if (gs.duoCooldownTimer) {
    clearInterval(gs.duoCooldownTimer);
    gs.duoCooldownTimer = null;
  }
  gs.duoCooldownUntil = 0;
  clearGameStatus(gs.currentLevel!.id);
  const earnedValue = saveProgress();
  showWinCelebration(earnedValue);
  if (gs.isDuoMode) callDuoFinish(gs.seconds, gs.isSpeedrunMode ? 0 : earnedValue);
  setTimeout(() => {
    if (gs.isGhostMode) unlockAchievement('ghost_win');
    checkAllAchievements();
  }, 1000);
  if (!gs.isSpeedrunMode) {
    submitFirstClear(gs.currentLevel!.id, gs.seconds, earnedValue).then(() =>
      loadLevelLeaderboard(gs.currentLevel!.id),
    );
  }
}

function checkSpeedrunComplete(lastIdx: number): void {
  const isFull = gs.cellsData.every((c) => c.value !== 0);
  if (!isFull) return;
  let isCorrect = true;
  for (let i = 0; i < 81; i++) {
    if (gs.cellsData[i].value !== gs.currentLevel!.solution[i]) {
      isCorrect = false;
      break;
    }
  }
  if (isCorrect) {
    checkWin();
    return;
  }

  gs.submissionCount++;
  showFeedback(`盤面有誤！已重置最後一步 (第 ${gs.submissionCount} 次提交)`, 'error');
  playErrorFeedback();
  Array.from(gs.gridEl!.children).forEach((c) => c.classList.add('error-strong'));
  setTimeout(() => {
    Array.from(gs.gridEl!.children).forEach((c) => c.classList.remove('error-strong'));
  }, 500);

  if (lastIdx !== null) {
    gs.cellsData[lastIdx].value = 0;
    gs.cellsData[lastIdx].isError = true;
    const cellEl = gs.gridEl!.children[lastIdx] as HTMLElement;
    cellEl.classList.add('error');
    updateCellDisplay(cellEl, gs.cellsData[lastIdx]);
    setTimeout(() => {
      gs.cellsData[lastIdx].isError = false;
      cellEl.classList.remove('error');
      updateCellDisplay(cellEl, gs.cellsData[lastIdx]);
    }, 400);
    saveGameStatus();
    updateNumpadState();
  }
}

function saveProgress(): number {
  if (gs.isSpeedrunMode) {
    const records = readJson<Record<string, any>>(SK.SPEED_RECORDS, {});
    const existing = records[gs.currentLevel!.id];
    const currentSubs = gs.submissionCount + 1;
    const shouldUpdate =
      !existing ||
      currentSubs < (existing.submissions || Infinity) ||
      (currentSubs === (existing.submissions || Infinity) && gs.seconds < (existing.time || Infinity));
    if (shouldUpdate) {
      records[gs.currentLevel!.id] = { time: gs.seconds, submissions: currentSubs, replayHistory: gs.actionHistory };
      writeJson(SK.SPEED_RECORDS, records);
    }
    return currentSubs;
  } else {
    const records = readJson<Record<string, any>>(SK.RECORDS, {});
    const existing = records[gs.currentLevel!.id];
    const earnedStars = Math.max(1, 3 - gs.errors);
    const shouldUpdate =
      !existing ||
      earnedStars > (existing.stars || 1) ||
      (earnedStars === (existing.stars || 1) && gs.seconds < (existing.time || Infinity));
    if (shouldUpdate) {
      records[gs.currentLevel!.id] = { time: gs.seconds, stars: earnedStars, replayHistory: gs.actionHistory };
      writeJson(SK.RECORDS, records);
    }
    return earnedStars;
  }
}

function showGameOver(): void {
  clearInterval(gs.timerInterval!);
  clearGameStatus(gs.currentLevel!.id);
  gs.overlay!.style.display = 'flex';
}

export function resetGame(): void {
  if (confirm('確定要重新開始本關嗎？當前進度將遺失。')) {
    clearGameStatus(gs.currentLevel!.id);
    initGame(gs.currentLevel!.id, true);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────

export function updateLivesUI(): void {
  if (!gs.livesEl) return;
  if (gs.isSpeedrunMode) {
    gs.livesEl.innerHTML = '<span style="color: #FFC107; text-shadow: 0 0 5px rgba(255,193,7,0.5);">⚡</span>';
    return;
  }
  if (gs.isDuoMode && gs.errors >= gs.maxErrors) {
    // Lives depleted — cooldown UI takes over (handled by updateDuoCooldownUI)
    if (!isDuoCooldownActive()) {
      gs.livesEl.innerHTML = '<span style="color: var(--error-color); font-size: 0.8rem;">⚠ 無剩餘</span>';
    }
    return;
  }
  let html = '';
  const remaining = gs.maxErrors - gs.errors;
  for (let i = 0; i < remaining; i++) html += '<span>✖</span> ';
  gs.livesEl.innerHTML = html;
}

function showWinCelebration(earnedValue: number): void {
  const mins = Math.floor(gs.seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (gs.seconds % 60).toString().padStart(2, '0');
  document.getElementById('win-level-name')!.textContent = gs.currentLevel!.displayName;
  document.getElementById('win-time')!.textContent = `${mins}:${secs}`;
  if (gs.isSpeedrunMode) {
    document.getElementById('win-stars')!.textContent = `⚡ 總提交: ${earnedValue}次`;
  } else {
    document.getElementById('win-stars')!.textContent = '★'.repeat(earnedValue) + '☆'.repeat(3 - earnedValue);
  }
  createConfettiBurst(22);
  gs.winCelebrationEl!.style.display = 'flex';
  showFeedback('完成！太棒了！', 'success');
  playWinSound();
  if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25, 70, 50]);
}

function createConfettiBurst(count = 50): void {
  gs.confettiLayerEl!.innerHTML = '';
  const colors = ['#0984E3', '#74B9FF', '#A29BFE', '#DFE6E9', '#B2BEC3'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2.1 + Math.random() * 1.3}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.transform = `translateY(-20px) rotate(${Math.random() * 180}deg)`;
    gs.confettiLayerEl!.appendChild(piece);
  }
}

function celebrateCompletedUnits(idx: number, beforeState: { row: boolean; col: boolean; box: boolean }): void {
  const { rowIndices, colIndices, boxIndices } = getUnitIndices(idx);
  const justRow = !beforeState.row && isUnitComplete(rowIndices);
  const justCol = !beforeState.col && isUnitComplete(colIndices);
  const justBox = !beforeState.box && isUnitComplete(boxIndices);
  if (!justRow && !justCol && !justBox) return;

  const flashSet = new Set<number>();
  if (justRow) rowIndices.forEach((i) => flashSet.add(i));
  if (justCol) colIndices.forEach((i) => flashSet.add(i));
  if (justBox) boxIndices.forEach((i) => flashSet.add(i));

  // Staggered ripple from the trigger cell
  const sorted = [...flashSet].sort((a, b) => {
    const dA = Math.abs(Math.floor(a / 9) - Math.floor(idx / 9)) + Math.abs((a % 9) - (idx % 9));
    const dB = Math.abs(Math.floor(b / 9) - Math.floor(idx / 9)) + Math.abs((b % 9) - (idx % 9));
    return dA - dB;
  });
  sorted.forEach((i, order) => {
    const el = gs.gridEl!.children[i] as HTMLElement;
    el.style.animationDelay = `${order * 25}ms`;
    el.classList.add('unit-complete');
  });
  setTimeout(() => {
    flashSet.forEach((i) => {
      const el = gs.gridEl!.children[i] as HTMLElement;
      el.classList.remove('unit-complete');
      el.style.animationDelay = '';
    });
  }, 900);

  const parts: string[] = [];
  if (justRow) parts.push('一列');
  if (justCol) parts.push('一欄');
  if (justBox) parts.push('一宮');
  showFeedback(`完成 ${parts.join(' + ')}！`, 'success');
  playUnitCompleteSound();
  if (navigator.vibrate) navigator.vibrate([8, 20, 8, 20, 8]);
}

// ── Duo Cooldown Lock ───────────────────────────────────────────────

function startDuoCooldown(seconds: number): void {
  gs.duoCooldownUntil = Date.now() + seconds * 1000;

  // Clear any existing timer
  if (gs.duoCooldownTimer) clearInterval(gs.duoCooldownTimer);

  // Add shrinking mask on the target cell
  removeCooldownMask();
  if (gs.gridEl && gs.duoLastErrorCell >= 0) {
    const cellEl = gs.gridEl.children[gs.duoLastErrorCell] as HTMLElement;
    if (cellEl) {
      const mask = document.createElement('div');
      mask.className = 'cell-cooldown-mask';
      mask.style.animationDuration = `${seconds}s`;
      cellEl.appendChild(mask);
    }
  }

  updateDuoCooldownUI();
  gs.duoCooldownTimer = setInterval(() => {
    const left = Math.ceil((gs.duoCooldownUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(gs.duoCooldownTimer!);
      gs.duoCooldownTimer = null;
      gs.duoCooldownUntil = 0;
      removeCooldownMask();
      updateLivesUI(); // restore normal display
    } else {
      updateDuoCooldownUI();
    }
  }, 200);
}

function removeCooldownMask(): void {
  document.querySelectorAll('.cell-cooldown-mask').forEach((el) => el.remove());
}

function updateDuoCooldownUI(): void {
  if (!gs.livesEl) return;
  const left = Math.max(0, Math.ceil((gs.duoCooldownUntil - Date.now()) / 1000));
  gs.livesEl.innerHTML = `<span style="color: var(--error-color); font-size: 0.8rem; font-weight: 600;">🔒 ${left}s</span>`;
}

export function isDuoCooldownActive(): boolean {
  return gs.isDuoMode && gs.duoCooldownUntil > Date.now();
}

// ── Pause / Resume ──────────────────────────────────────────────────

export function pauseGame(): void {
  clearInterval(gs.timerInterval!);
  document.getElementById('pause-level-name')!.textContent = gs.currentLevel!.displayName;
  document.getElementById('pause-timer')!.textContent = formatSeconds(gs.seconds);
  saveGameStatus();
  loadLevelLeaderboard(gs.currentLevel!.id);
  document.getElementById('pause-screen')!.style.display = 'flex';
}

export function resumeGame(): void {
  document.getElementById('pause-screen')!.style.display = 'none';
  startTimer(false);
}

// ── Theme / Notes ───────────────────────────────────────────────────

export function toggleTheme(): void {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem(SK.THEME, next);
}

export function toggleNoteMode(): void {
  gs.isNotesMode = !gs.isNotesMode;
  document.getElementById('note-toggle')!.classList.toggle('active', gs.isNotesMode);
  // If continuous fill is active, let user know notes mode changes how it fills
  if (gs.continuousFillDigit !== null && gs.isNotesMode) {
    showFeedback('連續填入：切換為筆記模式', 'neutral');
  } else if (gs.continuousFillDigit !== null && !gs.isNotesMode) {
    showFeedback('連續填入：切換為答案模式', 'neutral');
  }
}

// ── Continuous Fill Mode ────────────────────────────────────────────

export function toggleContinuousFill(): void {
  if (gs.continuousFillDigit !== null) {
    // Turn off
    gs.continuousFillDigit = null;
  } else {
    // Turn on — use last selected numpad digit or default to null (wait for numpad click)
    gs.continuousFillDigit = 0; // 0 = active but no digit chosen yet
  }
  updateContinuousFillUI();
}

export function setContinuousDigit(num: number): void {
  if (gs.continuousFillDigit === null) return; // not in continuous mode
  gs.continuousFillDigit = num;
  updateContinuousFillUI();
}

function updateContinuousFillUI(): void {
  const btn = document.getElementById('continuous-fill-toggle');
  if (btn) btn.classList.toggle('active', gs.continuousFillDigit !== null);
  // Update numpad highlight
  gs.numButtons.forEach((b, i) => {
    b.classList.toggle('continuous-active', gs.continuousFillDigit === i + 1);
  });
}

export function handleContinuousCellClick(idx: number): boolean {
  if (gs.continuousFillDigit === null || gs.continuousFillDigit === 0) return false;
  if (gs.cellsData[idx].fixed) return false;
  if (!gs.isDuoMode && gs.errors >= gs.maxErrors) return false;
  if (isDuoCooldownActive()) return false;

  gs.selectedIdx = idx;
  selectCell(idx);
  handleInput(gs.continuousFillDigit);
  return true;
}
