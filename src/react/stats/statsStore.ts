import { create } from 'zustand';

export interface StatsState {
  visible: boolean;
  tab: 'overview' | 'learning' | 'achievement';

  open: () => void;
  close: () => void;
  setTab: (tab: 'overview' | 'learning' | 'achievement') => void;
}

export const useStatsStore = create<StatsState>((set) => ({
  visible: false,
  tab: 'overview',

  open: () => set({ visible: true, tab: 'overview' }),
  close: () => set({ visible: false }),
  setTab: (tab) => set({ tab }),
}));
