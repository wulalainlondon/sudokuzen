// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Duo pure logic tests — no Firebase, no DOM rendering.
 * Tests: win/draw recording, streak tracking, cooldown calculation, winner detection.
 */

// Import the pure functions directly
import { recordDuoWin, recordDuoDraw, loadDuoRecords } from '../src/features/duo';

describe('duo records & streaks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a win and increments winner count', () => {
    const rec = recordDuoWin('Alice', 'Bob');
    expect(rec.wins['Alice']).toBe(1);
    expect(rec.wins['Bob']).toBe(0);
  });

  it('accumulates wins across multiple rounds', () => {
    recordDuoWin('Alice', 'Bob');
    recordDuoWin('Alice', 'Bob');
    const rec = recordDuoWin('Bob', 'Alice');
    expect(rec.wins['Alice']).toBe(2);
    expect(rec.wins['Bob']).toBe(1);
  });

  it('tracks streak for consecutive wins by same player', () => {
    recordDuoWin('Alice', 'Bob');
    recordDuoWin('Alice', 'Bob');
    const rec = recordDuoWin('Alice', 'Bob');
    expect(rec.streak).toBe(3);
    expect(rec.streakHolder).toBe('Alice');
  });

  it('resets streak when different player wins', () => {
    recordDuoWin('Alice', 'Bob');
    recordDuoWin('Alice', 'Bob');
    const rec = recordDuoWin('Bob', 'Alice');
    expect(rec.streak).toBe(1);
    expect(rec.streakHolder).toBe('Bob');
  });

  it('draw resets streak to 0', () => {
    recordDuoWin('Alice', 'Bob');
    recordDuoWin('Alice', 'Bob');
    const rec = recordDuoDraw();
    expect(rec.streak).toBe(0);
    expect(rec.streakHolder).toBe('');
  });

  it('persists to localStorage', () => {
    recordDuoWin('Alice', 'Bob');
    // Load from fresh read
    const rec = loadDuoRecords();
    expect(rec.wins['Alice']).toBe(1);
    expect(rec.streak).toBe(1);
    expect(rec.streakHolder).toBe('Alice');
  });

  it('handles empty/missing localStorage gracefully', () => {
    const rec = loadDuoRecords();
    expect(rec.wins).toEqual({});
    expect(rec.streak).toBe(0);
    expect(rec.streakHolder).toBe('');
  });
});

describe('duo winner detection logic', () => {
  // Pure logic extracted from showDuoResult — no DOM needed
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
  // Pure logic extracted from handleInput duo error path
  function calculateCooldown(
    sameCell: boolean,
    currentStreak: number,
    timeSinceLastError: number,
  ): { cooldownSec: number; newStreak: number } {
    const BASE_CD = 5;
    const STREAK_WINDOW = 30000; // 30 seconds

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
