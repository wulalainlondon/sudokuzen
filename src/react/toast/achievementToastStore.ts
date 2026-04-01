// Achievement toast state — zustand store
// Bridges legacy stats.ts toast queue into React-managed UI.

import { create } from 'zustand';

export interface ToastItem {
  icon: string;
  name: string;
}

export interface AchievementToastState {
  visible: boolean;
  currentIcon: string;
  currentName: string;
  queue: ToastItem[];

  showNext: () => void;
  enqueue: (item: ToastItem) => void;
  dismiss: () => void;
}

export const useAchievementToastStore = create<AchievementToastState>((set, get) => ({
  visible: false,
  currentIcon: '',
  currentName: '',
  queue: [],

  enqueue: (item) => {
    const state = get();
    if (!state.visible) {
      // Show immediately
      set({ visible: true, currentIcon: item.icon, currentName: item.name });
    } else {
      // Queue it
      set({ queue: [...state.queue, item] });
    }
  },

  showNext: () => {
    const state = get();
    if (state.queue.length > 0) {
      const [next, ...rest] = state.queue;
      set({ visible: true, currentIcon: next.icon, currentName: next.name, queue: rest });
    }
  },

  dismiss: () => set({ visible: false }),
}));
