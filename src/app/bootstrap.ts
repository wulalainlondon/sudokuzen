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
import { hydratePlayerProfileFromCloud, installPlayerCloudSyncBridge } from '../firebase/client';

declare global {
  interface Window {
    __pwaRuntime: {
      enforceAppVersion: (appVersion: string) => Promise<boolean>;
      registerServiceWorkerUpdateFlow: () => void;
    };
  }
}

export function bootstrapApp(): void {
  runStorageMigrations([createTeachSelectionMigration(), createLegacySaveSanitizationMigration()]);

  window.__pwaRuntime = {
    enforceAppVersion,
    registerServiceWorkerUpdateFlow,
  };

  bootLegacyRuntime(APP_VERSION);
  if (gs.firebaseReady) {
    installPlayerCloudSyncBridge();
    void hydratePlayerProfileFromCloud();
  }
  mountReactStrangler();
  installLegacyTeachBridge();

  // Expose test hooks in dev mode for E2E (Playwright)
  if (import.meta.env.DEV) {
    (window as any).__e2e = { gs, initGame, handleInput, erase, saveGameStatus, selectCell, replay };
  }
}
