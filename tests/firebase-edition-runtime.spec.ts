// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const apps: Array<{
    name: string;
    options: Record<string, string>;
    auth: () => unknown;
    firestore: () => unknown;
    functions: () => unknown;
  }> = [];
  const sourceDb = { realm: 'original' };
  const sourceAuth = { currentUser: { uid: 'original-owner' }, signInAnonymously: vi.fn(), signOut: vi.fn() };
  const currentDb = { realm: 'current' };
  const currentAuth = { currentUser: { uid: 'current-owner', delete: vi.fn() }, signInAnonymously: vi.fn() };
  const firestore = Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 123 },
    Timestamp: { fromMillis: (n: number) => n },
  });
  const sdk = {
    apps,
    firestore,
    initializeApp: vi.fn((options: Record<string, string>, name = '[DEFAULT]') => {
      const original = name === '[DEFAULT]';
      const app = {
        name,
        options,
        auth: () => (original ? sourceAuth : currentAuth),
        firestore: () => (original ? sourceDb : currentDb),
        functions: () => ({ realm: original ? 'original' : 'current' }),
      };
      apps.push(app);
      return app;
    }),
  };
  return { sdk, sourceAuth, currentAuth, sourceDb, currentDb };
});
vi.mock('firebase/compat/app', () => ({ default: fixture.sdk }));
vi.mock('firebase/compat/auth', () => ({}));
vi.mock('firebase/compat/firestore', () => ({}));
vi.mock('firebase/compat/functions', () => ({}));

const globals = window as unknown as {
  SUDOKU_FIREBASE_CONFIG?: Record<string, string>;
  SUDOKU_LEGACY_FIREBASE_CONFIG?: Record<string, string>;
};
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  fixture.sdk.apps.length = 0;
  fixture.sdk.initializeApp.mockClear();
  fixture.sourceAuth.signInAnonymously.mockClear();
  fixture.sourceAuth.signOut.mockClear();
  fixture.currentAuth.currentUser.delete.mockClear();
  delete globals.SUDOKU_FIREBASE_CONFIG;
  delete globals.SUDOKU_LEGACY_FIREBASE_CONFIG;
});
afterEach(() => vi.unstubAllEnvs());

it.each(['pwa', 'ios'])(
  'uses an independent %s identity while retaining the original session only for owned history',
  async (edition) => {
    vi.stubEnv('VITE_APP_EDITION', edition);
    globals.SUDOKU_FIREBASE_CONFIG = { projectId: edition === 'ios' ? 'sudokuzen-ios-prod' : 'sudokuzen-f2aa3' };
    if (edition === 'ios') globals.SUDOKU_LEGACY_FIREBASE_CONFIG = { projectId: 'sudokuzen-f2aa3' };
    const runtime = await import('../src/firebase/runtime');
    const current = await runtime.ensureFirebaseRuntime();
    expect(fixture.sdk.apps.map((app) => app.name)).toEqual(['[DEFAULT]', `sudoku-${edition}`]);
    expect(current?.auth()).toBe(fixture.currentAuth);
    expect(current?.firestore()).toBe(fixture.currentDb);
    expect(await runtime.getLegacyProfileDb('p_original-owner')).toBe(fixture.sourceDb);
    expect(await runtime.getLegacyProfileDb('p_someone_else')).toBeNull();
    expect(fixture.sourceAuth.signInAnonymously).not.toHaveBeenCalled();
    await runtime.deleteCurrentAuthUser();
    await runtime.signOutLegacySession();
    expect(fixture.currentAuth.currentUser.delete).toHaveBeenCalledOnce();
    expect(fixture.sourceAuth.signOut).toHaveBeenCalledOnce();
  },
);

it('rejects a wrong Firebase project before creating or signing into an app', async () => {
  vi.stubEnv('VITE_APP_EDITION', 'ios');
  globals.SUDOKU_FIREBASE_CONFIG = { projectId: 'sudokuzen-f2aa3' };
  globals.SUDOKU_LEGACY_FIREBASE_CONFIG = { projectId: 'sudokuzen-f2aa3' };
  const runtime = await import('../src/firebase/runtime');
  await expect(runtime.ensureFirebaseRuntime()).rejects.toThrow('does not match ios');
  expect(fixture.sdk.initializeApp).not.toHaveBeenCalled();
});
