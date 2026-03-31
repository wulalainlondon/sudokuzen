// Core game logic — init, input, win detection, save/load
// Skill mode logic lives in features/skills/skillController.ts.

import { gs, type LevelData } from './state';
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
import {
  renderGrid,
  updateCellDisplay,
  selectCell,
  getUnitIndices,
  isUnitComplete,
  updateNumpadState,
  setBoardCallbacks,
} from './board';
import { startTimer } from './timer';
import { loadLevelLeaderboard, submitFirstClear } from '../firebase/client';
import { recalculatePlayerFilledCount, updateGhostProgressUI } from '../features/ghost';
import { checkAllAchievements, unlockAchievement, recordElimination } from '../features/stats';
import {
  evaluateLockedSkill,
  toggleSkillMode,
  handleCandidateProbeTap,
  castLockedSkill,
  resetSkillState,
  applyGridSkillClass,
  enterSkillMode,
  exitSkillMode,
  castSkill,
  tryQuickCast,
} from '../features/skills/skillController';

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

// ── Blind reveal guard ──────────────────────────────────────────────
let blindRevealing = false;

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

function solutionDigitAt(idx: number): number {
  const raw = gs.currentLevel?.solution?.[idx];
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const d = Math.round(n);
  return d >= 1 && d <= 9 ? d : 0;
}

// Re-export skill functions for legacy call sites (window facade, legacyRuntime).
export {
  evaluateLockedSkill,
  toggleSkillMode,
  handleCandidateProbeTap,
  castLockedSkill,
  exitSkillMode,
  castSkill,
  tryQuickCast,
};

// ── Board callbacks (Risk 6 fix: replace dynamic import() in event handlers) ──
setBoardCallbacks({
  onContinuousCellClick: (idx: number) => handleContinuousCellClick(idx),
  onContinuousDigitSet: (digit: number) => setContinuousDigit(digit),
  onCandidateProbeTap: () => {
    /* no-op — replaced by long-press cell selection */
  },
  onCellLongPress: (idx: number, prevSelected: number) => enterSkillMode(idx, prevSelected),
  onSkillModeExit: () => exitSkillMode(),
});

// ── Game lifecycle ──────────────────────────────────────────────────

function updateGameHeaderByMode(isWild: boolean): void {
  const gameTitle = document.getElementById('game-title');
  const gameModeChip = document.getElementById('game-mode-chip');
  const quitBtn = document.getElementById('quit-btn');
  const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
  if (gameTitle) gameTitle.textContent = isWild ? 'WORLD BATTLE' : 'SUDOKU';
  if (gameModeChip) gameModeChip.classList.toggle('hidden', !isWild);
  if (gameContainer) gameContainer.classList.toggle('world-play-active', isWild);
  if (quitBtn) {
    quitBtn.textContent = isWild ? '離開世界' : 'Quit';
    quitBtn.setAttribute('onclick', isWild ? 'exitWild(); showLevelScreen(true)' : 'showLevelScreen(true)');
  }
}

export function initGame(
  levelId = 1,
  forceReset = false,
  playWithGhost = false,
  ghostData: any = null,
  overrideLevelData?: LevelData,
): void {
  callCloseLibrary();
  if (overrideLevelData) {
    gs.currentLevel = overrideLevelData;
  } else {
    const levels = getAllLevels();
    gs.currentLevel = levels.find((l) => l.id === levelId) || levels[0];
  }
  callCloseReplay();
  localStorage.setItem(SK.LAST_LEVEL, String(gs.currentLevel.id));
  const isWild = gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild';
  updateGameHeaderByMode(isWild);

  gs.isGhostMode = playWithGhost;
  gs.ghostHistory = gs.isGhostMode && ghostData ? ghostData : [];
  document.getElementById('ghost-progress-container')?.classList.toggle('hidden', !gs.isGhostMode);
  if (gs.gridEl) Array.from(gs.gridEl.children).forEach((c) => c.classList.remove('ghost-marked'));

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
      document.getElementById('ghost-progress-container')?.classList.remove('hidden');
    }
  } else {
    resetGameState();
  }

  updateLivesUI();
  if (gs.overlay) gs.overlay.style.display = 'none';
  document.getElementById('pause-screen')?.style.setProperty('display', 'none');
  if (gs.winCelebrationEl) gs.winCelebrationEl.style.display = 'none';
  renderGrid();
  applyGridSkillClass();
  evaluateLockedSkill();
  document.getElementById('level-screen')?.style.setProperty('display', 'none');
  (document.querySelector('.game-container') as HTMLElement | null)?.style.setProperty('display', 'flex');
  loadLevelLeaderboard(gs.currentLevel.id);

  // If a restored save is already solved (common after interrupted updates),
  // settle immediately instead of leaving users on an unfinishable full board.
  const solvedOnLoad = gs.cellsData.every((data, i) => data.value === solutionDigitAt(i));
  if (solvedOnLoad) {
    checkWin();
    return;
  }

  startTimer(false);
}

