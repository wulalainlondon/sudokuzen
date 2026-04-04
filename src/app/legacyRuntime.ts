// Thin orchestrator — wires together all extracted modules.
// The 3 300-line monolith has been split into:
//   game/state, game/utils, game/audio, game/board, game/timer, game/core
//   features/ghost, features/replay, features/duo, features/stats, features/levels, features/teach-legacy
//   firebase/client, ui/feedback, storage/keys, data/dataRegistry

import { gs, initDom } from '../game/state';
import { SK } from '../storage/keys';
import { getAllLevels, warmTeachManifest, warmManifest, preloadMode } from '../data/dataRegistry';
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
import {
  openDuoLobby,
  closeDuoLobby,
  createDuoRoomFromLobby,
  joinDuoRoomFromLobby,
  updateDuoRoomLevelFromLobby,
  toggleDuoLevelLockFromLobby,
  refreshDuoLobbyRoom,
} from '../features/duoLobby';
import { openStatsModal, closeStatsModal } from '../features/stats';
import {
  showLevelScreen,
  backToStageMap,
  toggleSpeedrunMode,
  startPoolRandom,
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
import { openWildLobby, closeWildLobby, toggleWildAutoCast } from '../features/wild/wildLobby';
import { continueWild, exitWild, startWorldSession } from '../features/wild/wildController';
import { dismissMentor } from '../features/wild/mentorController';
import { openPracticeLobby, closePracticeLobby } from '../features/practice/practiceLobby';
import { initBackHandler } from './navigation/navigationOrchestrator';
import { installHostBridge, notifyHostBeforeUnload, notifyHostBootReady, type HostBridgeApi } from '../platform/hostBridge';

export function bootLegacyRuntime(appVersion: string): void {
  gs.appVersion = appVersion;

  if (import.meta.env.PROD) {
    const storedVersion = localStorage.getItem(SK.APP_VERSION);
    if (storedVersion !== appVersion) {
      void window.__pwaRuntime.enforceAppVersion(appVersion);
      return;
    }
  }

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
    notifyHostBeforeUnload();
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') saveGameStatus();
    // Clean up duo listener
    if (gs.duoUnsubscribe) { gs.duoUnsubscribe(); gs.duoUnsubscribe = null; }
    if (gs.duoGlowUnsubscribe) { gs.duoGlowUnsubscribe(); gs.duoGlowUnsubscribe = null; }
    if (gs.isDuoMode && gs.firebaseReady && gs.duoRole) {
      const field = gs.duoRole === 'host' ? 'status' : 'guestId';
      const val = gs.duoRole === 'host' ? 'idle' : null;
      try {
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (roomId) {
          gs.db
            .collection('duo_rooms')
            .doc(roomId)
            .update({ [field]: val });
        }
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

  // 14. Android back button — route through navigation orchestrator.
  initBackHandler();

  // 15. Show level screen once normal data is warm (or timeout fallback).
  // This avoids first-paint empty stage map -> second-paint filled map flicker.
  let levelScreenBooted = false;
  const bootLevelScreen = () => {
    if (levelScreenBooted) return;
    levelScreenBooted = true;
    showLevelScreen();
  };
  window.setTimeout(bootLevelScreen, 1200);
  preloadMode('normal')
    .then(bootLevelScreen)
    .catch(bootLevelScreen);

  // 15. Bind window facade for onclick="" handlers in HTML
  bindLegacyFacade({
    openLibraryOverlay,
    openStatsModal,
    toggleSpeedrunMode,
    openDuoLobby,
    closeDuoLobby,
    createDuoRoomFromLobby,
    joinDuoRoomFromLobby,
    updateDuoRoomLevelFromLobby,
    toggleDuoLevelLockFromLobby,
    refreshDuoLobbyRoom,
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

  const hostApi: HostBridgeApi = {
    apiVersion: '1',
    appVersion,
    showLevelScreen,
    startLevelFromModal,
    pauseGame,
    resumeGame,
    toggleSpeedrunMode,
    openReplayModal,
    closeReplayModal,
    openWildLobby,
    closeWildLobby,
    startWorldSession,
    continueWild,
    exitWild,
  };
  void installHostBridge(hostApi).then(() => notifyHostBootReady(appVersion));
}
