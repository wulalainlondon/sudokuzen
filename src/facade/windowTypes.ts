// Typed window extensions for React→legacy bridge calls
export interface SudokuWindow extends Window {
  showLevelScreen?: (returnToTier?: boolean) => void;
  openReplayModal?: () => void;
  closeReplayModal?: () => void;
  closeDuoResult?: () => void;
  surrenderDuo?: () => void;
  openLibraryOverlay?: () => void;
  closeLibraryOverlay?: () => void;
  dismissMentor?: () => void;
  resetGame?: () => void;
  continueWild?: () => void;
  exitWild?: () => void;
  showTeachModal?: (stars: number | string, source?: string) => void;
  startPoolRandom?: () => Promise<void>;
  toggleDuoReady?: () => void;
  openDuoLobby?: () => void;
  closeDuoLobby?: () => void;
  createDuoRoomFromLobby?: () => void;
  joinDuoRoomFromLobby?: () => void;
  refreshDuoLobbyRoom?: () => void;
  leaveDuoRoom?: () => void;
  copyDuoRoomId?: () => void;
  getDuoMetrics?: () => Record<string, number>;
  resetDuoMetrics?: () => void;
  // Firebase
  firebase?: unknown;
  SUDOKU_FIREBASE_CONFIG?: Record<string, string>;
  // E2E test hooks
  __e2e?: Record<string, unknown>;
  __pwaRuntime: { enforceAppVersion: (v: string) => Promise<boolean>; registerServiceWorkerUpdateFlow: () => void };
  __reactTeachBridge?: {
    openTeach: (stars: string | number, source?: string) => Promise<boolean>;
    closeTeach: () => void;
  };
  __SUDOKU_HOST_BRIDGE?: {
    name: string;
    version?: string;
    setup?: (api: unknown) => void | Promise<void>;
    onBootReady?: (ctx: { appVersion: string; apiVersion: '1' }) => void;
    onBeforeUnload?: () => void;
  };
  __SUDOKU_HOST_API?: unknown;
  // Audio
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
