// EXP calculation, level curve, and level-up detection.

import { RARITY_MULTIPLIER, type Rarity } from './techniqueMeta';
import type { WildProfile } from './wildState';

/** Cumulative EXP needed to reach level N: 50 * N * (N+1) / 2 */
export function expForLevel(n: number): number {
  return (50 * n * (n + 1)) / 2;
}

/** Derive IQ level from total EXP. */
export function levelFromExp(totalExp: number): number {
  // Solve: 50 * n * (n+1) / 2 <= totalExp → 25n² + 25n - totalExp <= 0
  // n = (-25 + sqrt(625 + 100*totalExp)) / 50
  if (totalExp <= 0) return 1;
  const n = Math.floor((-25 + Math.sqrt(625 + 100 * totalExp)) / 50);
  return Math.max(1, n);
}

/** Calculate EXP earned for a completed encounter. */
export function calculateExp(
  baseExp: number,
  rarity: Rarity,
  seconds: number,
  errors: number,
  challengeMultiplier: number = 1.0,
): number {
  const rarityMul = RARITY_MULTIPLIER[rarity];
  // Sub-3min bonus, over-6min penalty, clamped [0.5, 2.0]
  const speedBonus = Math.min(2.0, Math.max(0.5, 1.0 + (180 - seconds) / 180));
  // Each error -15%, floor at 0.5x
  const errorPenalty = Math.max(0.5, 1.0 - errors * 0.15);
  return Math.round(baseExp * rarityMul * speedBonus * errorPenalty * challengeMultiplier);
}

/** Apply EXP gain to profile. Returns { newLevel, leveledUp, expGained }. */
export function applyExp(
  profile: WildProfile,
  expGained: number,
): { newLevel: number; leveledUp: boolean; expGained: number } {
  const oldLevel = profile.iqLevel;
  profile.totalExp += expGained;
  profile.iqLevel = levelFromExp(profile.totalExp);
  return {
    newLevel: profile.iqLevel,
    leveledUp: profile.iqLevel > oldLevel,
    expGained,
  };
}
