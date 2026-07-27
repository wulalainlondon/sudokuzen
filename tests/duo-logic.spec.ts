// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Duo pure logic tests — no Firebase, no DOM rendering.
 * Tests: profile recording, streak tracking, cooldown calculation, winner detection, unlock logic.
 */

// Import the pure functions directly
import {
  loadDuoProfile,
  recordDuoMatch,
  getUnlockedTiers,
  getUnlockedModes,
  checkNewUnlocks,
  markDuoRoomResultRecorded,
  type DuoProfile,
} from '../src/features/duo/duoProfile';

function emptyProfile(): DuoProfile {
  return { playCount: {}, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, rivals: {} };
}

describe('duo profile & match recording', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a win and increments winner count', () => {
    const p = emptyProfile();
    const result = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(0);
    expect(result.rivals['Bob'].wins).toBe(1);
  });

  it('accumulates wins across multiple rounds', () => {
    let p = emptyProfile();
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'loss', 'Bob');
    expect(p.wins).toBe(2);
    expect(p.losses).toBe(1);
    expect(p.rivals['Bob'].wins).toBe(2);
    expect(p.rivals['Bob'].losses).toBe(1);
  });

  it('tracks streak for consecutive wins', () => {
    let p = emptyProfile();
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    expect(p.currentStreak).toBe(3);
    expect(p.bestStreak).toBe(3);
  });

  it('resets streak on loss', () => {
    let p = emptyProfile();
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'loss', 'Bob');
    expect(p.currentStreak).toBe(0);
    expect(p.bestStreak).toBe(2);
  });

  it('draw resets streak', () => {
    let p = emptyProfile();
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'draw', 'Bob');
    expect(p.currentStreak).toBe(0);
    expect(p.draws).toBe(1);
  });

  it('persists to localStorage', () => {
    const p = emptyProfile();
    recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    const loaded = loadDuoProfile();
    expect(loaded.wins).toBe(1);
    expect(loaded.currentStreak).toBe(1);
  });

  it('handles empty/missing localStorage gracefully', () => {
    const p = loadDuoProfile();
    expect(p.wins).toBe(0);
    expect(p.losses).toBe(0);
    expect(p.playCount).toEqual({});
  });

  it('normalizes a partial or corrupt legacy profile', () => {
    localStorage.setItem(
      'sudoku_duo_profile_v2',
      JSON.stringify({
        wins: '4',
        losses: -2,
        playCount: { 'tier0-standard': '3', broken: 'nope' },
        rivals: { Alice: { wins: 2 } },
      }),
    );
    const p = loadDuoProfile();
    expect(p).toEqual({
      playCount: { 'tier0-standard': 3, broken: 0 },
      wins: 4,
      losses: 0,
      draws: 0,
      currentStreak: 0,
      bestStreak: 0,
      rivals: { Alice: { wins: 2, losses: 0 } },
    });
  });

  it('tracks play count per tier-mode', () => {
    let p = emptyProfile();
    p = recordDuoMatch(p, 'tierI', 'standard', 'win', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'standard', 'loss', 'Bob');
    p = recordDuoMatch(p, 'tierI', 'noNotes', 'win', 'Bob');
    expect(p.playCount['tierI-standard']).toBe(2);
    expect(p.playCount['tierI-noNotes']).toBe(1);
  });

  it('records each round once while allowing rematches in the same room', () => {
    expect(markDuoRoomResultRecorded('room-1:seed-1')).toBe(true);
    expect(markDuoRoomResultRecorded('room-1:seed-1')).toBe(false);
    expect(markDuoRoomResultRecorded('room-1:seed-2')).toBe(true);
  });
});

