// Bridge: legacy duo.ts → React duoResultStore

import { useDuoResultStore } from './duoResultStore';
import type { MoveRecord } from '../../game/state';

export function bridgeOpenDuoResult(payload: {
  contentHtml: string;
  iWon: boolean;
  isDraw: boolean;
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
