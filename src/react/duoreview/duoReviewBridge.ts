import { useDuoReviewStore } from './duoReviewStore';
import type { MoveRecord } from '../../game/state';

export function bridgeOpenDuoReview(payload: {
  hostMoves: MoveRecord[];
  guestMoves: MoveRecord[];
  hostAlias: string;
  guestAlias: string;
  puzzle: number[];
}): void {
  useDuoReviewStore.getState().open(payload);
}

export function bridgeCloseDuoReview(): void {
  useDuoReviewStore.getState().close();
}
