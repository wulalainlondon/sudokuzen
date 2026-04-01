// Bridge: legacy duo.ts → React duoResultStore

import { useDuoResultStore } from './duoResultStore';

export function bridgeOpenDuoResult(payload: {
  contentHtml: string;
  iWon: boolean;
  isDraw: boolean;
  levelId: number | null;
}): void {
  useDuoResultStore.getState().open(payload);
}

export function bridgeCloseDuoResult(): void {
  useDuoResultStore.getState().close();
}
