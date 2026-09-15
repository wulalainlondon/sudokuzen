// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ runtime: vi.fn(), auth: vi.fn(), uid: vi.fn() }));
vi.mock('../src/firebase/runtime', () => ({
  ensureFirebaseRuntime: mocks.runtime,
  initAnonymousAuth: mocks.auth,
  getAuthUid: mocks.uid,
}));
let gs: typeof import('../src/game/state').gs;
const db = {};
const firebase = { apps: [{}], firestore: vi.fn(() => db) };
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  gs = (await import('../src/game/state')).gs;
  gs.firebaseReady = false;
  gs.db = null;
  (window as unknown as { SUDOKU_FIREBASE_CONFIG: object }).SUDOKU_FIREBASE_CONFIG = { projectId: 'fixture' };
  mocks.runtime.mockResolvedValue(firebase);
  mocks.auth.mockResolvedValue('owner');
  mocks.uid.mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});
it('retries a failed SDK initialization and coalesces concurrent callers', async () => {
  mocks.runtime.mockRejectedValueOnce(new Error('offline'));
  const { initFirebase, whenFirebaseReady } = await import('../src/firebase/client');
  expect(await Promise.all([initFirebase(), initFirebase()])).toEqual([false, false]);
  expect(mocks.runtime).toHaveBeenCalledTimes(1);
  expect(gs.firebaseReady).toBe(false);
  expect(await whenFirebaseReady()).toBe(true);
  expect(mocks.runtime).toHaveBeenCalledTimes(2);
  expect(gs.firebaseReady).toBe(true);
});
it('does not report ready or change player identity until anonymous auth succeeds', async () => {
  localStorage.setItem('sudoku_player_id', 'existing-player');
  mocks.auth.mockResolvedValueOnce(null);
  const { initFirebase, whenFirebaseReady } = await import('../src/firebase/client');
  expect(await initFirebase()).toBe(false);
  expect(gs.firebaseReady).toBe(false);
  expect(localStorage.getItem('sudoku_player_id')).toBe('existing-player');
  expect(await whenFirebaseReady()).toBe(true);
  expect(mocks.auth).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem('sudoku_player_id')).toBe('p_owner');
});
