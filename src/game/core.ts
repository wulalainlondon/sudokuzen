// Core game logic — init, input, pause/resume, UI helpers
// Win detection lives in winDetection.ts, persistence in persistence.ts.
// Skill mode logic lives in features/skills/skillController.ts.

import { gs, type LevelData, type ActionRecord } from './state';
import { getAllLevels } from '../data/dataRegistry';
import { SK } from '../storage/keys';
import { formatSeconds, cellLabel, normalizeSavedCells } from './utils';
import { canInputByErrorGate, getModePolicy } from './modePolicy';
import { playFillSound, playErrorFeedback, playNoteToggleSound, playEraseSound } from './audio';
import { showFeedback, markErrorArea } from '../ui/feedback';
import { t } from '../i18n/t';
import { emitNavigation } from '../app/navigation/navigationBus';
import {
  setGameHeaderByMode,
  setGhostProgressVisible,
  clearGhostMarkedCells,
  hidePauseScreen,
  hideLevelScreen,
  showGameContainer,
  setUndoButtonVisible,
  setPauseScreenContent,
  showPauseScreen,
  setDocumentTheme,
  getDocumentTheme,
  setNoteToggleActive,
  setContinuousFillToggleActive,
  setNumpadContinuousState,
  addCellClasses,
  removeCellClasses,
  setLivesSpeedrun,
  setLivesBlind,
  setLivesNoRemaining,
  setLivesRemaining,
  setDuoCooldownText,
  setLevelTechniqueHint,
  addCooldownMask,
  removeCooldownMasks,
  highlightDigitOnGrid,
  createCandidateRipple,
  triggerCandidateReveal,
} from './coreUiBridge';
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
import { loadLevelLeaderboard } from '../firebase/client';
import { recalculatePlayerFilledCount, updateGhostProgressUI } from '../features/ghost';
import { recordElimination } from '../features/stats';
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
} from '../features/skills/skillController';
import { saveGameStatus, loadGameStatus, clearGameStatus } from './persistence';
import {
  checkWin,
  checkSpeedrunComplete,
  checkBlindComplete,
  showGameOver,
  celebrateCompletedUnits,
  solutionDigitAt,
  isBlindRevealing,
} from './winDetection';

// Re-export extracted modules for backward compatibility
export { saveGameStatus, loadGameStatus, clearGameStatus, saveProgress } from './persistence';
export type { SavedGameState } from './persistence';
export { checkWin, showGameOver } from './winDetection';

