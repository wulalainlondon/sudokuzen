// Win detection, game over, and win celebrations — extracted from core.ts

import { gs } from './state';
import { getModePolicy } from './modePolicy';
import { showFeedback } from '../ui/feedback';
import { t } from '../i18n/t';
import { playWinSound, playErrorFeedback } from './audio';
import {
  addGridClass,
  removeGridClass,
  addCellClasses,
  removeCellClasses,
  markBlindReveal,
  clearBlindRevealClasses,
  applyUnitCompleteClass,
  clearUnitCompleteClass,
} from './coreUiBridge';
import { updateCellDisplay, getUnitIndices, isUnitComplete, updateNumpadState } from './board';
import { loadLevelLeaderboard, submitFirstClear } from '../firebase/client';
import { checkAllAchievements, unlockAchievement } from '../features/stats';
import { clearGameStatus, saveProgress } from './persistence';
import { toClassicLevelRecord } from '../shared/records/levelRecords';

// Lazy import to break circular: core ↔ duo
async function callDuoFinish(sec: number, stars: number) {
  try {
    const m = await import('../features/duo/duoGame');
    m.submitDuoFinish(sec, stars);
  } catch (e) {
    console.warn('lazy import duo failed:', e);
  }
}

// ── Blind reveal guard ──────────────────────────────────────────────
let _blindRevealing = false;
export function isBlindRevealing(): boolean {
  return _blindRevealing;
}

export function solutionDigitAt(idx: number): number {
  const raw = gs.currentLevel?.solution?.[idx];
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const d = Math.round(n);
  return d >= 1 && d <= 9 ? d : 0;
}

// ── Win / Game Over ─────────────────────────────────────────────────

export function checkWin(): void {
  const policy = getModePolicy();
  const isComplete = gs.cellsData.every((data, i) => data.value === solutionDigitAt(i));
  if (!isComplete) return;
  if (gs.timerInterval) clearInterval(gs.timerInterval);
  // Clear duo cooldown if active
  if (gs.duoCooldownTimer) {
    clearInterval(gs.duoCooldownTimer);
    gs.duoCooldownTimer = null;
  }
  gs.duoCooldownUntil = 0;

  // ── Wild mode: delegate to Wild controller ──
  if (gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild') {
    import('../features/wild/wildController')
      .then((m) => {
        const result = m.onWildComplete(gs.seconds, gs.errors);
        showWildWinCelebration(
          gs.seconds,
          result.expGained,
          result.leveledUp,
          result.newLevel,
          result.firstKill,
          result.firstKillSub,
          result.firstKillKey,
          result.beatMentor,
          result.cleanSolveBonus,
        );
      })
      .catch(() => {});
    return;
  }

  const isPractice = gs.currentLevel?.mode === 'practice';

  // ── Practice mode: save to practice records (skip normal records & leaderboard) ──
  if (isPractice && gs.currentLevel!.maxTechnique) {
    import('../features/practice/practiceLobby')
      .then((m) => {
        m.savePracticeRecord(
          gs.currentLevel!.id,
          gs.seconds,
          gs.errors,
          gs.currentLevel!.maxTechnique!,
          gs.actionHistory,
        );
      })
      .catch(() => {});
    clearGameStatus(gs.currentLevel!.id);
    const earnedStars = Math.max(1, 3 - gs.errors);
    showPracticeWinCelebration(earnedStars);
    if (gs.isDuoMode) callDuoFinish(gs.seconds, earnedStars);
    setTimeout(() => checkAllAchievements(), 1000);
    return;
  }

  clearGameStatus(gs.currentLevel!.id);
  const earnedValue = saveProgress();
  if (gs.isDuoMode) {
    showFeedback(t('duoRuntime.finishedFirst'), 'success');
    playWinSound();
    callDuoFinish(gs.seconds, policy.useSubmissionValidation ? 0 : earnedValue);
  } else {
    showWinCelebration(earnedValue);
  }
  setTimeout(() => {
    if (gs.isGhostMode) unlockAchievement('ghost_win');
    checkAllAchievements();
  }, 1000);
  if (!policy.useSubmissionValidation) {
    submitFirstClear(gs.currentLevel!.id, gs.seconds, earnedValue).then(() =>
      loadLevelLeaderboard(gs.currentLevel!.id),
    );
  }
}

