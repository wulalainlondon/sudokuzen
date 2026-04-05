import { usePreLevelStore } from '../../react/prelevel/preLevelStore';
import type { PreLevelOpenPayload } from '../../entities/prelevel';

export type { PreLevelOpenPayload };

export type PreLevelCloseReason =
  | 'backdrop'
  | 'select-other'
  | 'legacy-hide'
  | 'start-level'
  | 'system'
  | string;

let _lastOpenLevelId: number | null = null;

export function openPreLevel(payload: PreLevelOpenPayload): void {
  const state = usePreLevelStore.getState();
  // Guard duplicate open requests for the same level to avoid loading/reset flicker.
  if (state.visible && state.levelId === payload.levelId) return;
  _lastOpenLevelId = payload.levelId;
  state.open(payload);
}

export function closePreLevel(_reason: PreLevelCloseReason = 'system'): void {
  const state = usePreLevelStore.getState();
  if (!state.visible) return;
  state.close();
}

export function isPreLevelOpen(): boolean {
  return usePreLevelStore.getState().visible;
}

export function setPreLevelLeaderboard(html: string): void {
  const state = usePreLevelStore.getState();
  // Ignore stale async updates after modal close.
  if (!state.visible || state.levelId !== _lastOpenLevelId) return;
  state.setLeaderboard(html);
}
