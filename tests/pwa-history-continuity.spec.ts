// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const old = {
  wins: 7,
  losses: 2,
  draws: 1,
  currentStreak: 3,
  bestStreak: 5,
  playCount: { 'tier0-standard': 12 },
  rivals: { Bob: { wins: 5, losses: 2 } },
};
const current = {
  wins: 2,
  losses: 0,
  draws: 0,
  currentStreak: 2,
  bestStreak: 2,
  playCount: { 'tier0-standard': 2 },
  legacyPlayCount: { 'tier0-standard': 12 },
  rivals: { Bob: { wins: 1, losses: 0 } },
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_APP_EDITION', 'pwa');
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());
function seed() {
  localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify(old));
  localStorage.setItem('sudoku_duo_profile_v2_pwa', JSON.stringify(current));
}

describe('PWA history continuity', () => {
  it('adds retained and already-played results exactly once across reads and reloads', async () => {
    seed();
    const before = { ...localStorage };
    let profile = await import('../src/features/duo/duoProfile');
    for (let i = 0; i < 4; i++)
      expect(profile.getLifetimeDuoProfile()).toMatchObject({
        wins: 9,
        losses: 2,
        draws: 1,
        currentStreak: 5,
        bestStreak: 5,
        playCount: { 'tier0-standard': 14 },
        rivals: { Bob: { wins: 6, losses: 2 } },
      });
    expect({ ...localStorage }).toEqual(before);
    vi.resetModules();
    profile = await import('../src/features/duo/duoProfile');
    expect(profile.getLifetimeDuoProfile().wins).toBe(9);
    expect(profile.getUnlockedTiers(profile.getLifetimeDuoProfile())).toContain('tierI');
    expect(profile.getLifetimeDuoProfile().legacyPlayCount).toBeUndefined();
  });

  it('keeps an offline first upgrade at its original totals without requiring a cloud import', async () => {
    localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify(old));
    localStorage.setItem('sudoku_player_id', 'p_original');
    const { prepareEditionMigration } = await import('../src/platform/editionMigration');
    prepareEditionMigration();
    const profile = await import('../src/features/duo/duoProfile');
    expect(profile.getLifetimeDuoProfile()).toMatchObject({
      wins: 7,
      losses: 2,
      draws: 1,
      currentStreak: 3,
      bestStreak: 5,
    });
    profile.recordDuoMatch(profile.loadDuoProfile(), 'tier0', 'standard', 'win', 'Bob');
    expect(profile.getLifetimeDuoProfile().wins).toBe(8);
    prepareEditionMigration();
    expect(profile.getLifetimeDuoProfile().wins).toBe(8);
  });

  it('continues an old winning streak, persists its peak, and keeps a subsequent loss reset', async () => {
    seed();
    const profile = await import('../src/features/duo/duoProfile');
    profile.recordDuoMatch(profile.loadDuoProfile(), 'tier0', 'standard', 'win', 'Bob');
    expect(profile.getLifetimeDuoProfile()).toMatchObject({ wins: 10, currentStreak: 6, bestStreak: 6 });
    profile.recordDuoMatch(profile.loadDuoProfile(), 'tier0', 'standard', 'loss', 'Bob');
    expect(profile.getLifetimeDuoProfile()).toMatchObject({ wins: 10, losses: 3, currentStreak: 0, bestStreak: 6 });
    vi.resetModules();
    const reloaded = await import('../src/features/duo/duoProfile');
    expect(reloaded.getLifetimeDuoProfile()).toMatchObject({ wins: 10, losses: 3, currentStreak: 0, bestStreak: 6 });
    expect(JSON.parse(localStorage.getItem('sudoku_duo_profile_v2_pwa')!)).toMatchObject({ wins: 3, losses: 1 });
    expect(JSON.parse(localStorage.getItem('sudoku_duo_profile_v2')!)).toEqual(old);
  });

  it('keeps a draw reset and picks up a later cloud baseline without multiplying it', async () => {
    seed();
    const profile = await import('../src/features/duo/duoProfile');
    profile.recordDuoMatch(profile.loadDuoProfile(), 'tier0', 'standard', 'draw', 'Bob');
    localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify({ ...old, wins: 9 }));
    for (let i = 0; i < 3; i++)
      expect(profile.getLifetimeDuoProfile()).toMatchObject({
        wins: 11,
        losses: 2,
        draws: 2,
        currentStreak: 0,
      });
  });

  it('keeps the iOS counter separate and does not double an active legacy room', async () => {
    seed();
    vi.stubEnv('VITE_APP_EDITION', 'ios');
    localStorage.setItem('sudoku_duo_profile_v2_ios', JSON.stringify(current));
    let profile = await import('../src/features/duo/duoProfile');
    expect(profile.getLifetimeDuoProfile().wins).toBe(2);
    vi.resetModules();
    vi.stubEnv('VITE_APP_EDITION', 'pwa');
    localStorage.setItem('sudoku_duo_active_room_id', 'r_old123');
    localStorage.setItem('sudoku_duo_active_role', 'host');
    profile = await import('../src/features/duo/duoProfile');
    expect(profile.getLifetimeDuoProfile().wins).toBe(7);
  });

  it('preserves better old times and replays without copying the entire old map on a new clear', async () => {
    const replay = [{ t: 1, type: 'fill', detail: 'r1c1', idx: 0, val: 1 }];
    const originals = { '-7': { time: 50, stars: 3, replayHistory: replay }, '-8': { time: 80, stars: 2 } };
    localStorage.setItem('sudoku_duo_puzzle_records_v1', JSON.stringify(originals));
    localStorage.setItem('sudoku_duo_puzzle_records_v1_pwa', JSON.stringify({ '-7': { time: 60, stars: 3 } }));
    const { readContinuingRecords } = await import('../src/platform/pwaDuoRecords');
    const { SK } = await import('../src/storage/keys');
    expect(readContinuingRecords(SK.DUO_PUZZLE_RECORDS)['-7']).toEqual(originals['-7']);
    const { gs } = await import('../src/game/state');
    const { saveProgress } = await import('../src/game/persistence');
    Object.assign(gs, { isDuoMode: true, isSpeedrunMode: false, currentLevel: { id: -7 }, errors: 0, seconds: 70 });
    saveProgress();
    expect(JSON.parse(localStorage.getItem(SK.DUO_PUZZLE_RECORDS)!)['-7'].time).toBe(60);
    gs.seconds = 40;
    saveProgress();
    expect(readContinuingRecords(SK.DUO_PUZZLE_RECORDS)['-7']).toMatchObject({ time: 40, stars: 3 });
    expect(JSON.parse(localStorage.getItem(SK.DUO_PUZZLE_RECORDS)!)).not.toHaveProperty('-8');
    expect(JSON.parse(localStorage.getItem('sudoku_duo_puzzle_records_v1')!)).toEqual(originals);
  });
});
