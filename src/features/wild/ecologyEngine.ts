// Ecology engine — selects encounters based on IQ level, cooldowns, and spawn rates.

import { TECHNIQUE_TABLE, type TechniqueMeta } from './techniqueMeta';
import type { WildProfile, WildEncounter, ChallengeMode } from './wildState';

// Techniques with implemented skill detectors. Only these can spawn in wild mode.
// Update this set as new detectors are added.
const IMPLEMENTED_SKILLS = new Set([
  'naked_single',
  'hidden_single',
  'locked_candidates',
  'naked_pair',
  'hidden_pair',
  'naked_triple',
  'hidden_triple',
  'x_wing',
  'swordfish',
  'jellyfish',
  'xy_wing',
  'xyz_wing',
  'w_wing',
  'unique_rectangle',
  'remote_pairs',
  'skyscraper',
  'two_string_kite',
  'empty_rectangle',
  'finned_x_wing',
  'bug_plus_one',
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
  const base = import.meta.env.BASE_URL ?? '/';
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

// ── Newbie zone (Lv.1-20) weighted pick ──────────────────────────────

/** Smooth weight curve for newbie techniques: rise → peak → fade. */
function newbieWeight(gate: number, level: number): number {
  if (level < gate) return 0;
  const age = level - gate;
  if (age <= 2) return 0.3 + age * 0.35; // ramp up: 0.3, 0.65, 1.0
  if (age <= 4) return 1.0; // peak holds
  return Math.max(0.3, 1.0 - (age - 4) * 0.1); // gradual fade, min 0.3
}

/** Weighted pick for newbie zone (Lv.1-20). Each technique has a smooth probability curve. */
function newbiePick(pool: TechniqueMeta[], iqLevel: number): TechniqueMeta {
  if (pool.length === 0) return TECHNIQUE_TABLE[0]; // safety fallback
  const weights = pool.map((t) => newbieWeight(t.levelGate, iqLevel));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];

  const roll = Math.random() * total;
  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return pool[i];
  }
  return pool[pool.length - 1];
}

// ── Two-step tier-based weighted selection ───────────────────────────

/** Base tier probabilities. T0=singles, T4=mythic. */
const BASE_TIER_PROBS: Record<number, number> = { 0: 0.45, 1: 0.25, 2: 0.18, 3: 0.09, 4: 0.03 };
const TIER_GATES: Record<number, number> = { 0: 1, 1: 1, 2: 21, 3: 41, 4: 71 };

/** Calculate level-adjusted tier probabilities. Higher level = less T0, more high tiers. */
function getAdjustedTierProbs(iqLevel: number): Map<number, number> {
  const adjusted = new Map<number, number>();

  for (const [tier, base] of Object.entries(BASE_TIER_PROBS)) {
    const t = Number(tier);
    const gate = TIER_GATES[t] ?? 1;

    if (iqLevel < gate) {
      adjusted.set(t, 0);
      continue;
    }

    const overflow = Math.max(0, iqLevel - gate);
    if (t === 0) {
      // P1b: T0 decays more aggressively — veterans should see more diverse content
      const decay = Math.max(0.1, 1 - iqLevel / 80);
      adjusted.set(t, base * decay);
    } else {
      // P1b: Higher tiers scale more per overflow — ensures Phase 2+ appear regularly
      const bonus = 1 + Math.floor(overflow / 8) * 0.6;
      adjusted.set(t, base * bonus);
    }
  }

  // Normalize
  let total = 0;
  for (const v of adjusted.values()) total += v;
  if (total > 0) {
    for (const [k, v] of adjusted) adjusted.set(k, v / total);
  }

  return adjusted;
}

function tieredPick(pool: TechniqueMeta[], iqLevel: number): TechniqueMeta {
  // Step 1: Group available pool by tier
  const byTier = new Map<number, TechniqueMeta[]>();
  for (const t of pool) {
    const arr = byTier.get(t.tier) ?? [];
    arr.push(t);
    byTier.set(t.tier, arr);
  }

  // Step 2: Get level-adjusted tier probabilities
  const probs = getAdjustedTierProbs(iqLevel);

  // Step 3: Roll tier using adjusted probabilities (only tiers that have available techniques)
  const roll = Math.random();
  let cumulative = 0;
  let rolledTier = 0;
  for (let i = 0; i < 5; i++) {
    if (!byTier.has(i) || (byTier.get(i)?.length ?? 0) === 0) continue;
    cumulative += probs.get(i) ?? 0;
    if (roll < cumulative) {
      rolledTier = i;
      break;
    }
    rolledTier = i; // fallback to last available tier
  }

  // Step 4: If rolled tier has no available techniques, fall to next lower tier
  let chosen = byTier.get(rolledTier);
  if (!chosen || chosen.length === 0) {
    for (let t = rolledTier - 1; t >= 0; t--) {
      chosen = byTier.get(t);
      if (chosen && chosen.length > 0) break;
    }
  }
  // Final fallback: pick any from pool
  if (!chosen || chosen.length === 0) chosen = pool;

  // Step 5: Uniform random pick within the tier
  return chosen[Math.floor(Math.random() * chosen.length)];
}

