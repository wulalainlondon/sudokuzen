// EXP calculation, level curve, and level-up detection.

import { RARITY_MULTIPLIER, TECHNIQUE_TABLE, type Rarity } from './techniqueMeta';
import type { WildProfile } from './wildState';

/** Cumulative EXP needed to reach level N.
 * P2b: Steeper early curve (25 * N * (N+1) / 2) so Lv.1-20 feels less instant.
 * Old: ~2 rounds per level at Lv.5. New: ~3 rounds per level at Lv.5. */
export function expForLevel(n: number): number {
  return Math.floor(25 * n * (n + 1) / 2);
}

/** Derive IQ level from total EXP. */
export function levelFromExp(totalExp: number): number {
  // Solve: 25 * n * (n+1) / 2 <= totalExp → 12.5n² + 12.5n - totalExp <= 0
  // n = (-12.5 + sqrt(156.25 + 50*totalExp)) / 25
  if (totalExp <= 0) return 1;
  const n = Math.floor((-12.5 + Math.sqrt(156.25 + 50 * totalExp)) / 25);
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

/** Check which basic skills are still unlearned for the Lv.20 gate. */
export function getUnstudiedGateSkills(profile: WildProfile): string[] {
  const requiredSkills = TECHNIQUE_TABLE.filter(t => t.fragmentsRequired > 0).map(t => t.key);
  const studied = profile.studiedSkills || [];
  return requiredSkills.filter(k => !studied.includes(k));
}

/** Apply EXP gain to profile. Returns { newLevel, leveledUp, expGained, gated }. */
export function applyExp(
  profile: WildProfile,
  expGained: number,
): { newLevel: number; leveledUp: boolean; expGained: number; gated: boolean } {
  const oldLevel = profile.iqLevel;
  profile.totalExp += expGained;
  let newLevel = levelFromExp(profile.totalExp);
  let gated = false;

  // Gate: can't pass Lv.20 without all basic skills studied
  if (newLevel >= 21 && profile.iqLevel < 21) {
    const unstudied = getUnstudiedGateSkills(profile);
    if (unstudied.length > 0) {
      newLevel = 20;
      gated = true;
      // Cap totalExp at Lv.20 threshold to prevent EXP/level desync
      const lv20Threshold = expForLevel(20);
      if (profile.totalExp > lv20Threshold) {
        profile.totalExp = lv20Threshold;
      }
    }
  }

  profile.iqLevel = newLevel;
  return {
    newLevel: profile.iqLevel,
    leveledUp: profile.iqLevel > oldLevel,
    expGained,
    gated,
  };
}
