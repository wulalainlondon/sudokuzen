// Mentor overlay state — zustand store
// Bridges legacy mentorController.ts into React-managed UI.

import { create } from 'zustand';

export interface MentorState {
  visible: boolean;
  text: string;
  subText: string;
  dismissLabelKey: string;

  open: (payload: { text: string; subText: string; dismissLabelKey?: string }) => void;
  close: () => void;
}

export const useMentorStore = create<MentorState>((set) => ({
  visible: false,
  text: '',
  subText: '',
  dismissLabelKey: 'mentor.continue',

  open: (payload) =>
    set({
      visible: true,
      text: payload.text,
      subText: payload.subText,
      dismissLabelKey: payload.dismissLabelKey ?? 'mentor.continue',
    }),

  close: () => set({ visible: false }),
}));