// Lazy imports to break circular: core ↔ duo ↔ levels ↔ core
async function callDuoProgress() {
  try {
    const m = await import('../features/duo/duoGame');
    m.updateDuoProgress();
  } catch (e) {
    console.warn('lazy import duo failed:', e);
  }
}
async function callCloseReplay() {
  try {
    const m = await import('../features/replay');
    m.closeReplayModal();
  } catch (e) {
    console.warn('lazy import replay failed:', e);
  }
}
async function callCloseLibrary() {
  try {
    const m = await import('../features/teach-legacy');
    m.closeLibraryOverlay();
  } catch (e) {
    console.warn('lazy import teach-legacy failed:', e);
  }
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
      recordAction(
        'eliminate',
        t('miscRuntime.elimLog', { cell: cellLabel(p), digit: String(digit) }),
        p,
        digit,
        cell.notes,
      );
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

// Re-export skill functions for legacy call sites (window facade, legacyRuntime).
export { evaluateLockedSkill, toggleSkillMode, handleCandidateProbeTap, castLockedSkill, exitSkillMode, castSkill };

// ── Board callbacks (Risk 6 fix: replace dynamic import() in event handlers) ──
setBoardCallbacks({
  onContinuousCellClick: (idx: number) => handleContinuousCellClick(idx),
  onContinuousDigitSet: (digit: number) => setContinuousDigit(digit),
  onCandidateProbeTap: (cell: number, digit: number) => {
    if (gs.chainTracePanelOpen) {
      import('../features/chainTracePanel').then((m) => m.onChainDigitTap(cell, digit)).catch(() => {});
    }
  },
  onCandidateCellTap: (idx: number) => {
    import('../features/skills/candidateTrackingController').then((m) => m.tapCellInTracking(idx)).catch(() => {});
  },
  onCellLongPress: (idx: number, prevSelected: number) => enterSkillMode(idx, prevSelected),
  onSkillModeExit: () => exitSkillMode(),
  onSlCellFocus: (idx: number) => {
    import('../features/strongLinkPanel').then((m) => m.onSlCellFocus(idx)).catch(() => {});
  },
});

// ── Game lifecycle ──────────────────────────────────────────────────

function updateGameHeaderByMode(isWild: boolean): void {
  const isPractice = gs.currentLevel?.mode === 'practice';
  setGameHeaderByMode({
    isWild,
    isPractice,
    worldLabel: t('mode.world'),
    practiceLabel: t('mode.practice'),
    quitWildLabel: t('nav.quitWild'),
    quitPracticeLabel: t('nav.quitPractice'),
    quitNormalLabel: t('nav.quitNormal'),
    encounterName: isWild ? gs.currentLevel?.displayName : undefined,
  });
}

export function initGame(
  levelId = 1,
  forceReset = false,
  playWithGhost = false,
  ghostData: ActionRecord[] | null = null,
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
  setLevelTechniqueHint(gs.currentLevel.maxTechnique, gs.currentLevel.techTier);

  gs.isGhostMode = playWithGhost;
  gs.ghostHistory = gs.isGhostMode && ghostData ? ghostData : [];
  setGhostProgressVisible(gs.isGhostMode);
  clearGhostMarkedCells(gs);

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
      setGhostProgressVisible(true);
    }
  } else {
    resetGameState();
  }

  setUndoButtonVisible(getModePolicy().showUndo);
  updateLivesUI();
  hidePauseScreen();
  import('../react/win/winBridge').then(({ bridgeCloseWin }) => bridgeCloseWin()).catch(() => {});
  import('../react/gameover/gameOverBridge').then(({ bridgeCloseGameOver }) => bridgeCloseGameOver()).catch(() => {});
  renderGrid();
  applyGridSkillClass();
  evaluateLockedSkill();
  hideLevelScreen();
  showGameContainer();
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
  // Reset CTM state synchronously (panel may be visible if user was tracking)
  import('../features/skills/candidateTrackingController').then((m) => m.exitCandidateTracking()).catch(() => {});

  // Undo visibility is set in initGame after level resolution
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
  const policy = getModePolicy();
  if (isBlindRevealing()) return;
  if (isDigitCompletedOnBoard(num)) return;
  if (gs.selectedIdx === null || gs.cellsData[gs.selectedIdx].fixed) return;
  if (!canInputByErrorGate()) return;
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
      t('miscRuntime.noteLog', {
        cell: cellLabel(gs.selectedIdx),
        digit: String(num),
        action: ni > -1 ? t('miscRuntime.noteRemove') : t('miscRuntime.noteAdd'),
      }),
      gs.selectedIdx,
      null,
      data.notes,
    );
    playNoteToggleSound();
    if (navigator.vibrate) navigator.vibrate(5);
  } else {
    if (policy.useSubmissionValidation) {
      // Push to undo stack before changing
      gs.undoStack.push({ idx: gs.selectedIdx, prevValue: data.value, prevNotes: data.notes.slice() });
      data.value = num;
      data.notes = [];
      data.isError = false;
      recordAction(
        'fill',
        t('miscRuntime.fillSpeedrun', { cell: cellLabel(gs.selectedIdx), digit: String(num) }),
        gs.selectedIdx,
        num,
      );
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
    if (policy.mode === 'wild' && gs.wildBlindMode) {
      gs.undoStack.push({ idx: gs.selectedIdx, prevValue: data.value, prevNotes: data.notes.slice() });
      data.value = num;
      data.notes = [];
      recordAction(
        'fill',
        t('miscRuntime.fillBlind', { cell: cellLabel(gs.selectedIdx), digit: String(num) }),
        gs.selectedIdx,
        num,
      );
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
      addCellClasses(cellEl, 'error');
      const originalValue = data.value;
      const originalNotes = data.notes.slice();
      data.value = num;
      data.notes = [];
      addCellClasses(cellEl, 'wrong-preview');
      updateCellDisplay(cellEl, data);
      markErrorArea(gs.selectedIdx);

      if (gs.isDuoMode) {
        const remaining = gs.maxErrors - gs.errors;
        if (remaining > 0) {
          // Still have lives — lose a life, no cooldown
          updateLivesUI();
          showFeedback(t('feedback.errorRemaining', { remaining: String(remaining) }), 'error');
        } else if (remaining === 0) {
          // Just lost the last life — show warning, start first cooldown
          updateLivesUI();
          showFeedback(t('feedback.livesExhausted'), 'error');
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
          showFeedback(t('feedback.cooldown', { seconds: String(cooldownSec) }), 'error');
        }
      } else {
        updateLivesUI();
        showFeedback(t('feedback.errorRemaining', { remaining: String(gs.maxErrors - gs.errors) }), 'error');
      }

      playErrorFeedback();
      if (navigator.vibrate) navigator.vibrate([35, 20, 25]);
      recordAction(
        'mistake',
        t('miscRuntime.mistakeLog', { cell: cellLabel(gs.selectedIdx), digit: String(num) }),
        gs.selectedIdx,
        num,
      );
      setTimeout(() => {
        data.isError = false;
        removeCellClasses(cellEl, 'error', 'wrong-preview');
        data.value = originalValue;
        data.notes = originalNotes;
        updateCellDisplay(cellEl, data);
      }, 400);
      saveGameStatus();
      evaluateLockedSkill();
      if (!canInputByErrorGate()) showGameOver();
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
    recordAction(
      'fill',
      t('miscRuntime.fillNormal', { cell: cellLabel(gs.selectedIdx), digit: String(num) }),
      gs.selectedIdx,
      num,
    );
    // Auto-clear this digit from peer cells' notes
    eliminateNoteFromPeers(gs.selectedIdx, num);
    playFillSound();
    if (navigator.vibrate) navigator.vibrate(12);

    if (gs.isGhostMode) {
      recalculatePlayerFilledCount();
      updateGhostProgressUI();
    }
    if (!policy.useSubmissionValidation) celebrateCompletedUnits(gs.selectedIdx, beforeState);
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
  removeCellClasses(cellEl, 'error');
  updateCellDisplay(cellEl, cell);
  recordAction('undo', t('miscRuntime.undoLog', { cell: cellLabel(action.idx) }), action.idx, action.prevValue);
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
      recordAction('erase', t('miscRuntime.eraseLog', { cell: cellLabel(gs.selectedIdx) }), gs.selectedIdx, 0);
      playEraseSound();
      if (navigator.vibrate) navigator.vibrate(5);
    }
    saveGameStatus();
    updateNumpadState();
    evaluateLockedSkill();
  }
}

