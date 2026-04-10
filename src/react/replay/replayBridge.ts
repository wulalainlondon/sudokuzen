// Bridge: legacy replay.ts → React replay store

import { useReplayStore, type ReplayDiagnosis, type ReplayFilter } from './replayStore';

export function bridgeOpenReplay(): void {
  useReplayStore.getState().open();
}

export function bridgeCloseReplay(): void {
  useReplayStore.getState().close();
}

export function bridgeIsReplayOpen(): boolean {
  return useReplayStore.getState().visible;
}

export function bridgeSetReplayFilter(filter: ReplayFilter): void {
  useReplayStore.getState().setFilter(filter);
}

export function bridgeSetReplaySummary(text: string): void {
  useReplayStore.getState().setSummary(text);
}

export function bridgeSetReplayListHtml(html: string): void {
  useReplayStore.getState().setListHtml(html);
}

export function bridgeSetReplayDiagnosis(diagnosis: ReplayDiagnosis | null): void {
  useReplayStore.getState().setDiagnosis(diagnosis);
}

export function bridgeSetReplayPlayback(
  partial: Parameters<ReturnType<typeof useReplayStore.getState>['setPlaybackState']>[0],
): void {
  useReplayStore.getState().setPlaybackState(partial);
}
