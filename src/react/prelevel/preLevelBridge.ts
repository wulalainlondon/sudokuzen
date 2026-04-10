import { closePreLevel, isPreLevelOpen, openPreLevel, setPreLevelLeaderboard } from '../../app/ui/uiOrchestrator';
import type { PreLevelOpenPayload } from '../../entities/prelevel';

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
