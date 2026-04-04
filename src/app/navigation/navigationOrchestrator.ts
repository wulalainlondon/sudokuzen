import { gs, type LevelData } from '../../game/state';
import { pauseGame, leaveWildFromPause } from '../../game/core';
import {
  backToStageMap,
  enterTier,
  hidePreLevelModal,
  showLevelScreen,
  showPreLevelModal,
} from '../../features/levels';
import { onNavigation } from './navigationBus';
import { hideTeachModal, closePracticeModal, closeLibraryOverlay } from '../../features/teach-legacy';
import { closeReplayModal } from '../../features/replay';
import { closeDuoResult } from '../../features/duo';
import { closeDuoLobby, isDuoLobbyOpen } from '../../features/duoLobby';
import { closeStatsModal } from '../../features/stats';
import { dismissMentor } from '../../features/wild/mentorController';
import { closeWildLobby, isWorldLobbyOpen } from '../../features/wild/wildLobby';
import { closePracticeLobby, isPracticeLobbyOpen, backToPracticeLobby } from '../../features/practice/practiceLobby';
import { useWinStore } from '../../react/win/winStore';
import { useGameOverStore } from '../../react/gameover/gameOverStore';
import { useStatsStore } from '../../react/stats/statsStore';
import { usePreLevelStore } from '../../react/prelevel/preLevelStore';
import { useDuoResultStore } from '../../react/duoresult/duoResultStore';
import { useLibraryStore } from '../../react/library/libraryStore';
import { useReplayStore } from '../../react/replay/replayStore';
import { useMentorStore } from '../../react/mentor/mentorStore';
import { useEncounterTransitionStore } from '../../react/wild/encounterTransitionStore';
import { bridgeCloseWin } from '../../react/win/winBridge';
import { bridgeCloseGameOver } from '../../react/gameover/gameOverBridge';
import { bridgeCloseWildMentorNote, bridgeHasWildMentorNoteOpen } from '../../react/wild/wildLobbyBridge';

let backHandlerInitialized = false;
let onPopStateRef: (() => void) | null = null;

function ensureNavHistory(): void {
  history.replaceState({ screen: 'stage' }, '');
  history.pushState({ screen: 'nav' }, '');
}

export function initBackHandler(): void {
  if (backHandlerInitialized) return;

  ensureNavHistory();
  onPopStateRef = () => {
    history.pushState({ screen: 'nav' }, '');
    back();
  };
  window.addEventListener('popstate', onPopStateRef);

  onNavigation((intent) => {
    switch (intent.type) {
      case 'show-level-screen':
        showLevelScreen(intent.returnToTier);
        break;
      case 'hide-pre-level-modal':
        hidePreLevelModal();
        break;
      case 'show-pre-level-modal':
        showPreLevelModal(intent.levelId, intent.ignoreTierLock, intent.externalLevel);
        break;
      case 'back-to-stage-map':
        backToStageMap();
        break;
    }
  });

  backHandlerInitialized = true;
}

export function disposeBackHandler(): void {
  if (!backHandlerInitialized || !onPopStateRef) return;
  window.removeEventListener('popstate', onPopStateRef);
  onPopStateRef = null;
  backHandlerInitialized = false;
}

export function navigateToLevelScreen(returnToTier = false): void {
  showLevelScreen(returnToTier);
}

export function navigateToTier(tierName: string): void {
  enterTier(tierName);
}

export function navigateToStageMap(): void {
  backToStageMap();
}

export function navigateToPreLevel(
  levelId: number,
  options?: {
    ignoreTierLock?: boolean;
    externalLevel?: LevelData;
  },
): void {
  showPreLevelModal(levelId, options?.ignoreTierLock ?? false, options?.externalLevel);
}

export function back(): void {
  const teachModal = document.getElementById('teach-modal');
  const practiceModal = document.getElementById('practice-modal');
  const statsModal = document.getElementById('stats-modal');

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
  if (bridgeHasWildMentorNoteOpen()) {
    bridgeCloseWildMentorNote();
    return;
  }
  if (useEncounterTransitionStore.getState().active) {
    import('../../react/wild/encounterTransitionBridge').then(({ bridgeDismissEncounterTransition }) => {
      bridgeDismissEncounterTransition();
    });
    return;
  }

  if ((document.querySelector('.game-container') as HTMLElement)?.style.display === 'flex') {
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen?.style.display === 'flex') {
      const isWild = !!(gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild');
      if (isWild) {
        void leaveWildFromPause();
      } else {
        navigateToLevelScreen(true);
      }
    } else if (useWinStore.getState().visible || useGameOverStore.getState().visible) {
      navigateToLevelScreen(true);
    } else {
      pauseGame();
    }
    return;
  }

  if (gs.practiceActiveTech && !document.getElementById('tier-view')?.classList.contains('hidden')) {
    backToPracticeLobby();
    return;
  }

  if (isPracticeLobbyOpen()) {
    closePracticeLobby();
    return;
  }

  if (isWorldLobbyOpen()) {
    closeWildLobby();
    return;
  }

  if (isDuoLobbyOpen()) {
    closeDuoLobby();
    return;
  }

  if (!document.getElementById('tier-view')?.classList.contains('hidden')) {
    navigateToStageMap();
  }
}