export function resetGame(): void {
  if (confirm(t('misc.resetConfirm'))) {
    clearGameStatus(gs.currentLevel!.id);
    initGame(gs.currentLevel!.id, true);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────

export function updateLivesUI(): void {
  const policy = getModePolicy();
  if (policy.useSubmissionValidation) {
    setLivesSpeedrun(gs.livesEl);
    return;
  }
  if (policy.mode === 'wild' && gs.wildBlindMode) {
    setLivesBlind(gs.livesEl, t('misc.blindLabel'));
    return;
  }
  if (gs.isDuoMode && gs.errors >= gs.maxErrors) {
    // Lives depleted — cooldown UI takes over (handled by updateDuoCooldownUI)
    if (!isDuoCooldownActive()) {
      setLivesNoRemaining(gs.livesEl, t('misc.noLivesRemaining'), t('duo.surrender'));
    }
    return;
  }
  const remaining = gs.maxErrors - gs.errors;
  setLivesRemaining(gs.livesEl, remaining, gs.maxErrors);
}

// ── Duo Cooldown Lock ───────────────────────────────────────────────

function startDuoCooldown(seconds: number): void {
  gs.duoCooldownUntil = Date.now() + seconds * 1000;

  // Clear any existing timer
  if (gs.duoCooldownTimer) clearInterval(gs.duoCooldownTimer);

  // Add shrinking mask on the target cell
  removeCooldownMask();
  addCooldownMask(gs.gridEl, gs.duoLastErrorCell, seconds);

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
  removeCooldownMasks();
}

function updateDuoCooldownUI(): void {
  const left = Math.max(0, Math.ceil((gs.duoCooldownUntil - Date.now()) / 1000));
  setDuoCooldownText(gs.livesEl, left);
}

export function isDuoCooldownActive(): boolean {
  return gs.isDuoMode && gs.duoCooldownUntil > Date.now();
}

// ── Pause / Resume ──────────────────────────────────────────────────

export function pauseGame(): void {
  if (gs.timerInterval) clearInterval(gs.timerInterval);
  if (gs.wildTimerInterval) {
    clearInterval(gs.wildTimerInterval);
    gs.wildTimerInterval = null;
  }
  setPauseScreenContent(gs.currentLevel!.displayName, formatSeconds(gs.seconds));
  saveGameStatus();
  const isWild = !!(gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild');

  // Leaderboard area: show challenge rules for Wild, leaderboard for Normal
  const leaderboardTitle = document.querySelector('.leaderboard-title') as HTMLElement | null;
  const leaderboardList = document.getElementById('leaderboard-list');
  if (isWild) {
    if (leaderboardTitle) leaderboardTitle.textContent = t('wild.challengeRulesTitle');
    if (leaderboardList) {
      import('../features/wild/wildState')
        .then(({ CHALLENGE_CONFIGS }) => {
          const mode = gs.wildChallengeMode || 'standard';
          const config = CHALLENGE_CONFIGS[mode];
          leaderboardList.innerHTML = `
          <div class="challenge-rule-card">
            <div class="challenge-rule-name">${config.displayName} · ${config.subtitle}</div>
            <div class="challenge-rule-desc">${config.description}</div>
            <div class="challenge-rule-detail">${t('wild.challengeExp', { mult: String(config.expMultiplier) })}${config.maxErrors === 1 ? ' · ' + t('wild.challengeOneLife') : config.maxErrors === 81 ? ' · ' + t('wild.challengeNoCheck') : ' · ' + t('wild.challengeLives', { n: String(config.maxErrors) })}${config.notesDisabled ? ' · ' + t('wild.challengeNoNotes') : ''}${config.timerCountdown ? ' · ' + t('wild.challengeTimer', { sec: String(config.timerCountdown) }) : ''}</div>
          </div>`;
        })
        .catch(() => {});
    }
  } else {
    if (leaderboardTitle) leaderboardTitle.textContent = '首通榜 TOP 3';
    loadLevelLeaderboard(gs.currentLevel!.id);
  }
  // Unit analysis toggle — Wild mode only
  const uaToggle = document.getElementById('pause-unit-analysis-toggle');
  const uaCheckbox = document.getElementById('unit-analysis-checkbox') as HTMLInputElement | null;
  const uaLabel = document.getElementById('unit-analysis-label');
  if (uaToggle) uaToggle.classList.toggle('hidden', !isWild);
  if (uaCheckbox) {
    uaCheckbox.checked = localStorage.getItem(SK.UNIT_ANALYSIS) === '1';
    uaCheckbox.onchange = () => {
      localStorage.setItem(SK.UNIT_ANALYSIS, uaCheckbox.checked ? '1' : '0');
    };
  }
  if (uaLabel) uaLabel.textContent = t('wild.unitAnalysisToggle');

  // Strong link panel toggle — available in all modes
  const slCheckbox = document.getElementById('sl-checkbox') as HTMLInputElement | null;
  if (slCheckbox) {
    import('../features/strongLinkPanel')
      .then(({ isSlPanelEnabled, setSlPanelEnabled }) => {
        slCheckbox.checked = isSlPanelEnabled();
        slCheckbox.onchange = () => setSlPanelEnabled(slCheckbox.checked);
      })
      .catch(() => {});
  }

  // Chain trace panel toggle — available in all modes
  const ctCheckbox = document.getElementById('chain-trace-checkbox') as HTMLInputElement | null;
  if (ctCheckbox) {
    import('../features/chainTracePanel')
      .then(({ isChainTracePanelEnabled, setChainTracePanelEnabled }) => {
        ctCheckbox.checked = isChainTracePanelEnabled();
        ctCheckbox.onchange = () => setChainTracePanelEnabled(ctCheckbox.checked);
      })
      .catch(() => {});
  }

  // Chain map panel toggle — available in all modes
  const cmCheckbox = document.getElementById('chain-map-checkbox') as HTMLInputElement | null;
  if (cmCheckbox) {
    import('../features/chainMapPanel')
      .then(({ isChainMapPanelEnabled, setChainMapPanelEnabled }) => {
        cmCheckbox.checked = isChainMapPanelEnabled();
        cmCheckbox.onchange = () => setChainMapPanelEnabled(cmCheckbox.checked);
      })
      .catch(() => {});
  }

  // Candidate Tracking Mode toggle — Wild mode only
  const ctmToggle = document.getElementById('pause-ctm-toggle');
  const ctmCheckbox = document.getElementById('ctm-checkbox') as HTMLInputElement | null;
  if (ctmToggle) ctmToggle.classList.toggle('hidden', !isWild);
  if (ctmCheckbox) {
    ctmCheckbox.checked = gs.candidateTrackingEnabled;
    ctmCheckbox.onchange = () => {
      gs.candidateTrackingEnabled = ctmCheckbox.checked;
      localStorage.setItem(SK.CTM_ENABLED, ctmCheckbox.checked ? '1' : '0');
    };
  }

  // Constraint Map toggle — Wild mode only
  const cmapToggle = document.getElementById('pause-constraint-map-toggle');
  const cmapCheckbox = document.getElementById('constraint-map-checkbox') as HTMLInputElement | null;
  if (cmapToggle) cmapToggle.classList.toggle('hidden', !isWild);
  if (cmapCheckbox) {
    cmapCheckbox.checked = gs.constraintMapEnabled;
    cmapCheckbox.onchange = () => {
      gs.constraintMapEnabled = cmapCheckbox.checked;
      localStorage.setItem(SK.CONSTRAINT_MAP_ENABLED, cmapCheckbox.checked ? '1' : '0');
      import('../features/skills/candidateTrackingController').then((m) => m.refreshConstraintMap()).catch(() => {});
    };
  }

  const resumeBtn = document.getElementById('pause-resume-btn') as HTMLButtonElement | null;
  const leaveBtn = document.getElementById('pause-leave-btn') as HTMLButtonElement | null;
  const abandonBtn = document.getElementById('pause-abandon-btn') as HTMLButtonElement | null;
  if (resumeBtn) resumeBtn.textContent = t('nav.resumeGame');
  if (leaveBtn) {
    leaveBtn.textContent = isWild ? t('nav.tempLeaveEncounter') : t('nav.abandonLevel');
    leaveBtn.onclick = isWild
      ? () => {
          void leaveWildFromPause();
        }
      : () => {
          emitNavigation({ type: 'show-level-screen', returnToTier: true });
        };
  }
  if (abandonBtn) {
    abandonBtn.style.display = isWild ? '' : 'none';
    abandonBtn.textContent = t('wild.abandonEncounter');
    abandonBtn.onclick = isWild
      ? () => {
          void abandonWildFromPause();
        }
      : null;
  }
  showPauseScreen();
}

export async function leaveWildFromPause(): Promise<void> {
  hidePauseScreen();
  const { exitWild } = await import('../features/wild/wildController');
  exitWild();
  emitNavigation({ type: 'show-level-screen', returnToTier: true });
}

export async function abandonWildFromPause(): Promise<void> {
  if (!confirm(t('wild.abandonConfirm'))) return;
  hidePauseScreen();
  const { abandonWildEncounter } = await import('../features/wild/wildController');
  abandonWildEncounter();
  showFeedback(t('wild.abandonEncounter'), 'success');
  emitNavigation({ type: 'show-level-screen', returnToTier: true });
}

export function resumeGame(): void {
  hidePauseScreen();
  const isWildTimed = !!(
    gs.currentLevel &&
    gs.currentLevel.id < 0 &&
    gs.currentLevel.source === 'wild' &&
    gs.wildChallengeMode === 'timed'
  );
  if (isWildTimed) {
    import('../features/wild/wildController').then((m) => m.resumeTimedCountdown()).catch(() => {});
    return;
  }
  startTimer(false);
}

// ── Theme / Notes ───────────────────────────────────────────────────

export function toggleTheme(): void {
  const next = getDocumentTheme() === 'light' ? 'dark' : 'light';
  setDocumentTheme(next);
  localStorage.setItem(SK.THEME, next);
}

export function toggleNoteMode(): void {
  if (!getModePolicy().allowNotes) {
    showFeedback(t('feedback.noNotesMode'), 'error');
    return;
  }
  gs.isNotesMode = !gs.isNotesMode;
  setNoteToggleActive(gs.isNotesMode);
  // If continuous fill is active, let user know notes mode changes how it fills
  if (gs.continuousFillDigit !== null && gs.isNotesMode) {
    showFeedback(t('feedback.continuousFillNote'), 'neutral');
  } else if (gs.continuousFillDigit !== null && !gs.isNotesMode) {
    showFeedback(t('feedback.continuousFillAnswer'), 'neutral');
  }
}

// ── Highlight digit across board (for continuous fill) ──────────────

function highlightDigitOnBoard(digit: number): void {
  highlightDigitOnGrid(gs.gridEl, gs.cellsData, digit);
}

// ── Fill All Candidates ─────────────────────────────────────────────

export async function fillAllCandidates(): Promise<void> {
  if (!gs.gridEl || !gs.cellsData.length) return;
  if (!getModePolicy().allowNotes) {
    showFeedback(t('feedback.noNotesMode'), 'error');
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
  const svg = createCandidateRipple(gs.gridEl);

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
        triggerCandidateReveal(cellEl);
      }
    }, delay);
  }

  await wait(TOTAL_REVEAL + 300);
  svg?.remove();
  showFeedback(t('feedback.candidatesFilled', { count: String(totalFilled) }), 'success');
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
  setContinuousFillToggleActive(gs.continuousFillDigit !== null);
  setNumpadContinuousState(gs.numButtons, gs.continuousFillDigit);
}

export function handleContinuousCellClick(idx: number): boolean {
  if (gs.continuousFillDigit === null || gs.continuousFillDigit === 0) return false;
  if (gs.cellsData[idx].fixed) return false;
  if (!canInputByErrorGate()) return false;
  if (isDuoCooldownActive()) return false;

  gs.selectedIdx = idx;
  selectCell(idx);
  handleInput(gs.continuousFillDigit);
  return true;
}
