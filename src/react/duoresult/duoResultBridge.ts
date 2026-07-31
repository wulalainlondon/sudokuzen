// Bridge: legacy duo.ts → React duoResultStore

import { useDuoResultStore } from './duoResultStore';
import type { MoveRecord } from '../../game/state';
import type { DuoOutcomeTier } from '../../features/duo/duoOutcome';

export function bridgeOpenDuoResult(payload: {
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
}): void {
  useDuoResultStore.getState().open(payload);
}

export function bridgeCloseDuoResult(): void {
  useDuoResultStore.getState().close();
}

export function bridgeSetDuoRematchPending(pending: boolean): void {
  useDuoResultStore.getState().setRematchPending(pending);
}
