import { create } from 'zustand';

export type GameOverMode = 'normal' | 'practice' | 'wild';

export interface WildSessionRef {
  round: number;
  hasMore: boolean;
}

export interface GameOverState {
  visible: boolean;
  mode: GameOverMode;
  wildSession: WildSessionRef | null;

  open: (mode: GameOverMode) => void;
  close: () => void;
  setWildSession: (s: WildSessionRef | null) => void;
}

export const useGameOverStore = create<GameOverState>((set) => ({
  visible: false,
  mode: 'normal',
  wildSession: null,

  open: (mode) => set({ visible: true, mode, wildSession: null }),
  close: () => set({ visible: false }),
  setWildSession: (s) => set({ wildSession: s }),
}));
