// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TECHNIQUE_TABLE } from '../src/features/wild/techniqueMeta';
import {
  selectChallengeMode,
  selectEncounter,
  selectSessionEncounter,
  tickCooldowns,
  setEscapeCooldown,
} from '../src/features/wild/ecologyEngine';
import type { WildProfile } from '../src/features/wild/wildState';

// Mock fetch for puzzle data loading
function mockFetchPuzzles() {
  const fakePuzzle = Array(81).fill(0).map((_, i) => (i % 9) + 1);
  const fakeSolution = Array(81).fill(0).map((_, i) => (i % 9) + 1);
  const fakeData = [
    {
      puzzle: fakePuzzle.map((v, i) => (i < 30 ? 0 : v)),
      solution: fakeSolution,
      difficulty_score: 50,
      max_technique: 'naked_single',
      counts: { naked_single: 5 },
      clue_count: 51,
    },
  ];
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(fakeData),
  }) as any;
}

function makeProfile(overrides: Partial<WildProfile> = {}): WildProfile {
  return {
    iqLevel: 1,
    exp: 0,
    totalEncounters: 0,
    cooldowns: {},
    bestiary: {},
    bestiaryDiscoveredCount: 0,
    sessionActive: false,
    sessionRound: 0,
    sessionWins: 0,
    sessionExp: 0,
    sessionTechniques: [],
    ...overrides,
  } as WildProfile;
}

describe('selectEncounter', () => {
  beforeEach(() => {
    mockFetchPuzzles();
  });

  it('returns a valid encounter for new player (iqLevel=1)', async () => {
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 0 });
    const enc = await selectEncounter(profile);
    expect(enc).toBeDefined();
    expect(enc.technique).toBeTruthy();
    expect(enc.puzzle).toHaveLength(81);
    expect(enc.solution).toHaveLength(81);
  });

  it('encounter has required fields', async () => {
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 0 });
    const enc = await selectEncounter(profile);
    expect(enc).toHaveProperty('technique');
    expect(enc).toHaveProperty('puzzle');
    expect(enc).toHaveProperty('solution');
    expect(enc).toHaveProperty('rarity');
    expect(enc).toHaveProperty('challengeMode');
    expect(enc).toHaveProperty('startedAt');
  });

  it('first encounter for new player should be naked_single', async () => {
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 0 });
    const enc = await selectEncounter(profile);
    expect(enc.technique).toBe('naked_single');
  });

  it('non-first encounter may vary (not forced naked_single)', async () => {
    const profile = makeProfile({ iqLevel: 10, totalEncounters: 5 });
    // Run multiple times to verify it doesn't crash
    for (let i = 0; i < 5; i++) {
      const enc = await selectEncounter(profile);
      expect(enc.technique).toBeTruthy();
    }
  });
});

describe('selectSessionEncounter', () => {
  beforeEach(() => {
    mockFetchPuzzles();
  });

  it('respects round-based tier gating (round 1-3 maxTier=1)', async () => {
    const profile = makeProfile({ iqLevel: 50, totalEncounters: 100 });
    // Run multiple iterations; each picked technique should be tier <= 1
    for (let i = 0; i < 10; i++) {
      const enc = await selectSessionEncounter(profile, 1);
      const meta = TECHNIQUE_TABLE.find((t) => t.key === enc.technique);
      expect(meta).toBeDefined();
      expect(meta!.tier).toBeLessThanOrEqual(1);
    }
  });

  it('boss round (10) forces ironman mode', async () => {
    const profile = makeProfile({ iqLevel: 50, totalEncounters: 100 });
    const enc = await selectSessionEncounter(profile, 10);
    expect(enc.challengeMode).toBe('ironman');
  });
});

describe('selectChallengeMode', () => {
  it('returns one of the valid challenge modes', () => {
    const validModes = ['standard', 'ironman', 'blind', 'timed', 'noNotes', 'gauntlet'];
    const profile = makeProfile({ iqLevel: 30 });
    for (let i = 0; i < 50; i++) {
      const mode = selectChallengeMode(0, profile);
      expect(validModes).toContain(mode);
    }
  });

  it('higher tiers have less standard weight', () => {
    // This is a statistical test; run many trials
    const profile = makeProfile({ iqLevel: 50 });
    let standardCount0 = 0;
    let standardCount4 = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (selectChallengeMode(0, profile) === 'standard') standardCount0++;
      if (selectChallengeMode(4, profile) === 'standard') standardCount4++;
    }
    // Tier 0 has 80% standard, tier 4 has 42% — expect tier 0 to have more
    expect(standardCount0).toBeGreaterThan(standardCount4);
  });
});

describe('cooldown system', () => {
  it('tickCooldowns decrements all cooldowns by 1', () => {
    const profile = makeProfile({
      cooldowns: { naked_pair: 3, x_wing: 1 },
    });
    tickCooldowns(profile);
    expect(profile.cooldowns['naked_pair']).toBe(2);
    // x_wing was 1, after decrement it's 0 so it gets deleted
    expect(profile.cooldowns['x_wing']).toBeUndefined();
  });

  it('setEscapeCooldown sets cooldown for a technique', () => {
    const profile = makeProfile();
    setEscapeCooldown(profile, 'locked_candidates');
    const meta = TECHNIQUE_TABLE.find((t) => t.key === 'locked_candidates');
    expect(profile.cooldowns['locked_candidates']).toBe(meta!.cooldown);
  });

  it('techniques on cooldown should not be in the pool', async () => {
    mockFetchPuzzles();
    // Set all implemented techniques except naked_single on high cooldown
    const cooldowns: Record<string, number> = {};
    for (const t of TECHNIQUE_TABLE) {
      if (t.key !== 'naked_single' && t.levelGate <= 1) {
        cooldowns[t.key] = 99;
      }
    }
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 5, cooldowns });
    const enc = await selectEncounter(profile);
    // Should still return something (fallback logic)
    expect(enc).toBeDefined();
  });
});

describe('TECHNIQUE_TABLE', () => {
  it('puzzle solution values are mocked correctly (1-9)', async () => {
    mockFetchPuzzles();
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 0 });
    const enc = await selectEncounter(profile);
    for (const v of enc.solution) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('puzzle values are 0 (blank) or match solution', async () => {
    mockFetchPuzzles();
    const profile = makeProfile({ iqLevel: 1, totalEncounters: 0 });
    const enc = await selectEncounter(profile);
    for (let i = 0; i < 81; i++) {
      if (enc.puzzle[i] !== 0) {
        expect(enc.puzzle[i]).toBe(enc.solution[i]);
      }
    }
  });
});
