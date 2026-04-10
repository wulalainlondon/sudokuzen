// Bridge: winDetection.ts → firstKillRevelationStore
// Called from the legacy win flow to trigger the ceremony overlay.

import { useFirstKillRevelationStore } from './firstKillRevelationStore';

export function bridgeShowFirstKillRevelation(techName: string, techEssence: string, onComplete: () => void): void {
  useFirstKillRevelationStore.getState().show(techName, techEssence, onComplete);
}
