// Bridge: legacy core.ts win flows → React winStore
// Replaces showWinCelebration / showPracticeWinCelebration / showWildWinCelebration

import { useWinStore } from './winStore';
import type { WinMode, WildSessionInfo } from './winStore';

export function bridgeShowWin(payload: {
  mode: WinMode;
  levelName: string;
  timeSeconds: number;
  stars?: number;
  isSpeedrun?: boolean;
  submissions?: number;
  showLeaderboard?: boolean;
  showReplay?: boolean;
}): void {
  useWinStore.getState().open({
    mode: payload.mode,
    levelName: payload.levelName,
    timeSeconds: payload.timeSeconds,
    stars: payload.stars ?? 0,
    isSpeedrun: payload.isSpeedrun ?? false,
    submissions: payload.submissions ?? 0,
    showLeaderboard: payload.showLeaderboard ?? false,
    showReplay: payload.showReplay ?? true,
  });
}

export function bridgeShowWildWin(payload: {
  levelName: string;
  timeSeconds: number;
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
  firstKill?: string | null;
  firstKillSub?: string | null;
  beatMentor?: boolean;
}): void {
  useWinStore.getState().open({
    mode: 'wild',
    levelName: payload.levelName,
    timeSeconds: payload.timeSeconds,
    expGained: payload.expGained,
    leveledUp: payload.leveledUp,
    newLevel: payload.newLevel,
    firstKill: payload.firstKill ?? null,
    firstKillSub: payload.firstKillSub ?? null,
    beatMentor: payload.beatMentor ?? false,
    showLeaderboard: false,
    showReplay: false,
  });
}

export function bridgeSetWildSession(session: WildSessionInfo | null): void {
  useWinStore.getState().setWildSession(session);
}

export function bridgeSetLeaderboard(html: string): void {
  useWinStore.getState().setLeaderboard(html);
}

export function bridgeCloseWin(): void {
  useWinStore.getState().close();
}
