// Duo result modal state — zustand store
// Bridges legacy duo.ts result flows into React-managed UI.

import { create } from 'zustand';
import type { MoveRecord } from '../../game/state';
import type { DuoOutcomeTier } from '../../features/duo/duoOutcome';

export interface DuoResultState {
  visible: boolean;
  /** Pre-rendered HTML for the result content (cards + diff + record + streak) */
  contentHtml: string;
  /** Whether the local player won (triggers confetti) */
  iWon: boolean;
  /** Whether it's a draw (triggers softer confetti) */
  isDraw: boolean;
  /** Time-gap classification from the local player's perspective */
  outcomeTier: DuoOutcomeTier;
  /** Absolute completion-time gap; zero for draws and forfeits */
  timeDiffSec: number;
  /** Completion-time gap divided by the slower player's time */
  gapRatio: number;
  /** The level ID of the duo match (for "play again") */
  levelId: number | null;
  hostMoves: MoveRecord[];
  guestMoves: MoveRecord[];
  hostAlias: string;
  guestAlias: string;
  puzzle: number[];
  rematchPending: boolean;
  openedAtMs: number;

  open: (payload: {
    contentHtml: string;
    iWon: boolean;
    isDraw: boolean;
    outcomeTier: DuoOutcomeTier;
    timeDiffSec: number;
    gapRatio: number;
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
  outcomeTier: 'draw',
  timeDiffSec: 0,
  gapRatio: 0,
  levelId: null,
  hostMoves: [],
  guestMoves: [],
  hostAlias: '',
  guestAlias: '',
  puzzle: [],
  rematchPending: false,
  openedAtMs: 0,

  open: (payload) =>
    set({
      visible: true,
      contentHtml: payload.contentHtml,
      iWon: payload.iWon,
      isDraw: payload.isDraw,
      outcomeTier: payload.outcomeTier,
      timeDiffSec: payload.timeDiffSec,
      gapRatio: payload.gapRatio,
      levelId: payload.levelId,
      hostMoves: payload.hostMoves,
      guestMoves: payload.guestMoves,
      hostAlias: payload.hostAlias,
      guestAlias: payload.guestAlias,
      puzzle: payload.puzzle,
      rematchPending: false,
      openedAtMs: performance.now(),
    }),

  close: () => set({ visible: false, rematchPending: false }),
  setRematchPending: (rematchPending) => set({ rematchPending }),
}));
