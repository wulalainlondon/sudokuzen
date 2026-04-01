// Thin orchestrator — wires together all extracted modules.
// The 3 300-line monolith has been split into:
//   game/state, game/utils, game/audio, game/board, game/timer, game/core
//   features/ghost, features/replay, features/duo, features/stats, features/levels, features/teach-legacy
//   firebase/client, ui/feedback, storage/keys, data/dataRegistry

import { gs, initDom } from '../game/state';
import { SK } from '../storage/keys';
import { getAllLevels, warmTeachManifest, warmManifest } from '../data/dataRegistry';
import { bindLegacyFacade } from '../facade/windowFacade';

import { initFirebase, initPresence, loadAliasToInput, saveAlias } from '../firebase/client';
import {
  handleInput,
  erase,
  resetGame,
  saveGameStatus,
  pauseGame,
  resumeGame,
  toggleTheme,
  toggleNoteMode,
  toggleContinuousFill,
  setContinuousDigit,
  fillAllCandidates,
  undoAction,
} from '../game/core';
import { exitSkillMode, castSkill } from '../features/skills/skillController';
import {
  openReplayModal,
  closeReplayModal,
  setReplayFilter,
  replayReset,
  replayStepBack,
  replayStepForward,
  replayTogglePlay,
  replayToggleSpeed,
} from '../features/replay';
import { toggleDuoReady, sendDuoEmoji, closeDuoResult, surrenderDuo, startDuoGlowListener } from '../features/duo';
import { openStatsModal, closeStatsModal } from '../features/stats';
import {
  showLevelScreen,
  backToStageMap,
  toggleSpeedrunMode,
  startPoolRandom,
  hidePreLevelModal,
} from '../features/levels';
import {
  openLibraryOverlay,
  closeLibraryOverlay,
  hideTeachModal,
  teachPrev,
  teachNext,
  startPractice,
  showPracticeHint,
  confirmPractice,
  revealPracticeAnswer,
  openTeachFromLibrary,
  closePracticeModal,
} from '../features/teach-legacy';
import { openWildLobby, closeWildLobby, toggleWildAutoCast, isWorldLobbyOpen } from '../features/wild/wildLobby';
import { continueWild, exitWild, startWorldSession } from '../features/wild/wildController';
import { dismissMentor } from '../features/wild/mentorController';
import { openPracticeLobby, closePracticeLobby, isPracticeLobbyOpen, backToPracticeLobby } from '../features/practice/practiceLobby';
import { useWinStore } from '../react/win/winStore';
import { useGameOverStore } from '../react/gameover/gameOverStore';
import { useStatsStore } from '../react/stats/statsStore';
import { usePreLevelStore } from '../react/prelevel/preLevelStore';
import { useDuoResultStore } from '../react/duoresult/duoResultStore';
import { useLibraryStore } from '../react/library/libraryStore';
import { useReplayStore } from '../react/replay/replayStore';
import { useMentorStore } from '../react/mentor/mentorStore';
import { useEncounterTransitionStore } from '../react/wild/encounterTransitionStore';
import { bridgeCloseWin } from '../react/win/winBridge';
import { bridgeCloseGameOver } from '../react/gameover/gameOverBridge';

function isWinCelebrationOpen(): boolean {
  return useWinStore.getState().visible;
}

