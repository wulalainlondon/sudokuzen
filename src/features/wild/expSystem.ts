// EXP calculation, level curve, and level-up detection.

import { RARITY_MULTIPLIER, TECHNIQUE_TABLE, type Rarity } from './techniqueMeta';
import type { WildProfile } from './wildState';

/** Cumulative EXP needed to reach level N: 15 * N * (N+1) / 2 */
export function expForLevel(n: number): number {
  return Math.floor(15 * n * (n + 1) / 2);
}

/** Derive IQ level from total EXP. */
export function levelFromExp(totalExp: number): number {
  // Solve: 15 * n * (n+1) / 2 <= totalExp → 7.5n² + 7.5n - totalExp <= 0
  // n = (-7.5 + sqrt(56.25 + 30*totalExp)) / 15
  if (totalExp <= 0) return 1;
  const n = Math.floor((-7.5 + Math.sqrt(56.25 + 30 * totalExp)) / 15);
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
  let newLevel = levelFromExp(profile.totalExp);

  // Gate: can't pass Lv.20 without all basic skills studied
  if (newLevel >= 21 && profile.iqLevel < 21) {
    const requiredSkills = TECHNIQUE_TABLE.filter(t => t.fragmentsRequired > 0).map(t => t.key);
    const studied = profile.studiedSkills || [];
    const allStudied = requiredSkills.every(k => studied.includes(k));
    if (!allStudied) {
      newLevel = 20;
    }
  }

  profile.iqLevel = newLevel;
  return {
    newLevel: profile.iqLevel,
    leveledUp: profile.iqLevel > oldLevel,
    expGained,
  };
}
