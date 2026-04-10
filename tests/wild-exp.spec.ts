import { describe, expect, it } from 'vitest';
import { expForLevel, levelFromExp, calculateExp, applyExp, releaseGateOverflow } from '../src/features/wild/expSystem';
import type { WildProfile } from '../src/features/wild/wildState';

describe('expForLevel', () => {
  it('returns correct cumulative EXP for level 1', () => {
    expect(expForLevel(1)).toBe(25);
  });

  it('returns correct cumulative EXP for level 5', () => {
    expect(expForLevel(5)).toBe(375);
  });

  it('returns correct cumulative EXP for level 10', () => {
    expect(expForLevel(10)).toBe(1375);
  });

  it('returns correct cumulative EXP for level 21', () => {
    expect(expForLevel(21)).toBe(5775);
  });

  it('returns 0 for level 0', () => {
    expect(expForLevel(0)).toBe(0);
  });

  it('values are monotonically increasing', () => {
    for (let n = 1; n <= 50; n++) {
      expect(expForLevel(n)).toBeGreaterThan(expForLevel(n - 1));
    }
  });
});

describe('levelFromExp', () => {
  it('returns 1 for 0 EXP', () => {
    expect(levelFromExp(0)).toBe(1);
  });

  it('returns 1 for negative EXP', () => {
    expect(levelFromExp(-100)).toBe(1);
  });

  it('round-trips with expForLevel for various levels', () => {
    for (const n of [1, 2, 5, 10, 15, 20, 21, 30, 50]) {
      const exp = expForLevel(n);
      expect(levelFromExp(exp)).toBe(n);
    }
  });

  it('returns correct level for EXP just below threshold', () => {
    // Just below level 5 threshold (375) should be level 4
    expect(levelFromExp(374)).toBe(4);
  });

  it('returns correct level for EXP at exact threshold', () => {
    expect(levelFromExp(375)).toBe(5);
  });

  it('returns correct level for EXP slightly above threshold', () => {
    // Slightly above level 5 but below level 6 (525)
    expect(levelFromExp(376)).toBe(5);
  });
});

describe('calculateExp', () => {
  it('returns base EXP with no modifiers', () => {
    // common rarity (1x), 180 seconds (1.0 speed), 0 errors (1.0 penalty), 1.0 challenge
    const result = calculateExp(100, 'common', 180, 0, 1.0);
    expect(result).toBe(100);
  });

  it('applies rarity multiplier', () => {
    // rare = 2x
    expect(calculateExp(100, 'rare', 180, 0, 1.0)).toBe(200);
    // legendary = 3x
    expect(calculateExp(100, 'legendary', 180, 0, 1.0)).toBe(300);
    // mythic = 5x
    expect(calculateExp(100, 'mythic', 180, 0, 1.0)).toBe(500);
  });

  it('applies speed bonus for fast completion', () => {
    // 0 seconds → speed = min(2.0, max(0.5, 1.0 + (180-0)/180)) = min(2.0, 2.0) = 2.0
    expect(calculateExp(100, 'common', 0, 0, 1.0)).toBe(200);
  });

  it('applies speed penalty for slow completion', () => {
    // 360 seconds → speed = min(2.0, max(0.5, 1.0 + (180-360)/180)) = max(0.5, 0.0) = 0.5
    expect(calculateExp(100, 'common', 360, 0, 1.0)).toBe(50);
  });

  it('clamps speed bonus at 2.0', () => {
    // Very fast: speed would be > 2.0 but clamped
    expect(calculateExp(100, 'common', 0, 0, 1.0)).toBe(200);
  });

  it('clamps speed penalty at 0.5', () => {
    // Very slow (10 min): speed factor clamped at 0.5
    expect(calculateExp(100, 'common', 600, 0, 1.0)).toBe(50);
  });

  it('applies error penalty', () => {
    // 1 error: 1.0 - 0.15 = 0.85
    expect(calculateExp(100, 'common', 180, 1, 1.0)).toBe(85);
    // 2 errors: 1.0 - 0.30 = 0.70
    expect(calculateExp(100, 'common', 180, 2, 1.0)).toBe(70);
  });

  it('clamps error penalty floor at 0.5', () => {
    // 5 errors: 1.0 - 0.75 = 0.25, clamped to 0.5
    expect(calculateExp(100, 'common', 180, 5, 1.0)).toBe(50);
    // 10 errors: still clamped at 0.5
    expect(calculateExp(100, 'common', 180, 10, 1.0)).toBe(50);
  });

  it('applies challenge multiplier', () => {
    expect(calculateExp(100, 'common', 180, 0, 1.5)).toBe(150);
  });

  it('combines all modifiers', () => {
    // rare(2x) * fast(2.0x) * 1 error(0.85x) * challenge(1.5x) = 100 * 2 * 2.0 * 0.85 * 1.5 = 510
    expect(calculateExp(100, 'rare', 0, 1, 1.5)).toBe(510);
  });

  it('defaults challenge multiplier to 1.0', () => {
    expect(calculateExp(100, 'common', 180, 0)).toBe(100);
  });
});

