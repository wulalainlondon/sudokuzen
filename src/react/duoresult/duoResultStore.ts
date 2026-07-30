// Duo result modal state — zustand store
// Bridges legacy duo.ts result flows into React-managed UI.

import { create } from 'zustand';
import type { MoveRecord } from '../../game/state';

export interface DuoResultState {
  visible: boolean;
  /** Pre-rendered HTML for the result content (cards + diff + record + streak) */
  contentHtml: string;
  /** Whether the local player won (triggers confetti) */
  iWon: boolean;
  /** Whether it's a draw (triggers softer confetti) */
  isDraw: boolean;
  /** The level ID of the duo match (for "play again") */
  levelId: number | null;
  hostMoves: MoveRecord[];
  guestMoves: MoveRecord[];
  hostAlias: string;
  guestAlias: string;
  puzzle: number[];
  rematchPending: boolean;

  open: (payload: {
    contentHtml: string;
    iWon: boolean;
    isDraw: boolean;
    levelId: number | null;
    hostMoves: MoveRecord[];
    guestMoves: MoveRecord[];
    hostAlias: string;
    guestAlias: string;
    puzzle: number[];
  }) => void;
  close: () => void;
  setRematchPending: (pending: boolean) => void;
}

export const useDuoResultStore = create<DuoResultState>((set) => ({
  visible: false,
  contentHtml: '',
  iWon: false,
  isDraw: false,
  levelId: null,
  hostMoves: [],
  guestMoves: [],
  hostAlias: '',
  guestAlias: '',
  puzzle: [],
  rematchPending: false,

  open: (payload) =>
    set({
      visible: true,
      contentHtml: payload.contentHtml,
      iWon: payload.iWon,
      isDraw: payload.isDraw,
      levelId: payload.levelId,
      hostMoves: payload.hostMoves,
      guestMoves: payload.guestMoves,
      hostAlias: payload.hostAlias,
      guestAlias: payload.guestAlias,
      puzzle: payload.puzzle,
      rematchPending: false,
    }),

  close: () => set({ visible: false, rematchPending: false }),
  setRematchPending: (rematchPending) => set({ rematchPending }),
}));
