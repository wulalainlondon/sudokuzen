import { beforeEach, describe, expect, it } from 'vitest';
import { useDuoResultStore } from '../src/react/duoresult/duoResultStore';

const resultPayload = {
  contentHtml: '<p>result</p>',
  iWon: true,
  isDraw: false,
  levelId: 1,
  hostMoves: [],
  guestMoves: [],
  hostAlias: 'Host',
  guestAlias: 'Guest',
  puzzle: [],
};

describe('Duo result rematch state', () => {
  beforeEach(() => {
    useDuoResultStore.getState().close();
  });

  it('locks duplicate rematch actions until the room returns or the request times out', () => {
    useDuoResultStore.getState().open(resultPayload);
    useDuoResultStore.getState().setRematchPending(true);

    expect(useDuoResultStore.getState().visible).toBe(true);
    expect(useDuoResultStore.getState().rematchPending).toBe(true);
    expect(useDuoResultStore.getState().openedAtMs).toBeGreaterThan(0);
  });

  it('clears the pending transition when the result closes or a later result opens', () => {
    useDuoResultStore.getState().open(resultPayload);
    useDuoResultStore.getState().setRematchPending(true);
    useDuoResultStore.getState().close();
    expect(useDuoResultStore.getState().rematchPending).toBe(false);

    useDuoResultStore.getState().setRematchPending(true);
    useDuoResultStore.getState().open(resultPayload);
    expect(useDuoResultStore.getState().rematchPending).toBe(false);
  });
});