function resetGameState(): void {
  gs.errors = 0;
  gs.seconds = 0;
  gs.submissionCount = 0;
  gs.actionHistory = [];
  gs.undoStack = [];
  gs.cellsData = gs.currentLevel!.puzzle.map((val: number) => ({
    value: val,
    fixed: val !== 0,
    notes: [],
    isError: false,
  }));
  resetSkillState();

  // Show undo button only in speedrun/blind modes
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    const showUndo = gs.isSpeedrunMode || gs.wildBlindMode;
    undoBtn.classList.toggle('hidden', !showUndo);
  }
}

// ── Save / Load ─────────────────────────────────────────────────────

export function saveGameStatus(): void {
  if (!gs.currentLevel) return;
  // Wild mode puzzles don't persist saves — leaving mid-game = escape
  if (gs.currentLevel.id < 0) return;
  const saveKey = SK.save(gs.currentLevel.id, gs.isSpeedrunMode);
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
  localStorage.setItem(saveKey, JSON.stringify(data));
  localStorage.setItem(SK.LAST_LEVEL, String(gs.currentLevel.id));
}

function loadGameStatus(levelId: number): any {
  const saved = localStorage.getItem(SK.save(levelId, gs.isSpeedrunMode));
  return saved ? JSON.parse(saved) : null;
}

function clearGameStatus(levelId: number): void {
  const saveKey = SK.save(levelId, gs.isSpeedrunMode);
  localStorage.removeItem(saveKey);
}

// ── Input handling ──────────────────────────────────────────────────

function isDigitCompletedOnBoard(num: number): boolean {
  let count = 0;
  for (const c of gs.cellsData) {
    if (c.value === num) count++;
    if (count >= 9) return true;
  }
  return false;
}

export function handleInput(num: number): void {
  if (blindRevealing) return;
  if (isDigitCompletedOnBoard(num)) return;
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
      // Push to undo stack before changing
      gs.undoStack.push({ idx: gs.selectedIdx, prevValue: data.value, prevNotes: data.notes.slice() });
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
      evaluateLockedSkill();
      return;
    }

    // ── Blind mode: skip error check, just fill ──
    if (gs.wildBlindMode) {
      gs.undoStack.push({ idx: gs.selectedIdx, prevValue: data.value, prevNotes: data.notes.slice() });
      data.value = num;
      data.notes = [];
      recordAction('fill', `${cellLabel(gs.selectedIdx)} (盲審) 填入 ${num}`, gs.selectedIdx, num);
      playFillSound();
      updateCellDisplay(cellEl, data);
      saveGameStatus();
      updateNumpadState();
      checkBlindComplete();
      evaluateLockedSkill();
      return;
    }

    if (num !== solutionDigitAt(gs.selectedIdx)) {
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
      evaluateLockedSkill();
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
  evaluateLockedSkill();
}

export function undoAction(): void {
  if (gs.undoStack.length === 0) return;
  const action = gs.undoStack.pop()!;
  const cell = gs.cellsData[action.idx];
  if (cell.fixed) return;
  cell.value = action.prevValue;
  cell.notes = action.prevNotes;
  cell.isError = false;
  const cellEl = gs.gridEl!.children[action.idx] as HTMLElement;
  cellEl.classList.remove('error');
  updateCellDisplay(cellEl, cell);
  recordAction('undo', `${cellLabel(action.idx)} 撤銷`, action.idx, action.prevValue);
  saveGameStatus();
  updateNumpadState();
  if (navigator.vibrate) navigator.vibrate(5);
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
    evaluateLockedSkill();
  }
}

