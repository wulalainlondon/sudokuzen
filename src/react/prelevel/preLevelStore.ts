import { create } from 'zustand';

export interface PreLevelState {
  visible: boolean;
  levelId: number | null;
  displayName: string;
  techName: string;
  techTier: string;
  bestRecord: string;
  hasRecord: boolean;
  hasReplay: boolean;
  isPractice: boolean;
  isSpeedrun: boolean;

  open: (payload: Partial<PreLevelState>) => void;
  close: () => void;
  setLeaderboard: (html: string) => void;
  leaderboardHtml: string;
}

export const usePreLevelStore = create<PreLevelState>((set) => ({
  visible: false,
  levelId: null,
  displayName: '',
  techName: '',
  techTier: '',
  bestRecord: '尚無通關紀錄',
  hasRecord: false,
  hasReplay: false,
  isPractice: false,
  isSpeedrun: false,
  leaderboardHtml: '載入中...',

  open: (payload) =>
    set({
      visible: true,
      leaderboardHtml: '載入中...',
      ...payload,
    }),

  close: () => set({ visible: false, levelId: null }),
  setLeaderboard: (html) => set({ leaderboardHtml: html }),
}));
