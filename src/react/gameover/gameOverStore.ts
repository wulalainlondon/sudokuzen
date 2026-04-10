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
  techName: string;
  techSubtitle: string;
  isIronman: boolean;

  open: (mode: GameOverMode, wildInfo?: { techName?: string; techSubtitle?: string; isIronman?: boolean }) => void;
  close: () => void;
  setWildSession: (s: WildSessionRef | null) => void;
}

export const useGameOverStore = create<GameOverState>((set) => ({
  visible: false,
  mode: 'normal',
  wildSession: null,
  techName: '',
  techSubtitle: '',
  isIronman: false,

  open: (mode, wildInfo) =>
    set({
      visible: true,
      mode,
      wildSession: null,
      techName: wildInfo?.techName ?? '',
      techSubtitle: wildInfo?.techSubtitle ?? '',
      isIronman: wildInfo?.isIronman ?? false,
    }),
  close: () => set({ visible: false }),
  setWildSession: (s) => set({ wildSession: s }),
}));
