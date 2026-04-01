// Duo result modal state — zustand store
// Bridges legacy duo.ts result flows into React-managed UI.

import { create } from 'zustand';

export interface DuoResultState {
  visible: boolean;
  /** Pre-rendered HTML for the result content (cards + diff + record + streak) */
  contentHtml: string;
  /** Whether the local player won (triggers confetti) */
  iWon: boolean;
  /** Whether it's a draw (triggers softer confetti) */
  isDraw: boolean;

  open: (payload: { contentHtml: string; iWon: boolean; isDraw: boolean }) => void;
  close: () => void;
}

export const useDuoResultStore = create<DuoResultState>((set) => ({
  visible: false,
  contentHtml: '',
  iWon: false,
  isDraw: false,

  open: (payload) =>
    set({
      visible: true,
      contentHtml: payload.contentHtml,
      iWon: payload.iWon,
      isDraw: payload.isDraw,
    }),

  close: () => set({ visible: false }),
}));
