// Encounter transition state — zustand store
// Bridges wildController.ts encounter start into the ink-wash transition overlay.

import { create } from 'zustand';

export interface EncounterTransitionState {
  active: boolean;
  techName: string;
  techSubtitle: string;
  rarity: string; // 'common' | 'rare' | 'legendary' | 'mythic'
  challengeMode: string; // 'standard' | 'ironman' | 'blind' | 'timed' | 'noNotes' | 'gauntlet'
  isBoss: boolean;
  isFirstEncounter: boolean;

  show: (payload: {
    techName: string;
    techSubtitle: string;
    rarity: string;
    challengeMode: string;
    isBoss: boolean;
    isFirstEncounter: boolean;
  }) => void;
  dismiss: () => void;
}

export const useEncounterTransitionStore = create<EncounterTransitionState>((set) => ({
  active: false,
  techName: '',
  techSubtitle: '',
  rarity: 'common',
  challengeMode: 'standard',
  isBoss: false,
  isFirstEncounter: false,

  show: (payload) =>
    set({
      active: true,
      techName: payload.techName,
      techSubtitle: payload.techSubtitle,
      rarity: payload.rarity,
      challengeMode: payload.challengeMode,
      isBoss: payload.isBoss,
      isFirstEncounter: payload.isFirstEncounter,
    }),

  dismiss: () => set({ active: false }),
}));
