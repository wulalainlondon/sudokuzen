// Library overlay state — zustand store
// Bridges legacy teach-legacy.ts library flows into React-managed UI.

import { create } from 'zustand';

export interface LibraryState {
  visible: boolean;

  open: () => void;
  close: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  visible: false,

  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
