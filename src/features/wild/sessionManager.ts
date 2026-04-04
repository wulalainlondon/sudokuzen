// Session (修行輪) management — extracted from wildController.ts

import { saveWildProfile, type WildSession } from './wildState';
import { getWildProfile } from './wildController';

const SESSION_LEVEL_GATE = 21; // Lv.21+ unlocks 修行輪; below is free roam

export function getSession(): WildSession | null {
  return getWildProfile().currentSession;
}

/** Calculate streak bonus multiplier for session summary. */
export function sessionStreakMultiplier(wins: number): number {
  if (wins >= 10) return 1.5;
  if (wins >= 8) return 1.3;
  if (wins >= 5) return 1.1;
  return 1.0;
}

export async function startWorldSession(): Promise<void> {
  const profile = getWildProfile();
  if (profile.iqLevel >= SESSION_LEVEL_GATE) {
    // 修行輪: 10-round structured session
    profile.currentSession = { round: 0, wins: 0, totalExp: 0, techniques: [] };
  } else {
    // 新手村: free roam, no session structure
    profile.currentSession = null;
  }
  saveWildProfile(profile);
  // Lazy import to avoid circular dependency (wildController imports us, we import it)
  const { startWildEncounter } = await import('./wildController');
  await startWildEncounter();
}
