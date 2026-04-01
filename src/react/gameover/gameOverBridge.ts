import { useGameOverStore, type GameOverMode, type WildSessionRef } from './gameOverStore';

export function bridgeShowGameOver(mode: GameOverMode, wildInfo?: { techName?: string; techSubtitle?: string; isIronman?: boolean }): void {
  useGameOverStore.getState().open(mode, wildInfo);
}

export function bridgeSetGameOverWildSession(s: WildSessionRef | null): void {
  useGameOverStore.getState().setWildSession(s);
}

export function bridgeCloseGameOver(): void {
  useGameOverStore.getState().close();
}
