// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gs } from '../src/game/state';
import { captureDuoElapsedTime, startTimer } from '../src/game/timer';

let now = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  now = 0;
  gs.isDuoMode = true;
  gs.isGhostMode = false;
  gs.timerEl = null;
});
afterEach(() => {
  if (gs.timerInterval) clearInterval(gs.timerInterval);
  gs.timerInterval = null;
  captureDuoElapsedTime(true);
  gs.isDuoMode = false;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(['host', 'guest'] as const)('counts elapsed time after missed callbacks for %s', (role) => {
  gs.duoRole = role;
  startTimer();
  // Only one callback runs, although 18 seconds of real time have elapsed.
  now = 18_200;
  vi.advanceTimersByTime(1000);
  expect(gs.seconds).toBe(18);
});

it('captures completion before the next tick and freezes it during result delivery', () => {
  startTimer();
  now = 12_900;
  expect(captureDuoElapsedTime(true)).toBe(12);
  now = 30_000;
  expect(captureDuoElapsedTime()).toBe(12);
});

it('starts each rematch at zero without accumulating prior elapsed time', () => {
  for (const duration of [4000, 8000, 12000]) {
    startTimer();
    expect(gs.seconds).toBe(0);
    now += duration;
    expect(captureDuoElapsedTime(true)).toBe(duration / 1000);
  }
});

it('continues from the restored round baseline without counting it twice', () => {
  gs.seconds = 47; // launchDuoGame has restored and reconciled the saved round.
  startTimer(false);
  now = 6200;
  expect(captureDuoElapsedTime()).toBe(53);
  now = 9200;
  expect(captureDuoElapsedTime()).toBe(56);
});

it('is unaffected by a system clock correction during a running round', () => {
  startTimer();
  vi.setSystemTime(Date.now() + 3_600_000);
  now = 7200;
  expect(captureDuoElapsedTime()).toBe(7);
});

it('preserves single-player timer behavior', () => {
  gs.isDuoMode = false;
  startTimer();
  now = 18_200;
  vi.advanceTimersByTime(1000);
  expect(gs.seconds).toBe(1);
  captureDuoElapsedTime(true);
  expect(gs.seconds).toBe(1);
});
