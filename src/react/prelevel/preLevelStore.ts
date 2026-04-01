import { create } from 'zustand';
import { t } from '../../i18n/t';

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
  bestRecord: t('miscRuntime.preLevelNoRecord'),
  hasRecord: false,
  hasReplay: false,
  isPractice: false,
  isSpeedrun: false,
  leaderboardHtml: t('miscRuntime.preLevelLoading'),

  open: (payload) =>
    set({
      visible: true,
      leaderboardHtml: t('miscRuntime.preLevelLoading'),
      ...payload,
    }),

  close: () => set({ visible: false, levelId: null }),
  setLeaderboard: (html) => set({ leaderboardHtml: html }),
}));