export function bootLegacyRuntime(appVersion: string): void {
  gs.appVersion = appVersion;

  // 1. Populate DOM refs
  initDom();

  // 2. Ensure merged levels array is ready
  getAllLevels();

  // 2b. Pre-fetch manifests (async, non-blocking)
  warmTeachManifest();
  warmManifest();

  // 3. Restore persisted settings
  gs.isSpeedrunMode = localStorage.getItem(SK.SPEEDRUN) === 'true';

  // 4. Build numpad
  const np = document.getElementById('numpad')!;
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.textContent = String(i);
    b.addEventListener('pointerdown', (ev) => {
      if (ev && ev.button !== undefined && ev.button !== 0) return;
      if (gs.continuousFillDigit !== null) {
        setContinuousDigit(i);
      } else {
        handleInput(i);
      }
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    gs.numButtons.push(b);
    np.appendChild(b);
  }

  // 5. Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') {
      const num = parseInt(e.key);
      if (gs.continuousFillDigit !== null) {
        setContinuousDigit(num);
      } else {
        handleInput(num);
      }
    }
    if (e.key === 'Backspace') erase();
  });

  // 6. Theme
  const savedTheme = localStorage.getItem(SK.THEME) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 7. Version badge
  document.getElementById('version-badge')!.textContent = `v${appVersion}`;

  // 8. PWA
  window.__pwaRuntime.enforceAppVersion(appVersion);
  window.__pwaRuntime.registerServiceWorkerUpdateFlow();

  // 9. Firebase
  initFirebase();
  if (gs.firebaseReady) {
    startDuoGlowListener();
    initPresence();
  }

  // 10. Alias
  loadAliasToInput();
  if (gs.aliasInputEl) {
    gs.aliasInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveAlias();
    });
  }

  // 11. Modal backdrop-click handlers
  // Replay modal backdrop click is now React-managed
  const statsModalEl = document.getElementById('stats-modal');
  if (statsModalEl) {
    statsModalEl.addEventListener('click', (e) => {
      if (e.target === statsModalEl) closeStatsModal();
    });
  }
  // library-overlay and duo-result-modal backdrop clicks are now React-managed

  // 12. Pre-level modal buttons
  // Pre-level modal start/back buttons are now React-managed
  const wildEnterBtn = document.getElementById('wild-enter-btn');
  wildEnterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    startPoolRandom();
  });
  // Pre-level modal backdrop click is now React-managed

  // 13. Global event handlers
  window.addEventListener('beforeunload', () => {
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') saveGameStatus();
    // Clean up duo listener
    if (gs.duoUnsubscribe) { gs.duoUnsubscribe(); gs.duoUnsubscribe = null; }
    if (gs.duoGlowUnsubscribe) { gs.duoGlowUnsubscribe(); gs.duoGlowUnsubscribe = null; }
    if (gs.isDuoMode && gs.firebaseReady && gs.duoRole) {
      const field = gs.duoRole === 'host' ? 'status' : 'guestId';
      const val = gs.duoRole === 'host' ? 'idle' : null;
      try {
        gs.db
          .collection('duo_room')
          .doc('current')
          .update({ [field]: val });
      } catch {
        /* ignore */
      }
    }
    // Clean up wild timer
    if (gs.wildTimerInterval) { clearInterval(gs.wildTimerInterval); gs.wildTimerInterval = null; }
  });
  window.addEventListener('resize', () => {
    if (document.getElementById('level-screen')?.style.display === 'flex') {
      requestAnimationFrame(() => {
        const items = document.querySelectorAll('#level-list .level-item');
        items.forEach((item) => {
          const w = (item as HTMLElement).getBoundingClientRect().width;
          if (w > 0) (item as HTMLElement).style.height = `${w}px`;
        });
      });
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex')
      saveGameStatus();
  });

  // 14. Android back button — navigate within app, never leave
  // Keep an extra guard entry so the first Back always triggers popstate
  // instead of exiting the standalone PWA/webview.
  history.replaceState({ screen: 'stage' }, '');
  history.pushState({ screen: 'nav' }, '');
  window.addEventListener('popstate', () => {
    // Always push state back so we never run out of history
    history.pushState({ screen: 'nav' }, '');

    // Priority: close modals first
    const teachModal = document.getElementById('teach-modal');
    const practiceModal = document.getElementById('practice-modal');
    const statsModal = document.getElementById('stats-modal');
    // replay-modal, duo-result-modal and library-overlay are now React-managed (checked via stores below)

    if (teachModal?.classList.contains('show')) {
      hideTeachModal();
      return;
    }
    if (practiceModal?.classList.contains('show')) {
      closePracticeModal();
      return;
    }
    if (statsModal?.style.display === 'flex' || useStatsStore.getState().visible) {
      closeStatsModal();
      return;
    }
    if (useReplayStore.getState().visible) {
      closeReplayModal();
      return;
    }
    if (useDuoResultStore.getState().visible) {
      closeDuoResult();
      return;
    }
    if (useLibraryStore.getState().visible) {
      closeLibraryOverlay();
      return;
    }
    if (usePreLevelStore.getState().visible) {
      hidePreLevelModal();
      return;
    }
    if (useWinStore.getState().visible) {
      bridgeCloseWin();
      return;
    }
    if (useGameOverStore.getState().visible) {
      bridgeCloseGameOver();
      return;
    }
    if (useMentorStore.getState().visible) {
      dismissMentor();
      return;
    }
    if (useEncounterTransitionStore.getState().active) {
      import('../react/wild/encounterTransitionBridge').then(({ bridgeDismissEncounterTransition }) => bridgeDismissEncounterTransition());
      return;
    }

    // Game screen → pause
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') {
      const pauseScreen = document.getElementById('pause-screen');
      if (pauseScreen?.style.display === 'flex') {
        // Already paused → go back to level screen
        showLevelScreen(true);
      } else if (isWinCelebrationOpen() || useGameOverStore.getState().visible) {
        // Game over or win → back to levels
        showLevelScreen(true);
      } else {
        // Playing → pause
        pauseGame();
      }
      return;
    }

    // Practice: tier-view showing a technique's levels → back to practice lobby
    if (gs.practiceActiveTech && !document.getElementById('tier-view')?.classList.contains('hidden')) {
      backToPracticeLobby();
      return;
    }

    // Practice lobby → stage map
    if (isPracticeLobbyOpen()) {
      closePracticeLobby();
      return;
    }

    // Wild lobby → stage map
    if (isWorldLobbyOpen()) {
      closeWildLobby();
      return;
    }

    // Tier view → stage map
    if (!document.getElementById('tier-view')?.classList.contains('hidden')) {
      backToStageMap();
      return;
    }

    // Stage map = top level → do nothing (stay in app)
  });

  // 15. Show level screen
  showLevelScreen();

  // 15. Bind window facade for onclick="" handlers in HTML
  bindLegacyFacade({
    openLibraryOverlay,
    openStatsModal,
    toggleSpeedrunMode,
    saveAlias,
    startPoolRandom,
    backToStageMap,
    closeLibraryOverlay,
    toggleDuoReady,
    resetGame,
    showLevelScreen,
    resumeGame,
    pauseGame,
    toggleTheme,
    toggleContinuousFill,
    toggleNoteMode,
    exitSkillMode,
    castSkill,
    erase,
    undoAction,
    fillAllCandidates,
    sendDuoEmoji,
    replayReset,
    replayStepBack,
    replayTogglePlay,
    replayStepForward,
    replayToggleSpeed,
    setReplayFilter,
    closeReplayModal,
    closeStatsModal,
    closeDuoResult,
    surrenderDuo,
    teachPrev,
    teachNext,
    hideTeachModal,
    startPractice,
    showPracticeHint,
    confirmPractice,
    revealPracticeAnswer,
    openTeachFromLibrary,
    closePracticeModal,
    openReplayModal,
    openWildLobby,
    closeWildLobby,
    toggleWildAutoCast,
    continueWild,
    exitWild,
    startWorldSession,
    dismissMentor,
    openPracticeLobby,
    closePracticeLobby,
  });
}