describe('applyExp', () => {
  function makeProfile(overrides: Partial<WildProfile> = {}): WildProfile {
    return {
      iqLevel: 1,
      totalExp: 0,
      gateOverflowExp: 0,
      puzzlesCompleted: 0,
      totalEncounters: 0,
      cooldowns: {},
      bestiary: {},
      battlefieldMode: 'knight',
      autoCastEnabled: true,
      currentSession: null,
      fragments: {},
      studiedSkills: [],
      tutorialCompleted: false,
      tutorialRound: 0,
      ...overrides,
    };
  }

  it('adds EXP and levels up', () => {
    const profile = makeProfile({ iqLevel: 1, totalExp: 0 });
    const result = applyExp(profile, 100);
    expect(profile.totalExp).toBe(100);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBeGreaterThan(1);
  });

  it('does not level up when insufficient EXP', () => {
    const profile = makeProfile({ iqLevel: 1, totalExp: 0 });
    const result = applyExp(profile, 5);
    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);
  });

  it('gates level 21 behind studied skills', () => {
    // Profile at level 20 boundary, but without all basic skills studied
    const lv20Exp = expForLevel(20);
    const profile = makeProfile({ iqLevel: 20, totalExp: lv20Exp, studiedSkills: [] });
    const result = applyExp(profile, 1000);
    expect(result.newLevel).toBe(20);
    expect(result.gated).toBe(true);
    expect(profile.totalExp).toBe(lv20Exp); // EXP capped
    expect(profile.gateOverflowExp).toBeGreaterThan(0); // overflow banked
  });

  it('allows level 21 when all basic skills are studied', () => {
    const lv20Exp = expForLevel(20);
    const lv21Exp = expForLevel(21);
    const needed = lv21Exp - lv20Exp + 1;
    // All T0-T1 technique keys that have fragmentsRequired > 0
    const requiredSkills = [
      'naked_single',
      'hidden_single',
      'locked_candidates',
      'naked_pair',
      'hidden_pair',
      'naked_triple',
      'hidden_triple',
    ];
    const profile = makeProfile({ iqLevel: 20, totalExp: lv20Exp, studiedSkills: requiredSkills });
    const result = applyExp(profile, needed);
    expect(result.newLevel).toBeGreaterThanOrEqual(21);
    expect(result.gated).toBe(false);
  });

  it('releases banked gate EXP when all basics are studied', () => {
    const lv20Exp = expForLevel(20);
    const profile = makeProfile({
      iqLevel: 20,
      totalExp: lv20Exp,
      gateOverflowExp: 600,
      studiedSkills: [
        'naked_single',
        'hidden_single',
        'locked_candidates',
        'naked_pair',
        'hidden_pair',
        'naked_triple',
        'hidden_triple',
      ],
    });
    const released = releaseGateOverflow(profile);
    expect(released).toBe(600);
    expect(profile.gateOverflowExp).toBe(0);
    expect(profile.totalExp).toBe(lv20Exp + 600);
    expect(profile.iqLevel).toBeGreaterThanOrEqual(21);
  });
});
