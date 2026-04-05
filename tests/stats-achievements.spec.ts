// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SK } from '../src/storage/keys';
import {
  computeStats,
  checkAllAchievements,
  ACHIEVEMENTS,
  loadAchievements,
  unlockAchievement,
} from '../src/features/stats';

type GlobalWithLevels = typeof globalThis & { levels?: unknown[] };

describe('computeStats', () => {
  beforeEach(() => {
    localStorage.clear();
    // Provide minimal window.levels for getAllLevels() fallback
    (globalThis as GlobalWithLevels).levels = [];
  });

  it('with empty records returns totalCleared=0', () => {
    const stats = computeStats();
    expect(stats.totalCleared).toBe(0);
    expect(stats.totalTime).toBe(0);
    expect(stats.avgTime).toBe(0);
  });

  it('with 5 normal records returns correct totalCleared=5', () => {
    const records: Record<string, unknown> = {};
    for (let i = 1; i <= 5; i++) {
      records[i] = { time: 100, stars: 2 };
    }
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));
    const stats = computeStats();
    expect(stats.totalCleared).toBe(5);
  });

  it('with practice records returns correct practiceCleared count', () => {
    const practiceRecords: Record<string, unknown> = {};
    for (let i = 1; i <= 8; i++) {
      practiceRecords[i] = { techKey: 'naked_single', time: 60, stars: 3 };
    }
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(practiceRecords));
    const stats = computeStats();
    expect(stats.practiceCleared).toBe(8);
  });

  it('combined count (totalCleared + practiceCleared) for clear_50 check', () => {
    const records: Record<string, unknown> = {};
    for (let i = 1; i <= 30; i++) {
      records[i] = { time: 120, stars: 2 };
    }
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));

    const practiceRecords: Record<string, unknown> = {};
    for (let i = 1; i <= 25; i++) {
      practiceRecords[i] = { techKey: 'naked_pair', time: 60, stars: 3 };
    }
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(practiceRecords));

    const stats = computeStats();
    expect(stats.totalCleared + stats.practiceCleared).toBe(55);
  });

  it('practiceFullTechs counts techniques with 25+ clears', () => {
    const practiceRecords: Record<string, unknown> = {};
    // 25 levels for naked_single
    for (let i = 1; i <= 25; i++) {
      practiceRecords[i] = { techKey: 'naked_single', time: 60, stars: 3 };
    }
    // 25 levels for hidden_single
    for (let i = 26; i <= 50; i++) {
      practiceRecords[i] = { techKey: 'hidden_single', time: 60, stars: 3 };
    }
    // Only 10 for locked_candidates (not full)
    for (let i = 51; i <= 60; i++) {
      practiceRecords[i] = { techKey: 'locked_candidates', time: 60, stars: 3 };
    }
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(practiceRecords));

    const stats = computeStats();
    expect(stats.practiceFullTechs).toBe(2);
  });
});

describe('checkAllAchievements', () => {
  beforeEach(() => {
    localStorage.clear();
    (globalThis as GlobalWithLevels).levels = [];
  });

  it('unlocks first_clear when combinedCleared >= 1', () => {
    const records = { 1: { time: 100, stars: 2 } };
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));

    checkAllAchievements();

    const ach = loadAchievements();
    expect(ach['first_clear']).toBeDefined();
    expect(ach['first_clear'].date).toBeTruthy();
  });

  it('unlocks clear_50 when combinedCleared >= 50', () => {
    const records: Record<string, unknown> = {};
    for (let i = 1; i <= 50; i++) {
      records[i] = { time: 100, stars: 2 };
    }
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));

    checkAllAchievements();

    const ach = loadAchievements();
    expect(ach['clear_50']).toBeDefined();
  });

  it('unlocks speed_2min when any record has time <= 120', () => {
    const records = { 1: { time: 115, stars: 3 } };
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));

    checkAllAchievements();

    const ach = loadAchievements();
    expect(ach['speed_2min']).toBeDefined();
  });

  it('does NOT unlock speed_2min when all records have time > 120', () => {
    const records = { 1: { time: 200, stars: 2 } };
    localStorage.setItem(SK.RECORDS, JSON.stringify(records));

    checkAllAchievements();

    const ach = loadAchievements();
    expect(ach['speed_2min']).toBeUndefined();
  });
});

describe('ACHIEVEMENTS', () => {
  it('has correct count (36 achievements)', () => {
    expect(ACHIEVEMENTS.length).toBe(36);
  });

  it('each achievement has unique id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe('unlockAchievement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true on first unlock, false on duplicate', () => {
    const first = unlockAchievement('first_clear');
    expect(first).toBe(true);
    const second = unlockAchievement('first_clear');
    expect(second).toBe(false);
  });

  it('persists to localStorage', () => {
    unlockAchievement('speed_2min');
    const data = loadAchievements();
    expect(data['speed_2min']).toBeDefined();
    expect(data['speed_2min'].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