// ── Challenge mode selection ─────────────────────────────────────────

/** Per-tier mode weights. P3: Enable timed mode at T1+ for variety. */
const MODE_WEIGHTS: Record<number, Record<ChallengeMode, number>> = {
  0: { standard: 0.8, ironman: 0.05, blind: 0.08, timed: 0.02, noNotes: 0.05, gauntlet: 0 },
  1: { standard: 0.6, ironman: 0.1, blind: 0.1, timed: 0.08, noNotes: 0.12, gauntlet: 0 },
  2: { standard: 0.48, ironman: 0.14, blind: 0.12, timed: 0.1, noNotes: 0.16, gauntlet: 0 },
  3: { standard: 0.4, ironman: 0.17, blind: 0.13, timed: 0.12, noNotes: 0.18, gauntlet: 0 },
  4: { standard: 0.35, ironman: 0.2, blind: 0.14, timed: 0.12, noNotes: 0.19, gauntlet: 0 },
};

export function selectChallengeMode(tier: number, _profile: WildProfile): ChallengeMode {
  const weights = MODE_WEIGHTS[tier] ?? MODE_WEIGHTS[0];
  const roll = Math.random();
  let cumulative = 0;
  for (const [mode, w] of Object.entries(weights) as [ChallengeMode, number][]) {
    if (w <= 0) continue;
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
  if (round <= 3)
    maxTier = 1; // warm-up
  else if (round <= 6)
    maxTier = 2; // normal
  else if (round <= 9)
    maxTier = 3; // challenge
  else maxTier = 4; // boss

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
    pool = TECHNIQUE_TABLE.filter(
      (t) => IMPLEMENTED_SKILLS.has(t.key) && t.levelGate <= profile.iqLevel && t.tier <= maxTier,
    );
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
    // Tier-weighted pick scaled by player level
    picked = tieredPick(pool, profile.iqLevel);
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

  // First ever encounter: force naked_single
  if (profile.totalEncounters === 0) {
    picked = TECHNIQUE_TABLE.find((t) => t.key === 'naked_single') ?? TECHNIQUE_TABLE[0];
  } else if (pool.length === 0) {
    // Fallback: all on cooldown — pick from implemented basics ignoring cooldown
    const basics = TECHNIQUE_TABLE.filter((t) => IMPLEMENTED_SKILLS.has(t.key) && t.levelGate <= profile.iqLevel);
    picked = basics.length > 0 ? tieredPick(basics, profile.iqLevel) : TECHNIQUE_TABLE[0];
  } else if (profile.iqLevel < 21) {
    // Newbie zone: smooth weighted pick per technique
    picked = newbiePick(pool, profile.iqLevel);
  } else {
    // Lv.21+: tier-weighted pick scaled by player level
    picked = tieredPick(pool, profile.iqLevel);
  }
  const mode = selectChallengeMode(picked.tier, profile);
  return buildEncounter(picked, mode);
}

// P2a: Dynamic rarity roll — each encounter can upgrade from base rarity
function rollRarity(baseRarity: import('./techniqueMeta').Rarity): import('./techniqueMeta').Rarity {
  const roll = Math.random();
  // Chance to upgrade rarity (regardless of base):
  //   rare: 12%, legendary: 3%, mythic: 0.5%
  if (roll < 0.005) return 'mythic';
  if (roll < 0.035) return 'legendary';
  if (roll < 0.155) return 'rare';
  return baseRarity;
}

async function buildEncounter(meta: TechniqueMeta, challengeMode: ChallengeMode): Promise<WildEncounter> {
  const puzzles = await loadTechniquePuzzles(meta.key);
  const idx = Math.floor(Math.random() * puzzles.length);
  const p = puzzles[idx];
  // 弈塵's estimated solve time based on difficulty and tier
  // He's an expert at T0-T3 but can't solve T4
  let mentorTime = 0;
  if (meta.tier <= 3) {
    const diffScore = p.difficulty_score || 50;
    // T0: very fast, T1: fast, T2: moderate, T3: slow but capable
    const tierMultiplier = [1.0, 1.3, 1.8, 2.5][meta.tier] ?? 2.0;
    mentorTime = Math.round(diffScore * tierMultiplier);
    // Add slight random variance (±15%) so he's not perfectly predictable
    mentorTime = Math.round(mentorTime * (0.85 + Math.random() * 0.3));
  }

  // P2a: Roll rarity — even common techniques have a small chance to be rare+
  const rarity = rollRarity(meta.rarity);

  return {
    technique: meta.key,
    rarity,
    difficultyWeight: meta.weight,
    puzzle: p.puzzle,
    solution: p.solution,
    startedAt: Date.now(),
    challengeMode,
    mentorTime,
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
