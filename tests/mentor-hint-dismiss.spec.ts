// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  dismissMentor,
  startEncounterHintTimers,
  stopEncounterHintTimers,
  triggerCtmIntroIfNeeded,
  triggerFirstKillIfNeeded,
  triggerIntroIfNeeded,
  hasCompletedMentorIntro,
} from '../src/features/wild/mentorController';
import { useMentorStore } from '../src/react/mentor/mentorStore';
vi.mock('../src/features/wild/mentorDemo', () => ({ runMentorDemo: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  stopEncounterHintTimers();
  dismissMentor();
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('closes the actual 30-second hint that previously had no resolver', async () => {
  startEncounterHintTimers('locked_candidates', true);
  await vi.advanceTimersByTimeAsync(30000);
  await vi.dynamicImportSettled();
  expect(useMentorStore.getState().text).toContain('長按 numpad');
  expect(useMentorStore.getState().dismissLabelKey).toBe('mentor.backToBoard');
  expect(useMentorStore.getState().visible).toBe(true);
  dismissMentor();
  expect(useMentorStore.getState().visible).toBe(false);
});
it('closes the one-time CTM introduction', async () => {
  triggerCtmIntroIfNeeded('locked_candidates', true, true);
  await vi.advanceTimersByTimeAsync(2000);
  await vi.dynamicImportSettled();
  expect(useMentorStore.getState().visible).toBe(true);
  dismissMentor();
  expect(useMentorStore.getState().visible).toBe(false);
});
it('still resolves and records narrative messages', async () => {
  const completed = triggerFirstKillIfNeeded();
  await vi.dynamicImportSettled();
  expect(useMentorStore.getState().dismissLabelKey).toBe('mentor.continue');
  dismissMentor();
  await completed;
  expect(JSON.parse(localStorage.getItem('sudoku_mentor_seen')!)).toContain('first_kill');
  expect(useMentorStore.getState().visible).toBe(false);
});
it('advances the full intro without a late close hiding its next message', async () => {
  const completed = triggerIntroIfNeeded();
  for (let n = 0; n < 20 && !hasCompletedMentorIntro(); n++) {
    await vi.dynamicImportSettled();
    expect(useMentorStore.getState().visible).toBe(true);
    dismissMentor();
    await Promise.resolve();
  }
  await completed;
  expect(hasCompletedMentorIntro()).toBe(true);
  expect(useMentorStore.getState().visible).toBe(false);
});
