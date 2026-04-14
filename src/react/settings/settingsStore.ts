import { create } from 'zustand';

interface SettingsState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