export function checkSpeedrunComplete(lastIdx: number): void {
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
  showFeedback(t('feedback.boardError', { count: String(gs.submissionCount) }), 'error');
  playErrorFeedback();
  addGridClass(gs.gridEl, 'error-strong');
  setTimeout(() => {
    removeGridClass(gs.gridEl, 'error-strong');
  }, 500);

  if (lastIdx !== null) {
    gs.cellsData[lastIdx].value = 0;
    gs.cellsData[lastIdx].isError = true;
    const cellEl = gs.gridEl!.children[lastIdx] as HTMLElement;
    addCellClasses(cellEl, 'error');
    updateCellDisplay(cellEl, gs.cellsData[lastIdx]);
    setTimeout(() => {
      gs.cellsData[lastIdx].isError = false;
      removeCellClasses(cellEl, 'error');
      updateCellDisplay(cellEl, gs.cellsData[lastIdx]);
    }, 400);
    import('./persistence').then(({ saveGameStatus }) => saveGameStatus()).catch(() => {});
    updateNumpadState();
  }
}

export async function checkBlindComplete(): Promise<void> {
  // In blind mode, check when all 81 cells are filled
  const isFull = gs.cellsData.every((c) => c.value !== 0);
  if (!isFull) return;

  // Disable input during reveal
  _blindRevealing = true;

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
      markBlindReveal(cellEl, true);
    } else {
      errors++;
      gs.cellsData[i].isError = true;
      markBlindReveal(cellEl, false);
      updateCellDisplay(cellEl, gs.cellsData[i]);
    }

    // Update running count
    showFeedback(
      t('feedback._blindRevealing', { correct: String(correct), errors: String(errors) }),
      errors > 0 ? 'error' : 'neutral',
    );

    await new Promise((r) => setTimeout(r, 30));
  }

  // Re-enable input
  _blindRevealing = false;

  // Result phase
  if (errors === 0) {
    checkWin();
  } else {
    showFeedback(t('feedback.blindResult', { correct: String(correct), errors: String(errors) }), 'error');
    showGameOver();
  }

  // Clean up animation classes after animations finish
  setTimeout(() => {
    clearBlindRevealClasses(gs.gridEl);
  }, 600);
}

export function showGameOver(): void {
  if (gs.timerInterval) clearInterval(gs.timerInterval);

  const isWild = gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild';
  const isPractice = gs.currentLevel?.mode === 'practice';

  if (isWild) {
    import('../features/wild/wildController').then((m) => m.onWildEscape()).catch(() => {});
  } else {
    clearGameStatus(gs.currentLevel!.id);
  }

  // Delegate to React GameOverOverlay
  const mode = isWild ? 'wild' : isPractice ? 'practice' : 'normal';
  import('../react/gameover/gameOverBridge')
    .then(({ bridgeShowGameOver, bridgeSetGameOverWildSession }) => {
      if (isWild) {
        import('../features/wild/wildController')
          .then((wc) => {
            const enc = wc.getCurrentEncounter();
            let wildInfo: { techName?: string; techSubtitle?: string; isIronman?: boolean } | undefined;
            if (enc) {
              import('../features/wild/techniqueMeta')
                .then(({ getTechniqueMeta }) => {
                  const meta = getTechniqueMeta(enc.technique);
                  wildInfo = {
                    techName: meta?.name ?? '',
                    techSubtitle: meta?.subtitle ?? '',
                    isIronman: gs.wildChallengeMode === 'ironman',
                  };
                  bridgeShowGameOver(mode, wildInfo);
                })
                .catch(() => {});
            } else {
              bridgeShowGameOver(mode);
            }
            const session = wc.getSession();
            if (session) {
              bridgeSetGameOverWildSession({ round: session.round, hasMore: session.round < 10 });
            }
          })
          .catch(() => {});
      } else {
        bridgeShowGameOver(mode);
      }
    })
    .catch(() => {});
}

// ── Win celebrations (delegated to React WinCelebration component) ────

function showWinCelebration(earnedValue: number): void {
  const policy = getModePolicy();
  import('../react/win/winBridge')
    .then(({ bridgeShowWin }) => {
      bridgeShowWin({
        mode: 'normal',
        levelName: gs.currentLevel!.displayName,
        timeSeconds: gs.seconds,
        stars: policy.useSubmissionValidation ? 0 : earnedValue,
        isSpeedrun: policy.useSubmissionValidation,
        submissions: policy.useSubmissionValidation ? earnedValue : 0,
        showLeaderboard: true,
        showReplay: true,
      });
    })
    .catch(() => {});
  showFeedback(t('feedback.complete'), 'success');
  playWinSound();
}

