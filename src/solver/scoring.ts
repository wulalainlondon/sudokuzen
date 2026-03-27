// Replay scoring system — rewards technique mastery, penalizes guessing

import type { TechniqueName } from './types';

// ── Point values per technique tier ─────────────────────────────────
// Philosophy: basic fills are free, eliminations earn points proportional
// to technique difficulty. Guessing (undetectable steps) is penalized.

const TECHNIQUE_SCORES: Record<TechniqueName, number> = {
  // Phase 1 — fundamentals (low points, these are expected)
  naked_single: 1,
  hidden_single: 2,
  locked_candidates: 5,
  naked_pair: 8,
  hidden_pair: 8,
  naked_triple: 12,
  hidden_triple: 12,

  // Phase 2 — intermediate patterns (meaningful points)
  x_wing: 20,
  finned_x_wing: 25,
  skyscraper: 22,
  xy_wing: 24,
  xyz_wing: 28,
  w_wing: 26,
  unique_rectangle: 22,
  x_cycle_simple_coloring: 30,
  swordfish: 35,
  finned_swordfish: 40,
  remote_pairs: 28,
  two_string_kite: 24,
  empty_rectangle: 26,
  bug_plus_one: 18,
  jellyfish: 45,
  finned_jellyfish: 50,

  // Phase 3 — advanced chains & ALS (high points)
  aic: 55,
  aic_mid_chain: 60,
  grouped_aic_nice_loop: 65,
  aic_long_chain: 70,
  als_xz: 60,
  als_chain: 70,
  forcing_chain_net: 75,
  exocet_death_blossom: 90,
  xy_chain: 55,
  discontinuous_nice_loop: 65,
  cell_forcing_chain: 70,
  region_forcing_chain: 72,
  template: 50,
  als_xy: 65,
  als_w_wing: 68,
  sue_de_coq: 80,
  death_blossom: 95,
};

// Penalty for undetectable steps (likely guessing)
const GUESS_PENALTY = -15;
// Penalty for mistakes
const MISTAKE_PENALTY = -20;
// Bonus multipliers
const NO_MISTAKE_BONUS = 1.2; // 20% bonus for zero mistakes
const SPEED_BONUS_THRESHOLD = 300; // seconds — under 5 min gets speed bonus

export function getScore(technique: TechniqueName): number {
  return TECHNIQUE_SCORES[technique] ?? 0;
}

export interface ReplayScore {
  total: number;
  techniquePoints: number;
  mistakePenalty: number;
  guessPenalty: number;
  speedBonus: number;
  accuracyBonus: number;
  breakdown: { technique: TechniqueName | 'guess' | 'mistake'; count: number; points: number }[];
  grade: string; // S, A, B, C, D
}

export function computeReplayScore(
  actions: { type: string; technique?: TechniqueName | null }[],
  totalSeconds: number,
  errors: number,
): ReplayScore {
  const counts = new Map<string, { count: number; points: number }>();

  let techniquePoints = 0;
  let guessPenalty = 0;
  const mistakePenalty = errors * MISTAKE_PENALTY;

  for (const a of actions) {
    if (a.type === 'fill' || a.type === 'eliminate') {
      if (a.technique) {
        const pts = TECHNIQUE_SCORES[a.technique] ?? 0;
        techniquePoints += pts;
        const key = a.technique;
        const entry = counts.get(key) || { count: 0, points: 0 };
        entry.count++;
        entry.points += pts;
        counts.set(key, entry);
      } else if (a.type === 'fill') {
        // Undetected fill = likely guess
        guessPenalty += GUESS_PENALTY;
        const entry = counts.get('guess') || { count: 0, points: 0 };
        entry.count++;
        entry.points += GUESS_PENALTY;
        counts.set('guess', entry);
      }
    } else if (a.type === 'mistake') {
      const entry = counts.get('mistake') || { count: 0, points: 0 };
      entry.count++;
      entry.points += MISTAKE_PENALTY;
      counts.set('mistake', entry);
    }
  }

  // Bonuses
  const accuracyBonus = errors === 0 ? Math.round(techniquePoints * (NO_MISTAKE_BONUS - 1)) : 0;
  const speedBonus =
    totalSeconds < SPEED_BONUS_THRESHOLD ? Math.round((SPEED_BONUS_THRESHOLD - totalSeconds) * 0.5) : 0;

  const total = Math.max(0, techniquePoints + mistakePenalty + guessPenalty + accuracyBonus + speedBonus);

  // Grade
  let grade = 'D';
  if (total >= 500) grade = 'S';
  else if (total >= 300) grade = 'A';
  else if (total >= 150) grade = 'B';
  else if (total >= 50) grade = 'C';

  const breakdown = [...counts.entries()]
    .map(([key, val]) => ({
      technique: key as TechniqueName | 'guess' | 'mistake',
      count: val.count,
      points: val.points,
    }))
    .sort((a, b) => b.points - a.points);

  return { total, techniquePoints, mistakePenalty, guessPenalty, speedBonus, accuracyBonus, breakdown, grade };
}
