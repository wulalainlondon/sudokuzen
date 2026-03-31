// Thin orchestrator — wires together all extracted modules.
// The 3 300-line monolith has been split into:
//   game/state, game/utils, game/audio, game/board, game/timer, game/core
//   features/ghost, features/replay, features/duo, features/stats, features/levels, features/teach-legacy
//   firebase/client, ui/feedback, storage/keys, data/dataRegistry

import { gs, initDom } from '../game/state';
import { SK } from '../storage/keys';
import { getAllLevels, warmTeachManifest, warmManifest } from '../data/dataRegistry';
import { bindLegacyFacade } from '../facade/windowFacade';

import { initFirebase, loadAliasToInput, saveAlias } from '../firebase/client';
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
import { toggleDuoReady, sendDuoEmoji, closeDuoResult, startDuoGlowListener } from '../features/duo';
import { openStatsModal, closeStatsModal, switchStatsTab } from '../features/stats';
import {
  showLevelScreen,
  backToStageMap,
  toggleSpeedrunMode,
  startPoolRandom,
  hidePreLevelModal,
  startLevelFromModal,
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
  if (gs.firebaseReady) startDuoGlowListener();

  // 10. Alias
  loadAliasToInput();
  if (gs.aliasInputEl) {
    gs.aliasInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveAlias();
    });
  }

  // 11. Modal backdrop-click handlers
  if (gs.replayModalEl) {
    gs.replayModalEl.addEventListener('click', (e) => {
      if (e.target === gs.replayModalEl) closeReplayModal();
    });
  }
  const statsModalEl = document.getElementById('stats-modal');
  if (statsModalEl) {
    statsModalEl.addEventListener('click', (e) => {
      if (e.target === statsModalEl) closeStatsModal();
    });
  }
  if (gs.libraryOverlayEl) {
    gs.libraryOverlayEl.addEventListener('click', (e) => {
      if (e.target === gs.libraryOverlayEl) closeLibraryOverlay();
    });
  }
  const duoResultModalEl = document.getElementById('duo-result-modal');
  if (duoResultModalEl) {
    duoResultModalEl.addEventListener('click', (e) => {
      if (e.target === duoResultModalEl) closeDuoResult();
    });
  }

  // 12. Pre-level modal buttons
  gs.preLevelStartBtn?.addEventListener('click', () => startLevelFromModal(true, false, null));
  gs.preLevelBackBtn?.addEventListener('click', hidePreLevelModal);
  const wildEnterBtn = document.getElementById('wild-enter-btn');
  wildEnterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    startPoolRandom();
  });
  if (gs.preLevelModalEl) {
    gs.preLevelModalEl.addEventListener('click', (e) => {
      if (e.target === gs.preLevelModalEl) hidePreLevelModal();
    });
  }

  // 13. Global event handlers
  window.addEventListener('beforeunload', () => {
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') saveGameStatus();
    if (gs.isDuoMode && gs.firebaseReady && gs.duoRole) {
      // Best-effort cleanup
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
    const replayModal = gs.replayModalEl;
    const duoResult = document.getElementById('duo-result-modal');
    const preLevel = gs.preLevelModalEl;
    const libraryEl = gs.libraryOverlayEl;

    if (teachModal?.classList.contains('show')) {
      hideTeachModal();
      return;
    }
    if (practiceModal?.classList.contains('show')) {
      closePracticeModal();
      return;
    }
    if (statsModal?.style.display === 'flex') {
      closeStatsModal();
      return;
    }
    if (replayModal?.classList.contains('show')) {
      closeReplayModal();
      return;
    }
    if (duoResult?.style.display === 'flex') {
      closeDuoResult();
      return;
    }
    if (libraryEl?.classList.contains('show')) {
      closeLibraryOverlay();
      return;
    }
    if (preLevel?.style.display === 'flex') {
      hidePreLevelModal();
      return;
    }

    // Game screen → pause
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') {
      const pauseScreen = document.getElementById('pause-screen');
      const overlay = gs.overlay;
      const winEl = gs.winCelebrationEl;
      if (pauseScreen?.style.display === 'flex') {
        // Already paused → go back to level screen
        showLevelScreen(true);
      } else if (overlay?.style.display === 'flex' || winEl?.style.display === 'flex') {
        // Game over or win → back to levels
        showLevelScreen(true);
      } else {
        // Playing → pause
        pauseGame();
      }
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
    switchStatsTab,
    closeStatsModal,
    closeDuoResult,
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
  });
}
