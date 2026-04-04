import type { ActionRecord } from '../game/state';

export interface HostBridgeApi {
  readonly apiVersion: '1';
  readonly appVersion: string;
  showLevelScreen: (returnToTier?: boolean) => void;
  startLevelFromModal: (
    forceReset?: boolean,
    playWithGhost?: boolean,
    ghostData?: ActionRecord[] | null,
  ) => Promise<void>;
  pauseGame: () => void;
  resumeGame: () => void;
  toggleSpeedrunMode: () => void;
  openReplayModal: () => void;
  closeReplayModal: () => void;
  openWildLobby: () => void;
  closeWildLobby: () => void;
  startWorldSession: () => Promise<void>;
  continueWild: () => Promise<void>;
  exitWild: () => void;
}

export interface SudokuHostBridge {
  readonly name: string;
  readonly version?: string;
  setup?: (api: HostBridgeApi) => void | Promise<void>;
  onBootReady?: (ctx: { appVersion: string; apiVersion: HostBridgeApi['apiVersion'] }) => void;
  onBeforeUnload?: () => void;
}

let activeBridge: SudokuHostBridge | null = null;

export async function installHostBridge(api: HostBridgeApi): Promise<void> {
  (window as Window & { __SUDOKU_HOST_API?: HostBridgeApi }).__SUDOKU_HOST_API = api;
  const bridge = (window as Window & { __SUDOKU_HOST_BRIDGE?: SudokuHostBridge }).__SUDOKU_HOST_BRIDGE;
  if (!bridge) return;
  activeBridge = bridge;

  try {
    await bridge.setup?.(api);
  } catch (e) {
    console.error('[HostBridge] setup failed:', e);
  }
}

export function notifyHostBootReady(appVersion: string): void {
  if (!activeBridge) return;
  try {
    activeBridge.onBootReady?.({ appVersion, apiVersion: '1' });
  } catch (e) {
    console.error('[HostBridge] onBootReady failed:', e);
  }
}

export function notifyHostBeforeUnload(): void {
  if (!activeBridge) return;
  try {
    activeBridge.onBeforeUnload?.();
  } catch (e) {
    console.error('[HostBridge] onBeforeUnload failed:', e);
  }
}
