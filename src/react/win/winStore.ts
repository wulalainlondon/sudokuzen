// Win celebration state — zustand store
// Bridges legacy core.ts win flows into React-managed UI.

import { create } from 'zustand';

export type WinMode = 'normal' | 'practice' | 'wild';

export interface WildSessionInfo {
  round: number;
  wins: number;
  totalExp: number;
}

export interface WinState {
  visible: boolean;
  mode: WinMode;

  // Common
  levelName: string;
  timeSeconds: number;
  stars: number;          // 1-3 for normal/practice, 0 for wild

  // Speedrun (normal only)
  isSpeedrun: boolean;
  submissions: number;

  // Wild only
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
  firstKill: string | null;
  firstKillSub: string | null;
  beatMentor: boolean;
  mentorNote: string | null;
  wildSession: WildSessionInfo | null;

  // Leaderboard
  showLeaderboard: boolean;
  leaderboardHtml: string;

  // Replay
  showReplay: boolean;

  // Actions
  open: (payload: Partial<WinState> & { mode: WinMode }) => void;
  close: () => void;
  setLeaderboard: (html: string) => void;
  setWildSession: (session: WildSessionInfo | null) => void;
}

const INITIAL: Omit<WinState, 'open' | 'close' | 'setLeaderboard' | 'setWildSession'> = {
  visible: false,
  mode: 'normal',
  levelName: '',
  timeSeconds: 0,
  stars: 0,
  isSpeedrun: false,
  submissions: 0,
  expGained: 0,
  leveledUp: false,
  newLevel: 0,
  firstKill: null,
  firstKillSub: null,
  beatMentor: false,
  mentorNote: null,
  wildSession: null,
  showLeaderboard: false,
  leaderboardHtml: '',
  showReplay: false,
};

export const useWinStore = create<WinState>((set) => ({
  ...INITIAL,

  open: (payload) =>
    set({
      ...INITIAL,
      visible: true,
      ...payload,
    }),

  close: () => set({ visible: false }),

  setLeaderboard: (html) => set({ leaderboardHtml: html }),

  setWildSession: (session) => set({ wildSession: session }),
}));