describe('duo unlock logic', () => {
  it('tier0 is always unlocked', () => {
    const p = emptyProfile();
    expect(getUnlockedTiers(p)).toEqual(['tier0']);
  });

  it('tierII unlocks after 5 tierI plays', () => {
    const p = emptyProfile();
    p.playCount['tierI-standard'] = 5;
    expect(getUnlockedTiers(p)).toContain('tierII');
  });

  it('noNotes unlocks after 3 standard plays', () => {
    const p = emptyProfile();
    p.playCount['tierI-standard'] = 3;
    expect(getUnlockedModes(p)).toContain('noNotes');
  });

  it('checkNewUnlocks detects new tier', () => {
    const before = emptyProfile();
    before.playCount['tierI-standard'] = 4;
    const after = { ...before, playCount: { ...before.playCount, 'tierI-standard': 5 } };
    const unlocks = checkNewUnlocks(before, after);
    expect(unlocks.newTiers).toEqual(['tierII']);
  });

  it('checkNewUnlocks detects new mode', () => {
    const before = emptyProfile();
    before.playCount['tierI-standard'] = 2;
    const after = { ...before, playCount: { ...before.playCount, 'tierI-standard': 3 } };
    const unlocks = checkNewUnlocks(before, after);
    expect(unlocks.newModes).toEqual(['noNotes']);
  });
});

describe('duo winner detection logic', () => {
  function determineWinner(hTime: number, gTime: number) {
    const hWin = hTime < gTime;
    const gWin = gTime < hTime;
    const isDraw = hTime === gTime;
    const diff = Math.abs(hTime - gTime);
    return { hWin, gWin, isDraw, diff };
  }

  it('host wins when host time is shorter', () => {
    const r = determineWinner(45, 60);
    expect(r.hWin).toBe(true);
    expect(r.gWin).toBe(false);
    expect(r.isDraw).toBe(false);
    expect(r.diff).toBe(15);
  });

  it('guest wins when guest time is shorter', () => {
    const r = determineWinner(90, 55);
    expect(r.hWin).toBe(false);
    expect(r.gWin).toBe(true);
    expect(r.diff).toBe(35);
  });

  it('draw when times are equal', () => {
    const r = determineWinner(42, 42);
    expect(r.isDraw).toBe(true);
    expect(r.hWin).toBe(false);
    expect(r.gWin).toBe(false);
    expect(r.diff).toBe(0);
  });
});

describe('duo cooldown calculation', () => {
  function calculateCooldown(
    sameCell: boolean,
    currentStreak: number,
    timeSinceLastError: number,
  ): { cooldownSec: number; newStreak: number } {
    const BASE_CD = 5;
    const STREAK_WINDOW = 30000;

    let streak: number;
    if (sameCell && timeSinceLastError < STREAK_WINDOW) {
      streak = currentStreak + 1;
    } else {
      streak = 1;
    }
    const cooldownSec = Math.min(BASE_CD * streak, 30);
    return { cooldownSec, newStreak: streak };
  }

  it('first error on a cell: 5s cooldown', () => {
    const r = calculateCooldown(false, 0, 0);
    expect(r.cooldownSec).toBe(5);
    expect(r.newStreak).toBe(1);
  });

  it('second error on same cell within 30s: 10s cooldown', () => {
    const r = calculateCooldown(true, 1, 5000);
    expect(r.cooldownSec).toBe(10);
    expect(r.newStreak).toBe(2);
  });

  it('third error on same cell: 15s cooldown', () => {
    const r = calculateCooldown(true, 2, 3000);
    expect(r.cooldownSec).toBe(15);
    expect(r.newStreak).toBe(3);
  });

  it('caps at 30s', () => {
    const r = calculateCooldown(true, 10, 1000);
    expect(r.cooldownSec).toBe(30);
  });

  it('resets streak when different cell', () => {
    const r = calculateCooldown(false, 5, 2000);
    expect(r.cooldownSec).toBe(5);
    expect(r.newStreak).toBe(1);
  });

  it('resets streak when >30s since last error on same cell', () => {
    const r = calculateCooldown(true, 5, 31000);
    expect(r.cooldownSec).toBe(5);
    expect(r.newStreak).toBe(1);
  });
});
