import { APP_VERSION } from '../config/version';
import { enforceAppVersion, registerServiceWorkerUpdateFlow } from '../pwa/swUpdate';
import { bootLegacyRuntime } from './legacyRuntime';
import { installLegacyTeachBridge } from '../features/teach/bridge/legacyTeachBridge';
import { mountReactStrangler } from '../react/mountReactStrangler';
import { createTeachSelectionMigration, runStorageMigrations } from '../shared/storage/migrations';

declare global {
  interface Window {
    __pwaRuntime: {
      enforceAppVersion: (appVersion: string) => Promise<boolean>;
      registerServiceWorkerUpdateFlow: () => void;
    };
  }
}

export function bootstrapApp(): void {
  runStorageMigrations([createTeachSelectionMigration()]);

  window.__pwaRuntime = {
    enforceAppVersion,
    registerServiceWorkerUpdateFlow,
  };

  bootLegacyRuntime(APP_VERSION);
  mountReactStrangler();
  installLegacyTeachBridge();
}
