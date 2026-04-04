import {
  closePreLevel,
  isPreLevelOpen,
  openPreLevel,
  setPreLevelLeaderboard,
  type PreLevelOpenPayload,
} from '../../app/ui/uiOrchestrator';

export function bridgeOpenPreLevel(payload: PreLevelOpenPayload): void {
  openPreLevel(payload);
}

export function bridgeClosePreLevel(reason: string = 'legacy-hide'): void {
  closePreLevel(reason);
}

export function bridgeSetPreLevelLeaderboard(html: string): void {
  setPreLevelLeaderboard(html);
}

export function bridgeIsPreLevelOpen(): boolean {
  return isPreLevelOpen();
}