function showPracticeWinCelebration(earnedStars: number): void {
  // Compute practice progress for this technique
  const techKey = gs.currentLevel?.maxTechnique || '';
  import('../features/practice/practiceLobby')
    .then(async () => {
      const { TECH_MAP } = await import('../features/teach-legacy');
      const { SK, readJson } = await import('../storage/keys');
      const records = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
      // Count how many levels of this technique are cleared (including the one just won)
      let cleared = 0;
      for (const rec of Object.values(records)) {
        const parsed = toClassicLevelRecord(rec);
        if (parsed?.techKey === techKey) cleared++;
      }
      // The current win may not be saved yet, so add 1 if not already counted
      if (!records[gs.currentLevel!.id]) cleared++;

      const { bridgeShowWin } = await import('../react/win/winBridge');
      bridgeShowWin({
        mode: 'practice',
        levelName: gs.currentLevel!.displayName,
        timeSeconds: gs.seconds,
        stars: earnedStars,
        showLeaderboard: false,
        showReplay: true,
        practiceTechName: TECH_MAP[techKey] || techKey,
        practiceCleared: cleared,
        practiceTotal: 25,
      });
    })
    .catch(() => {});
  // Play softer zen complete sound for practice
  import('./zenAudio').then(({ playZenComplete }) => playZenComplete(0.03)).catch(() => {});
}

function showWildWinCelebration(
  seconds: number,
  expGained: number,
  leveledUp: boolean,
  newLevel: number,
  firstKill?: string | null,
  firstKillSub?: string | null,
  firstKillKey?: string | null,
  beatMentor?: boolean,
  cleanSolveBonus?: number,
): void {
  showFeedback(
    leveledUp ? t('wildRuntime.levelUpFeedback', { level: String(newLevel) }) : t('wildRuntime.huntSuccess'),
    'success',
  );
  playWinSound();

  // Look up per-technique unveiled mentor note for first kill
  const mentorNotePromise: Promise<string | null> = firstKillKey
    ? import('../features/wild/mentorController')
        .then(({ getMentorNote }) => getMentorNote(firstKillKey, true))
        .catch(() => null)
    : Promise.resolve(null);

  const openWinScreen = (): void => {
    Promise.all([mentorNotePromise, import('../react/win/winBridge')])
      .then(([mentorNote, { bridgeShowWildWin, bridgeSetWildSession }]) => {
        bridgeShowWildWin({
          levelName: gs.currentLevel!.displayName,
          timeSeconds: seconds,
          expGained,
          leveledUp,
          newLevel,
          firstKill,
          firstKillSub,
          beatMentor,
          mentorNote,
          cleanSolveBonus,
        });
        import('../features/wild/wildController')
          .then((m) => {
            const session = m.getSession();
            bridgeSetWildSession(
              session ? { round: session.round, wins: session.wins, totalExp: session.totalExp } : null,
            );
          })
          .catch(() => {});
      })
      .catch(() => {});
  };

  if (firstKill) {
    // Play revelation ceremony first; win screen opens when ceremony completes.
    import('../react/wild/firstKillRevelationBridge')
      .then(({ bridgeShowFirstKillRevelation }) => {
        const essence = firstKillKey ? t(`mentor.techEssence.${firstKillKey}`) : '';
        const resolvedEssence = essence === `mentor.techEssence.${firstKillKey}` ? '' : essence;
        bridgeShowFirstKillRevelation(firstKill, resolvedEssence, openWinScreen);
      })
      .catch(() => openWinScreen()); // fallback: open win screen directly on import error
  } else {
    openWinScreen();
  }
}

export function celebrateCompletedUnits(idx: number, beforeState: { row: boolean; col: boolean; box: boolean }): void {
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
  // Exclude the trigger cell (idx) from unit-complete ripple so fill-pop animation
  // can complete without conflict; the wave still starts from the nearest neighbours.
  applyUnitCompleteClass(
    gs.gridEl,
    sorted.filter((i) => i !== idx),
    25,
  );
  setTimeout(() => {
    clearUnitCompleteClass(gs.gridEl, [...flashSet]);
  }, 900);

  const parts: string[] = [];
  if (justRow) parts.push(t('feedback.unitRow'));
  if (justCol) parts.push(t('feedback.unitCol'));
  if (justBox) parts.push(t('feedback.unitBox'));
  showFeedback(t('feedback.unitComplete', { parts: parts.join(' + ') }), 'success');
  import('./audio').then(({ playUnitCompleteSound }) => playUnitCompleteSound()).catch(() => {});
  if (navigator.vibrate) navigator.vibrate([8, 20, 8, 20, 8]);
}
