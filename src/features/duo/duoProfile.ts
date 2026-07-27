// Duo profile — local progression, tier/mode unlock, win tracking

import { readJson, writeJson } from '../../storage/keys';
import { DUO_TIERS, DUO_MODES } from './duoTiers';

// ── Profile shape ────────────────────────────────────────────────────

export interface DuoProfile {
  /** Play counts keyed as "tierI-standard", etc. */
  playCount: Record<string, number>;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  /** Per-alias record: { alias: { wins, losses } } */
  rivals: Record<string, { wins: number; losses: number }>;
}

const PROFILE_KEY = 'sudoku_duo_profile_v2';
const RECORDED_ROOMS_KEY = 'sudoku_duo_recorded_rooms_v1';

function emptyProfile(): DuoProfile {
  return { playCount: {}, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, rivals: {} };
}

export function loadDuoProfile(): DuoProfile {
  const raw = readJson<Partial<DuoProfile>>(PROFILE_KEY, {});
  const defaults = emptyProfile();
  const finiteCount = (value: unknown): number => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  };
  const playCount =
    raw.playCount && typeof raw.playCount === 'object'
      ? Object.fromEntries(
          Object.entries(raw.playCount)
            .filter(([key]) => typeof key === 'string' && key.length > 0)
            .map(([key, value]) => [key, finiteCount(value)]),
        )
      : defaults.playCount;
  const rivals: DuoProfile['rivals'] = {};
  if (raw.rivals && typeof raw.rivals === 'object') {
    for (const [alias, record] of Object.entries(raw.rivals)) {
      if (!record || typeof record !== 'object') continue;
      rivals[alias] = {
        wins: finiteCount((record as { wins?: unknown }).wins),
        losses: finiteCount((record as { losses?: unknown }).losses),
      };
    }
  }
  return {
    playCount,
    wins: finiteCount(raw.wins),
    losses: finiteCount(raw.losses),
    draws: finiteCount(raw.draws),
    currentStreak: finiteCount(raw.currentStreak),
    bestStreak: finiteCount(raw.bestStreak),
    rivals,
  };
}

export function saveDuoProfile(p: DuoProfile): void {
  writeJson(PROFILE_KEY, p);
}

export function markDuoRoomResultRecorded(roundKey: string): boolean {
  if (!roundKey) return true;
  const ids = readJson<string[]>(RECORDED_ROOMS_KEY, []).filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.includes(roundKey)) return false;
  writeJson(RECORDED_ROOMS_KEY, [...ids, roundKey].slice(-100));
  return true;
}

// ── Record a match ───────────────────────────────────────────────────

function playCountKey(tierId: string, modeId: string): string {
  return `${tierId}-${modeId}`;
}

export function recordDuoMatch(
  profile: DuoProfile,
  tierId: string,
  modeId: string,
  result: 'win' | 'loss' | 'draw',
  opponentAlias: string,
): DuoProfile {
  const key = playCountKey(tierId, modeId);
  profile.playCount[key] = (profile.playCount[key] || 0) + 1;

  if (result === 'win') {
    profile.wins++;
    profile.currentStreak++;
    if (profile.currentStreak > profile.bestStreak) profile.bestStreak = profile.currentStreak;
  } else if (result === 'loss') {
    profile.losses++;
    profile.currentStreak = 0;
  } else {
    profile.draws++;
    profile.currentStreak = 0;
  }

  if (opponentAlias) {
    if (!profile.rivals[opponentAlias]) profile.rivals[opponentAlias] = { wins: 0, losses: 0 };
    if (result === 'win') profile.rivals[opponentAlias].wins++;
    else if (result === 'loss') profile.rivals[opponentAlias].losses++;
  }

  saveDuoProfile(profile);
  return profile;
}

// ── Unlock logic ─────────────────────────────────────────────────────

function totalPlaysForTier(p: DuoProfile, tierId: string): number {
  let sum = 0;
  for (const mode of DUO_MODES) {
    sum += p.playCount[playCountKey(tierId, mode.id)] || 0;
  }
  return sum;
}

function totalPlaysForMode(p: DuoProfile, modeId: string): number {
  let sum = 0;
  for (const tier of DUO_TIERS) {
    sum += p.playCount[playCountKey(tier.id, modeId)] || 0;
  }
  return sum;
}

export function getUnlockedTiers(p: DuoProfile): string[] {
  const unlocked: string[] = ['tier0']; // always unlocked
  if (totalPlaysForTier(p, 'tier0') >= 5) unlocked.push('tierI');
  if (totalPlaysForTier(p, 'tierI') >= 5) unlocked.push('tierII');
  if (totalPlaysForTier(p, 'tierII') >= 5) unlocked.push('tierIII');
  if (totalPlaysForTier(p, 'tierIII') >= 8) unlocked.push('tierIV');
  if (totalPlaysForTier(p, 'tierIV') >= 10) unlocked.push('tierV');
  return unlocked;
}

export function getUnlockedModes(p: DuoProfile): string[] {
  const unlocked: string[] = ['standard']; // always unlocked
  if (totalPlaysForMode(p, 'standard') >= 3) unlocked.push('noNotes');
  unlocked.push('chessClock'); // always unlocked for T0 entry mode
  if (totalPlaysForMode(p, 'noNotes') >= 3) unlocked.push('ironWall');
  if (totalPlaysForMode(p, 'ironWall') >= 3) unlocked.push('blindReview');
  return unlocked;
}

export interface NewUnlocks {
  newTiers: string[];
  newModes: string[];
}

export function checkNewUnlocks(before: DuoProfile, after: DuoProfile): NewUnlocks {
  const tiersBefore = new Set(getUnlockedTiers(before));
  const tiersAfter = getUnlockedTiers(after);
  const modesBefore = new Set(getUnlockedModes(before));
  const modesAfter = getUnlockedModes(after);
  return {
    newTiers: tiersAfter.filter((t) => !tiersBefore.has(t)),
    newModes: modesAfter.filter((m) => !modesBefore.has(m)),
  };
}
