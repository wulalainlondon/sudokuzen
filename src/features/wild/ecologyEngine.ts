// Ecology engine — selects encounters based on IQ level, cooldowns, and spawn rates.

import { TECHNIQUE_TABLE, type TechniqueMeta } from './techniqueMeta';
import type { WildProfile, WildEncounter, ChallengeMode } from './wildState';

// Techniques with implemented skill detectors. Only these can spawn in wild mode.
// Update this set as new detectors are added.
const IMPLEMENTED_SKILLS = new Set([
  'naked_single', 'hidden_single',
  'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple',
  'x_wing', 'swordfish', 'jellyfish',
  'xy_wing', 'xyz_wing', 'w_wing',
  'unique_rectangle', 'remote_pairs',
  'skyscraper', 'two_string_kite', 'empty_rectangle', 'finned_x_wing', 'bug_plus_one',
]);

// ── Puzzle JSON cache ────────────────────────────────────────────────

interface GeneratedPuzzle {
  puzzle: number[];
  solution: number[];
  difficulty_score: number;
  max_technique: string;
  counts: Record<string, number>;
  clue_count: number;
}

const puzzleCache = new Map<string, GeneratedPuzzle[]>();

async function loadTechniquePuzzles(key: string): Promise<GeneratedPuzzle[]> {
  if (puzzleCache.has(key)) return puzzleCache.get(key)!;
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const resp = await fetch(`${base}generated/${key}.json`);
  if (!resp.ok) throw new Error(`Failed to load puzzles for ${key}: ${resp.status}`);
  const data: GeneratedPuzzle[] = await resp.json();
  puzzleCache.set(key, data);
  return data;
}

// ── Pool filtering ───────────────────────────────────────────────────

/** Get techniques unlocked at the given IQ level, excluding those on cooldown and unimplemented skills. */
function getAvailablePool(profile: WildProfile): TechniqueMeta[] {
  return TECHNIQUE_TABLE.filter((t) => {
    if (!IMPLEMENTED_SKILLS.has(t.key)) return false;
    if (t.levelGate > profile.iqLevel) return false;
    const cd = profile.cooldowns[t.key] ?? 0;
    if (cd > 0) return false;
    return true;
  });
}

// ── Two-step tier-based weighted selection ───────────────────────────

/** Probability of rolling each tier [0..4]. Tunable. */
export const TIER_PROBABILITIES: readonly number[] = [0.60, 0.20, 0.12, 0.06, 0.02];

function tieredPick(pool: TechniqueMeta[]): TechniqueMeta {
  // Step 1: Group available pool by tier
  const byTier = new Map<number, TechniqueMeta[]>();
  for (const t of pool) {
    const arr = byTier.get(t.tier) ?? [];
    arr.push(t);
    byTier.set(t.tier, arr);
  }

  // Step 2: Roll tier using probabilities
  const roll = Math.random();
  let cumulative = 0;
  let rolledTier = 0;
  for (let i = 0; i < TIER_PROBABILITIES.length; i++) {
    cumulative += TIER_PROBABILITIES[i];
    if (roll < cumulative) {
      rolledTier = i;
      break;
    }
  }

  // Step 3: If rolled tier has no available techniques, fall to next lower tier
  let chosen = byTier.get(rolledTier);
  if (!chosen || chosen.length === 0) {
    for (let t = rolledTier - 1; t >= 0; t--) {
      chosen = byTier.get(t);
      if (chosen && chosen.length > 0) break;
    }
  }
  // Final fallback: pick any from pool
  if (!chosen || chosen.length === 0) chosen = pool;

  // Step 4: Uniform random pick within the tier
  return chosen[Math.floor(Math.random() * chosen.length)];
}

// ── Challenge mode selection ─────────────────────────────────────────

/** Per-tier mode weights: [standard, ironman, blind, timed, noNotes]. Gauntlet is special-cased. */
const MODE_WEIGHTS: Record<number, Record<ChallengeMode, number>> = {
  0: { standard: 0.70, ironman: 0.05, blind: 0.08, timed: 0.10, noNotes: 0.07, gauntlet: 0 },
  1: { standard: 0.55, ironman: 0.10, blind: 0.10, timed: 0.13, noNotes: 0.12, gauntlet: 0 },
  2: { standard: 0.45, ironman: 0.15, blind: 0.12, timed: 0.15, noNotes: 0.13, gauntlet: 0 },
  3: { standard: 0.40, ironman: 0.18, blind: 0.12, timed: 0.15, noNotes: 0.15, gauntlet: 0 },
  4: { standard: 0.35, ironman: 0.20, blind: 0.15, timed: 0.15, noNotes: 0.15, gauntlet: 0 },
};

