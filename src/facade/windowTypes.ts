// Typed window extensions for React→legacy bridge calls
export interface SudokuWindow extends Window {
  showLevelScreen?: (returnToTier?: boolean) => void;
  openReplayModal?: () => void;
  closeReplayModal?: () => void;
  closeDuoResult?: () => void;
  closeLibraryOverlay?: () => void;
  dismissMentor?: () => void;
  resetGame?: () => void;
  continueWild?: () => void;
  exitWild?: () => void;
  showTeachModal?: (stars: number | string, source?: string) => void;
  startPoolRandom?: () => Promise<void>;
  toggleDuoReady?: () => void;
  // Firebase
  firebase?: unknown;
  SUDOKU_FIREBASE_CONFIG?: Record<string, string>;
  // E2E test hooks
  __e2e?: Record<string, unknown>;
  __pwaRuntime: { enforceAppVersion: (v: string) => Promise<boolean>; registerServiceWorkerUpdateFlow: () => void };
  __reactTeachBridge?: { openTeach: (stars: string | number, source?: string) => Promise<boolean>; closeTeach: () => void };
  // Audio
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
