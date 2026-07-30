import { APP_VERSION } from '../config/version';
import { enforceAppVersion, registerServiceWorkerUpdateFlow } from '../pwa/swUpdate';
import { bootLegacyRuntime } from './legacyRuntime';
import { installLegacyTeachBridge } from '../features/teach/bridge/legacyTeachBridge';
import { mountReactStrangler } from '../react/mountReactStrangler';
import {
  createLegacySaveSanitizationMigration,
  createTeachSelectionMigration,
  runStorageMigrations,
} from '../shared/storage/migrations';
import { gs } from '../game/state';
import { initGame, handleInput, erase, saveGameStatus } from '../game/core';
import { selectCell } from '../game/board';
import * as replay from '../features/replay';
import { getCurrentEncounter, isWildActive, onWildComplete, getWildProfile } from '../features/wild/wildController';
import { deferMentorIntro } from '../features/wild/mentorController';
import { hydratePlayerProfileFromCloud, installPlayerCloudSyncBridge, whenFirebaseReady } from '../firebase/client';
import type { SudokuWindow } from '../facade/windowTypes';
import {
  openDuoLobby,
  closeDuoLobby,
  createDuoRoomFromLobby,
  joinDuoRoomFromLobby,
  refreshDuoLobbyRoom,
} from '../features/duo/duoLobby';
import { getDuoMetrics, resetDuoMetrics } from '../features/duo/duoMetrics';
import { isNativeApp } from '../platform/nativeApp';
import { syncJourneyHome } from '../features/journey';
import { scheduleDuoAutoResume } from '../features/duo/duoStartup';

declare global {
  interface Window {
    __pwaRuntime: {
      enforceAppVersion: (appVersion: string) => Promise<boolean>;
      registerServiceWorkerUpdateFlow: () => void;
    };
  }
}

export function bootstrapApp(): void {
  try {
    if (isNativeApp()) document.documentElement.classList.add('native-app');

    runStorageMigrations([createTeachSelectionMigration(), createLegacySaveSanitizationMigration()]);

    window.__pwaRuntime = {
      enforceAppVersion,
      registerServiceWorkerUpdateFlow,
    };

    bootLegacyRuntime(APP_VERSION);
    scheduleDuoAutoResume();
    Object.assign(window as unknown as Record<string, unknown>, {
      openDuoLobby,
      closeDuoLobby,
      createDuoRoomFromLobby,
      joinDuoRoomFromLobby,
      refreshDuoLobbyRoom,
      getDuoMetrics,
      resetDuoMetrics,
    });
    void whenFirebaseReady().then((ready) => {
      if (!ready) return;
      // Auth binding may have just marked this install as a pre-journey PWA
      // upgrade. Refresh the entry gates immediately so returning players do
      // not need to reload before their previously available modes reopen.
      syncJourneyHome();
      // IMPORTANT: hydrate MUST complete before bridge activates.
      // Otherwise the bridge pushes empty localStorage to cloud,
      // overwriting the remote profile.
      hydratePlayerProfileFromCloud().finally(() => {
        installPlayerCloudSyncBridge();
      });
    });
    mountReactStrangler();
    installLegacyTeachBridge();
  } catch (e: unknown) {
    // Show error on screen for debugging on devices without console access
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message || String(e);
    const stack = err.stack || '';
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<pre style="position:fixed;top:0;left:0;right:0;z-index:9999;background:red;color:white;padding:12px;font-size:11px;max-height:40vh;overflow:auto;">BOOT ERROR: ${msg}\n${stack}</pre>`,
    );
    console.error('bootstrapApp fatal:', e);
  }

  // Expose test hooks in dev mode for E2E (Playwright)
  if (import.meta.env.DEV) {
    (window as SudokuWindow).__e2e = {
      gs,
      initGame,
      handleInput,
      erase,
      saveGameStatus,
      selectCell,
      replay,
      getCurrentEncounter,
      isWildActive,
      onWildComplete,
      getWildProfile,
      deferMentorIntro,
    };
  }
}
