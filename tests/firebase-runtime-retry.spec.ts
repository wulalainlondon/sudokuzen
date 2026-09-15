// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { firebase } = vi.hoisted(() => ({
  firebase: { apps: [], firestore: vi.fn(), auth: vi.fn(), functions: vi.fn() },
}));
vi.mock('firebase/compat/app', () => ({ default: firebase }));
vi.mock('firebase/compat/auth', () => ({}));
vi.mock('firebase/compat/firestore', () => ({}));
vi.mock('firebase/compat/functions', () => ({}));
const configWindow = window as unknown as { SUDOKU_FIREBASE_CONFIG?: Record<string, string> };
beforeEach(() => {
  vi.resetModules();
  delete configWindow.SUDOKU_FIREBASE_CONFIG;
  document.head.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('shares a failed config load, then really requests it again without reloading the page', async () => {
  const { ensureFirebaseRuntime } = await import('../src/firebase/runtime');
  const first = ensureFirebaseRuntime();
  const second = ensureFirebaseRuntime();
  const failed = Promise.allSettled([first, second]);
  expect(document.head.querySelectorAll('script')).toHaveLength(1);
  document.head.querySelector('script')!.dispatchEvent(new Event('error'));
  expect((await failed).every((result) => result.status === 'rejected')).toBe(true);
  expect(document.head.querySelectorAll('script')).toHaveLength(0);
  const retried = ensureFirebaseRuntime();
  configWindow.SUDOKU_FIREBASE_CONFIG = { projectId: 'fixture' };
  document.head.querySelector('script')!.dispatchEvent(new Event('load'));
  await Promise.resolve();
  document.head.querySelector('script')!.dispatchEvent(new Event('load'));
  expect(await retried).toBe(firebase);
  expect(await ensureFirebaseRuntime()).toBe(firebase);
});

it('releases a config request that never responds so a subsequent attempt can succeed', async () => {
  vi.useFakeTimers();
  const { ensureFirebaseRuntime } = await import('../src/firebase/runtime');
  const stalled = expect(ensureFirebaseRuntime()).rejects.toThrow('script load timed out');
  await vi.advanceTimersByTimeAsync(8000);
  await stalled;
  expect(document.head.querySelectorAll('script')).toHaveLength(0);
  configWindow.SUDOKU_FIREBASE_CONFIG = { projectId: 'fixture' };
  expect(await ensureFirebaseRuntime()).toBe(firebase);
});

it('does not retain a successful script request that provided no configuration', async () => {
  const { ensureFirebaseRuntime } = await import('../src/firebase/runtime');
  const empty = ensureFirebaseRuntime();
  document.head.querySelector('script')!.dispatchEvent(new Event('load'));
  await Promise.resolve();
  document.head.querySelector('script')!.dispatchEvent(new Event('load'));
  expect(await empty).toBeNull();
  configWindow.SUDOKU_FIREBASE_CONFIG = { projectId: 'fixture' };
  expect(await ensureFirebaseRuntime()).toBe(firebase);
});