// ── Win / Game Over ─────────────────────────────────────────────────

function checkWin(): void {
  const isComplete = gs.cellsData.every((data, i) => data.value === solutionDigitAt(i));
  if (!isComplete) return;
  clearInterval(gs.timerInterval!);
  // Clear duo cooldown if active
  if (gs.duoCooldownTimer) {
    clearInterval(gs.duoCooldownTimer);
    gs.duoCooldownTimer = null;
  }
  gs.duoCooldownUntil = 0;

  // ── Wild mode: delegate to Wild controller ──
  if (gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild') {
    import('../features/wild/wildController').then((m) => {
      const result = m.onWildComplete(gs.seconds, gs.errors);
      showWildWinCelebration(gs.seconds, result.expGained, result.leveledUp, result.newLevel, result.firstKill, result.firstKillSub, result.beatMentor);
    });
    return;
  }

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
    if (gs.cellsData[i].value !== solutionDigitAt(i)) {
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

async function checkBlindComplete(): Promise<void> {
  // In blind mode, check when all 81 cells are filled
  const isFull = gs.cellsData.every((c) => c.value !== 0);
  if (!isFull) return;

  // Disable input during reveal
  blindRevealing = true;

  // Scan phase: reveal cells one by one
  let correct = 0;
  let errors = 0;

  for (let i = 0; i < 81; i++) {
    if (gs.cellsData[i].fixed) {
      correct++;
      continue; // skip clue cells, they are always correct
    }

    const cellEl = gs.gridEl!.children[i] as HTMLElement;
    const isCorrect = gs.cellsData[i].value === solutionDigitAt(i);

    if (isCorrect) {
      correct++;
      cellEl.classList.add('blind-reveal-correct');
    } else {
      errors++;
      gs.cellsData[i].isError = true;
      cellEl.classList.add('blind-reveal-error', 'error');
      updateCellDisplay(cellEl, gs.cellsData[i]);
    }

    // Update running count
    showFeedback(`盲審揭曉中... 正確: ${correct} / 錯誤: ${errors}`, errors > 0 ? 'error' : 'neutral');

    await new Promise((r) => setTimeout(r, 30));
  }

  // Re-enable input
  blindRevealing = false;

  // Result phase
  if (errors === 0) {
    checkWin();
  } else {
    showFeedback(`盲審結果：${correct} 正確 / ${errors} 錯誤`, 'error');
    showGameOver();
  }

  // Clean up animation classes after animations finish
  setTimeout(() => {
    gs.gridEl?.querySelectorAll('.blind-reveal-correct, .blind-reveal-error').forEach((el) => {
      el.classList.remove('blind-reveal-correct', 'blind-reveal-error');
    });
  }, 600);
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

export function showGameOver(): void {
  clearInterval(gs.timerInterval!);

  // ── Wild mode: beast escapes ──
  const isWild = gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild';
  if (isWild) {
    import('../features/wild/wildController').then((m) => m.onWildEscape());
  } else {
    clearGameStatus(gs.currentLevel!.id);
  }

  // Update overlay button text for wild mode
  const overlayBackBtn = document.getElementById('overlay-back-btn');
  if (overlayBackBtn) {
    if (isWild) {
      // Check if in a session with rounds remaining
      import('../features/wild/wildController').then((m) => {
        const session = m.getSession();
        if (session && session.round < 10) {
          overlayBackBtn.textContent = `繼續修行 (${session.round}/10)`;
          overlayBackBtn.setAttribute('onclick', 'continueWild()');
        } else {
          overlayBackBtn.textContent = '離開世界';
          overlayBackBtn.setAttribute('onclick', 'exitWild(); showLevelScreen(true)');
        }
      });
    } else {
      overlayBackBtn.textContent = '返回選關';
      overlayBackBtn.setAttribute('onclick', 'showLevelScreen(true)');
    }
  }

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
  if (gs.wildBlindMode) {
    gs.livesEl.innerHTML =
      '<span style="color: var(--accent-strong); font-size: 0.72rem; letter-spacing: 0.08em;">盲審</span>';
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
  // Reset to normal mode buttons
  const wildBtn = document.getElementById('wild-continue-btn');
  const nextBtn = document.getElementById('win-next-btn');
  const replayBtn = document.getElementById('win-replay-btn');
  const backBtn = document.getElementById('win-back-btn');
  const leaderboardCard = gs.winCelebrationEl?.querySelector('.leaderboard-card') as HTMLElement | null;
  if (wildBtn) wildBtn.classList.add('hidden');
  if (nextBtn) nextBtn.style.display = '';
  if (replayBtn) replayBtn.style.display = '';
  if (backBtn) {
    backBtn.textContent = '返回選關';
    backBtn.setAttribute('onclick', 'showLevelScreen(true)');
  }
  if (leaderboardCard) leaderboardCard.style.display = '';
  createConfettiBurst(22);
  gs.winCelebrationEl!.style.display = 'flex';
  showFeedback('完成！太棒了！', 'success');
  playWinSound();
  if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25, 70, 50]);
}

function showWildWinCelebration(seconds: number, expGained: number, leveledUp: boolean, newLevel: number, firstKill?: string | null, firstKillSub?: string | null, beatMentor?: boolean): void {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  document.getElementById('win-level-name')!.textContent = firstKill
    ? `「${firstKill} · ${firstKillSub}」首次討伐！`
    : gs.currentLevel!.displayName;
  document.getElementById('win-time')!.textContent = `${mins}:${secs}`;

  // Check for session summary (round 10 complete)
  import('../features/wild/wildController').then((m) => {
    const session = m.getSession();
    const wildBtn = document.getElementById('wild-continue-btn');
    const nextBtn = document.getElementById('win-next-btn');
    const replayBtn = document.getElementById('win-replay-btn');
    const backBtn = document.getElementById('win-back-btn');
    const leaderboardCard = gs.winCelebrationEl?.querySelector('.leaderboard-card') as HTMLElement | null;

    if (session && session.round >= 10) {
      // Session complete — show summary
      const streakMult = session.wins >= 10 ? 1.5 : session.wins >= 8 ? 1.3 : session.wins >= 5 ? 1.1 : 1.0;
      const starsEl = document.getElementById('win-stars')!;
      starsEl.innerHTML =
        `修行輪完成！<br>${session.wins}/10 勝 · +${session.totalExp} EXP` +
        (streakMult > 1 ? `<br>連勝加成 ×${streakMult}` : '');
      if (wildBtn) {
        wildBtn.classList.remove('hidden');
        wildBtn.textContent = '新的修行輪';
      }
    } else if (session) {
      // Mid-session — show round progress
      document.getElementById('win-stars')!.textContent = leveledUp
        ? `+${expGained} EXP — Lv.${newLevel}!`
        : `+${expGained} EXP`;
      if (wildBtn) {
        wildBtn.classList.remove('hidden');
        wildBtn.textContent = `繼續修行 (${session.round}/10)`;
      }
    } else {
      // Standalone encounter
      const mentorBonus = beatMentor ? ' ⚡ 超越弈塵！' : '';
      document.getElementById('win-stars')!.textContent = leveledUp
        ? `+${expGained} EXP${mentorBonus} — Lv.${newLevel}!`
        : `+${expGained} EXP${mentorBonus}`;
      if (wildBtn) {
        wildBtn.classList.remove('hidden');
        wildBtn.textContent = '繼續世界';
      }
    }

    if (nextBtn) nextBtn.style.display = 'none';
    if (replayBtn) replayBtn.style.display = 'none';
    if (backBtn) {
      backBtn.textContent = '離開世界';
      backBtn.setAttribute('onclick', 'exitWild(); showLevelScreen(true)');
    }
    if (leaderboardCard) leaderboardCard.style.display = 'none';
  });

  createConfettiBurst(leveledUp ? 35 : 22);
  gs.winCelebrationEl!.style.display = 'flex';
  showFeedback(leveledUp ? `升級！IQ Lv.${newLevel}` : '狩獵成功！', 'success');
  playWinSound();
  if (navigator.vibrate)
    navigator.vibrate(leveledUp ? [25, 45, 25, 45, 25, 45, 25, 70, 50] : [25, 45, 25, 45, 25, 70, 50]);
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
  if (gs.wildNotesDisabled) {
    showFeedback('無念模式：筆記已禁用', 'error');
    return;
  }
  gs.isNotesMode = !gs.isNotesMode;
  document.getElementById('note-toggle')!.classList.toggle('active', gs.isNotesMode);
  // If continuous fill is active, let user know notes mode changes how it fills
  if (gs.continuousFillDigit !== null && gs.isNotesMode) {
    showFeedback('連續填入：切換為筆記模式', 'neutral');
  } else if (gs.continuousFillDigit !== null && !gs.isNotesMode) {
    showFeedback('連續填入：切換為答案模式', 'neutral');
  }
}

// ── Highlight digit across board (for continuous fill) ──────────────

function highlightDigitOnBoard(digit: number): void {
  if (!gs.gridEl || digit < 1 || digit > 9) return;
  Array.from(gs.gridEl.children).forEach((c, i) => {
    c.classList.remove('selected', 'related', 'match', 'note-match');
    c.querySelectorAll('.note-num.note-highlight').forEach((n) => n.classList.remove('note-highlight'));

    const cell = gs.cellsData[i];
    if (cell.value === digit) {
      c.classList.add('match');
    } else if (cell.value === 0 && cell.notes.includes(digit)) {
      c.classList.add('note-match');
      const noteEl = c.querySelector(`.note-num:nth-child(${digit})`);
      if (noteEl) noteEl.classList.add('note-highlight');
    }
  });
}

// ── Fill All Candidates ─────────────────────────────────────────────

export async function fillAllCandidates(): Promise<void> {
  if (!gs.gridEl || !gs.cellsData.length) return;
  if (gs.wildNotesDisabled) {
    showFeedback('無念模式：筆記已禁用', 'error');
    return;
  }

  // Calculate all legal candidates for every empty cell
  let totalFilled = 0;
  for (let i = 0; i < 81; i++) {
    const cell = gs.cellsData[i];
    if (cell.value !== 0 || cell.fixed) continue;

    const row = Math.floor(i / 9);
    const col = i % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;

    // Collect used digits in row, col, box
    const used = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const rv = gs.cellsData[row * 9 + c].value;
      if (rv) used.add(rv);
      const cv = gs.cellsData[c * 9 + col].value;
      if (cv) used.add(cv);
    }
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        const bv = gs.cellsData[r * 9 + c].value;
        if (bv) used.add(bv);
      }
    }

    const candidates: number[] = [];
    for (let d = 1; d <= 9; d++) {
      if (!used.has(d)) candidates.push(d);
    }
    cell.notes = candidates;
    totalFilled += candidates.length;
  }

  // Phase 1: Show ripple from center FIRST
  gs.gridEl.style.position = 'relative';
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
  gs.gridEl.appendChild(svg);

  // Phase 2: Wait for ripple to expand, then reveal candidates per cell by distance from center
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  await wait(250);

  // Reveal cells in distance-based order from center (4,4)
  const cellOrder = Array.from({ length: 81 }, (_, i) => {
    const row = Math.floor(i / 9),
      col = i % 9;
    const dist = Math.sqrt((row - 4) ** 2 + (col - 4) ** 2);
    return { i, dist };
  }).sort((a, b) => a.dist - b.dist);

  const TOTAL_REVEAL = 600; // ms to reveal all cells
  const maxDist = cellOrder[cellOrder.length - 1].dist;

  for (const { i, dist } of cellOrder) {
    const cell = gs.cellsData[i];
    if (cell.value !== 0 || cell.fixed || cell.notes.length === 0) continue;
    const delay = (dist / maxDist) * TOTAL_REVEAL;
    setTimeout(() => {
      const cellEl = gs.gridEl?.children[i] as HTMLElement | undefined;
      if (cellEl) {
        updateCellDisplay(cellEl, cell);
        cellEl.classList.add('candidate-reveal');
        setTimeout(() => cellEl.classList.remove('candidate-reveal'), 300);
      }
    }, delay);
  }

  await wait(TOTAL_REVEAL + 300);
  svg.remove();
  showFeedback(`已填入 ${totalFilled} 個候選`, 'success');
  saveGameStatus();
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
  if (isDigitCompletedOnBoard(num)) return;
  gs.continuousFillDigit = num;
  updateContinuousFillUI();
  // Highlight all matching cells on the board immediately
  highlightDigitOnBoard(num);
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
