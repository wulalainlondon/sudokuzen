import { create } from 'zustand';
import type { MoveRecord } from '../../game/state';

export interface DuoReviewState {
  visible: boolean;
  hostMoves: MoveRecord[];
  guestMoves: MoveRecord[];
  hostAlias: string;
  guestAlias: string;
  /** Puzzle givens: 81-element array, 0 = empty cell */
  puzzle: number[];

  open: (payload: {
    hostMoves: MoveRecord[];
    guestMoves: MoveRecord[];
    hostAlias: string;
    guestAlias: string;
    puzzle: number[];
  }) => void;
  close: () => void;
}

export const useDuoReviewStore = create<DuoReviewState>((set) => ({
  visible: false,
  hostMoves: [],
  guestMoves: [],
  hostAlias: '',
  guestAlias: '',
  puzzle: [],

  open: (payload) =>
    set({
      visible: true,
      hostMoves: payload.hostMoves,
      guestMoves: payload.guestMoves,
      hostAlias: payload.hostAlias,
      guestAlias: payload.guestAlias,
      puzzle: payload.puzzle,
    }),

  close: () => set({ visible: false, hostMoves: [], guestMoves: [], puzzle: [], hostAlias: '', guestAlias: '' }),
}));
