// Thin orchestrator — wires together all extracted modules.
// The 3 300-line monolith has been split into:
//   game/state, game/utils, game/audio, game/board, game/timer, game/core
//   features/ghost, features/replay, features/duo, features/stats, features/levels, features/teach-legacy
//   firebase/client, ui/feedback, storage/keys, data/dataRegistry

import { gs, initDom } from '../game/state';
import { SK } from '../storage/keys';
import { getAllLevels } from '../data/dataRegistry';
import { bindLegacyFacade } from '../facade/windowFacade';

import { initFirebase, loadAliasToInput, saveAlias } from '../firebase/client';
import {
  initGame, handleInput, erase, resetGame, saveGameStatus,
  pauseGame, resumeGame, toggleTheme, toggleNoteMode, updateLivesUI,
} from '../game/core';
import { updateNumpadState } from '../game/board';
import {
  openReplayModal, closeReplayModal, setReplayFilter,
  replayReset, replayStepBack, replayStepForward, replayTogglePlay, replayToggleSpeed,
} from '../features/replay';
import {
  toggleDuoReady, sendDuoEmoji, closeDuoResult, resetDuoState, startDuoGlowListener,
} from '../features/duo';
import { openStatsModal, closeStatsModal, switchStatsTab } from '../features/stats';
import {
  showLevelScreen, renderStageMap, enterTier, backToStageMap,
  toggleSpeedrunMode, startPoolRandom, renderLevelGrid,
  showPreLevelModal, hidePreLevelModal, startLevelFromModal,
} from '../features/levels';
import {
  openLibraryOverlay, closeLibraryOverlay,
  showTeachModal, hideTeachModal, teachPrev, teachNext,
  startPractice, showPracticeHint, confirmPractice, revealPracticeAnswer,
  openTeachFromLibrary, closePracticeModal,
} from '../features/teach-legacy';

export function bootLegacyRuntime(appVersion: string): void {
  gs.appVersion = appVersion;

  // 1. Populate DOM refs
  initDom();

  // 2. Ensure merged levels array is ready
  getAllLevels();

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
      handleInput(i);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    gs.numButtons.push(b);
    np.appendChild(b);
  }

  // 5. Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') handleInput(parseInt(e.key));
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
    gs.aliasInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveAlias(); });
  }

  // 11. Modal backdrop-click handlers
  if (gs.replayModalEl) {
    gs.replayModalEl.addEventListener('click', (e) => { if (e.target === gs.replayModalEl) closeReplayModal(); });
  }
  const statsModalEl = document.getElementById('stats-modal');
  if (statsModalEl) {
    statsModalEl.addEventListener('click', (e) => { if (e.target === statsModalEl) closeStatsModal(); });
  }
  if (gs.libraryOverlayEl) {
    gs.libraryOverlayEl.addEventListener('click', (e) => { if (e.target === gs.libraryOverlayEl) closeLibraryOverlay(); });
  }
  const duoResultModalEl = document.getElementById('duo-result-modal');
  if (duoResultModalEl) {
    duoResultModalEl.addEventListener('click', (e) => { if (e.target === duoResultModalEl) closeDuoResult(); });
  }

  // 12. Pre-level modal buttons
  gs.preLevelStartBtn?.addEventListener('click', () => startLevelFromModal(true, false, null));
  gs.preLevelBackBtn?.addEventListener('click', hidePreLevelModal);
  if (gs.preLevelModalEl) {
    gs.preLevelModalEl.addEventListener('click', (e) => { if (e.target === gs.preLevelModalEl) hidePreLevelModal(); });
  }

  // 13. Global event handlers
  window.addEventListener('beforeunload', () => {
    if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') saveGameStatus();
    if (gs.isDuoMode && gs.firebaseReady && gs.duoRole) {
      // Best-effort cleanup
      const field = gs.duoRole === 'host' ? 'status' : 'guestId';
      const val = gs.duoRole === 'host' ? 'idle' : null;
      try { gs.db.collection('duo_room').doc('current').update({ [field]: val }); } catch { /* ignore */ }
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
    if (document.hidden && (document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') saveGameStatus();
  });

  // 14. Show level screen
  showLevelScreen();

  // 15. Bind window facade for onclick="" handlers in HTML
  bindLegacyFacade({
    openLibraryOverlay, openStatsModal, toggleSpeedrunMode, saveAlias,
    startPoolRandom, backToStageMap, closeLibraryOverlay, toggleDuoReady,
    resetGame, showLevelScreen, resumeGame, pauseGame, toggleTheme,
    toggleNoteMode, erase, sendDuoEmoji, replayReset, replayStepBack,
    replayTogglePlay, replayStepForward, replayToggleSpeed, setReplayFilter,
    closeReplayModal, switchStatsTab, closeStatsModal, closeDuoResult,
    teachPrev, teachNext, hideTeachModal, startPractice, showPracticeHint,
    confirmPractice, revealPracticeAnswer, openTeachFromLibrary,
    closePracticeModal, openReplayModal,
  });
}
