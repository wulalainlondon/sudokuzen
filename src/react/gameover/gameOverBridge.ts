import { useGameOverStore, type GameOverMode, type WildSessionRef } from './gameOverStore';

export function bridgeShowGameOver(mode: GameOverMode): void {
  useGameOverStore.getState().open(mode);
}

export function bridgeSetGameOverWildSession(s: WildSessionRef | null): void {
  useGameOverStore.getState().setWildSession(s);
}

export function bridgeCloseGameOver(): void {
  useGameOverStore.getState().close();
}
