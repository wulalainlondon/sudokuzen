import { usePreLevelStore } from './preLevelStore';

export function bridgeOpenPreLevel(payload: {
  levelId: number;
  displayName: string;
  techName: string;
  techTier: string;
  bestRecord: string;
  hasRecord: boolean;
  hasReplay: boolean;
  isPractice: boolean;
  isSpeedrun: boolean;
}): void {
  usePreLevelStore.getState().open(payload);
}

export function bridgeClosePreLevel(): void {
  usePreLevelStore.getState().close();
}

export function bridgeSetPreLevelLeaderboard(html: string): void {
  usePreLevelStore.getState().setLeaderboard(html);
}

export function bridgeIsPreLevelOpen(): boolean {
  return usePreLevelStore.getState().visible;
}