export function selectChallengeMode(tier: number, profile: WildProfile): ChallengeMode {
  // Every 50th encounter triggers gauntlet
  if (profile.totalEncounters > 0 && profile.totalEncounters % 50 === 0) return 'gauntlet';

  const weights = MODE_WEIGHTS[tier] ?? MODE_WEIGHTS[0];
  const roll = Math.random();
  let cumulative = 0;
  for (const [mode, w] of Object.entries(weights) as [ChallengeMode, number][]) {
    if (mode === 'gauntlet') continue;
    cumulative += w;
    if (roll < cumulative) return mode;
  }
  return 'standard';
}

// ── Session-aware encounter selection ────────────────────────────────

/** Select an encounter constrained by session round pacing. */
export async function selectSessionEncounter(profile: WildProfile, round: number): Promise<WildEncounter> {
  // Determine max tier based on round
  let maxTier: number;
  if (round <= 3) maxTier = 1;       // warm-up
  else if (round <= 6) maxTier = 2;  // normal
  else if (round <= 9) maxTier = 3;  // challenge
  else maxTier = 4;                   // boss

  // Filter pool: implemented, unlocked, not on cooldown, tier <= maxTier
  let pool = TECHNIQUE_TABLE.filter((t) => {
    if (!IMPLEMENTED_SKILLS.has(t.key)) return false;
    if (t.levelGate > profile.iqLevel) return false;
    const cd = profile.cooldowns[t.key] ?? 0;
    if (cd > 0) return false;
    return t.tier <= maxTier;
  });

  // Fallback if pool is empty
  if (pool.length === 0) {
    pool = TECHNIQUE_TABLE.filter((t) => IMPLEMENTED_SKILLS.has(t.key) && t.levelGate <= profile.iqLevel && t.tier <= maxTier);
  }
  if (pool.length === 0) {
    pool = TECHNIQUE_TABLE.filter((t) => IMPLEMENTED_SKILLS.has(t.key) && t.levelGate <= profile.iqLevel);
  }
  if (pool.length === 0) pool = [TECHNIQUE_TABLE[0]];

  let picked: TechniqueMeta;
  if (round === 10) {
    // Boss round: pick from the highest available tier
    const highestTier = Math.max(...pool.map((t) => t.tier));
    const bossPool = pool.filter((t) => t.tier === highestTier);
    picked = bossPool[Math.floor(Math.random() * bossPool.length)];
  } else {
    // Uniform random within filtered pool
    picked = pool[Math.floor(Math.random() * pool.length)];
  }

  // Boss round forces ironman; others use normal challenge mode selection
  const mode: ChallengeMode = round === 10 ? 'ironman' : selectChallengeMode(picked.tier, profile);
  return buildEncounter(picked, mode);
}

// ── Public API ───────────────────────────────────────────────────────

/** Select and load an encounter for the given profile. */
export async function selectEncounter(profile: WildProfile): Promise<WildEncounter> {
  const pool = getAvailablePool(profile);
  let picked: TechniqueMeta;
  if (pool.length === 0) {
    // Fallback: all on cooldown — pick from implemented basics ignoring cooldown
    const basics = TECHNIQUE_TABLE.filter((t) => IMPLEMENTED_SKILLS.has(t.key) && t.levelGate <= profile.iqLevel);
    picked = basics.length > 0 ? tieredPick(basics) : TECHNIQUE_TABLE[0];
  } else {
    picked = tieredPick(pool);
  }
  const mode = selectChallengeMode(picked.tier, profile);
  return buildEncounter(picked, mode);
}

async function buildEncounter(meta: TechniqueMeta, challengeMode: ChallengeMode): Promise<WildEncounter> {
  const puzzles = await loadTechniquePuzzles(meta.key);
  const idx = Math.floor(Math.random() * puzzles.length);
  const p = puzzles[idx];
  return {
    technique: meta.key,
    rarity: meta.rarity,
    difficultyWeight: meta.weight,
    puzzle: p.puzzle,
    solution: p.solution,
    startedAt: Date.now(),
    challengeMode,
  };
}

/** Decrement all cooldowns by 1 (called after each completed puzzle). */
export function tickCooldowns(profile: WildProfile): void {
  for (const key of Object.keys(profile.cooldowns)) {
    profile.cooldowns[key]--;
    if (profile.cooldowns[key] <= 0) delete profile.cooldowns[key];
  }
}

/** Set escape cooldown for a technique. */
export function setEscapeCooldown(profile: WildProfile, techniqueKey: string): void {
  const meta = TECHNIQUE_TABLE.find((t) => t.key === techniqueKey);
  if (meta && meta.cooldown > 0) {
    profile.cooldowns[techniqueKey] = meta.cooldown;
  }
}
