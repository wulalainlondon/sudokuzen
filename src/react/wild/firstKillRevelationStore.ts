// First-kill revelation state — zustand store
// Drives the ceremony overlay that plays before the win screen on first conquest.

import { create } from 'zustand';

export interface FirstKillRevelationState {
  active: boolean;
  techName: string;
  techEssence: string;
  onComplete: (() => void) | null;

  show: (techName: string, techEssence: string, onComplete: () => void) => void;
  dismiss: () => void;
}

export const useFirstKillRevelationStore = create<FirstKillRevelationState>((set) => ({
  active: false,
  techName: '',
  techEssence: '',
  onComplete: null,

  show: (techName, techEssence, onComplete) => set({ active: true, techName, techEssence, onComplete }),

  dismiss: () => set({ active: false, techEssence: '', onComplete: null }),
}));
