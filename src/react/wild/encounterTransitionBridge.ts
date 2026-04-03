// Bridge: wildController.ts -> React encounter transition overlay

import { useEncounterTransitionStore } from './encounterTransitionStore';

export function bridgeShowEncounterTransition(payload: {
  techName: string;
  techSubtitle: string;
  rarity: string;
  challengeMode: string;
  isBoss: boolean;
  isFirstEncounter: boolean;
  rarityTone?: string;
  isResume?: boolean;
}): void {
  useEncounterTransitionStore.getState().show(payload);
}

export function bridgeDismissEncounterTransition(): void {
  useEncounterTransitionStore.getState().dismiss();
}
