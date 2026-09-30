// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirestoreDbLike } from '../src/game/state';
import type { FirestoreDocRef, FirestoreTransaction } from '../src/firebase/types';

const fixture = vi.hoisted(() => ({
  legacyDb: null as FirestoreDbLike | null,
  deleteAuth: vi.fn().mockResolvedValue(undefined),
  signOutLegacy: vi.fn().mockResolvedValue(undefined),
  puzzle: Array.from({ length: 81 }, (_, i) => i % 10),
}));
vi.mock('../src/firebase/runtime', () => ({
  getAuthUid: () => 'new-owner',
  initAnonymousAuth: async () => 'new-owner',
  ensureFirebaseRuntime: async () => null,
  firebaseServerTimestamp: () => 123,
  getLegacyProfileDb: async () => fixture.legacyDb,
  callDuoFunction: vi.fn(),
  deleteCurrentAuthUser: fixture.deleteAuth,
  signOutLegacySession: fixture.signOutLegacy,
}));
vi.mock('../src/data/dataRegistry', () => ({
  getAllLevels: () => [{ id: 7, puzzle: fixture.puzzle, stars: 1, difficultyName: 'Test' }],
}));

function memoryDb(initial: Record<string, Record<string, unknown>> = {}) {
  const data = new Map(Object.entries(initial));
  const deleted: string[] = [];
  let failingPath: string | null = null;
  function doc(path: string): FirestoreDocRef {
    const ref = {
      async get() {
        return { exists: data.has(path), data: () => data.get(path), id: path.split('/').at(-1)!, ref };
      },
      async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
        if (path === failingPath) throw new Error('offline');
        data.set(path, options?.merge ? { ...data.get(path), ...value } : value);
      },
      async update(value: Record<string, unknown>) {
        data.set(path, { ...data.get(path), ...value });
      },
      async delete() {
        data.delete(path);
        deleted.push(path);
      },
      collection: (name: string) => collection(`${path}/${name}`),
      onSnapshot: () => () => {},
    };
    return ref;
  }
  function collection(path: string, filter?: (value: Record<string, unknown>) => boolean) {
    const query = {
      doc: (id: string) => doc(`${path}/${id}`),
      async get() {
        const docs = await Promise.all(
          [...data.keys()]
            .filter(
              (key) =>
                key.startsWith(`${path}/`) &&
                !key.slice(path.length + 1).includes('/') &&
                (!filter || filter(data.get(key)!)),
            )
            .map((key) => doc(key).get()),
        );
        return {
          docs,
          size: docs.length,
          exists: !!docs.length,
          data: () => undefined,
          forEach: docs.forEach.bind(docs),
        };
      },
      where: (field: string, _op: string, value: unknown) => collection(path, (item) => item[field] === value),
      orderBy: () => query,
      limit: () => query,
      onSnapshot: () => () => {},
    };
    return query;
  }
  const db = {
    collection,
    async runTransaction<T>(callback: (tx: FirestoreTransaction) => Promise<T>) {
      const tx: FirestoreTransaction = {
        get: (ref) => ref.get(),
        set(ref, value) {
          void ref.set(value);
          return tx;
        },
        update(ref, value) {
          void ref.update(value);
          return tx;
        },
      };
      return callback(tx);
    },
  } as unknown as FirestoreDbLike;
  return {
    db,
    data,
    deleted,
    fail: (path: string | null) => {
      failingPath = path;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('VITE_APP_EDITION', 'ios');
  localStorage.clear();
  fixture.legacyDb = null;
  fixture.deleteAuth.mockClear();
  fixture.signOutLegacy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const editions = await import('../src/platform/appEdition');
  const migration = await import('../src/platform/editionMigration');
  const { SK } = await import('../src/storage/keys');
  const { gs } = await import('../src/game/state');
  const client = await import('../src/firebase/client');
  return { editions, migration, SK, gs, client };
}

describe('edition isolation and preservation', () => {
  it('keeps original records and earned unlocks while new Duo counters start fresh', async () => {
    localStorage.setItem('sudoku_player_id', 'p_old-owner');
    localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify({ wins: 7, playCount: { 'tier0-standard': 5 } }));
    localStorage.setItem('sudoku_records', JSON.stringify({ 7: { time: 60, stars: 3 } }));
    const { migration, SK, client } = await setup();
    migration.prepareEditionMigration();
    client.bindPlayerIdentityToAuth('new-owner');
    migration.prepareEditionMigration();
    expect(JSON.parse(localStorage.getItem(SK.DUO_PROFILE)!)).toMatchObject({
      wins: 0,
      losses: 0,
      legacyPlayCount: { 'tier0-standard': 5 },
    });
    expect(migration.getLegacyHistory().duoProfile).toMatchObject({ wins: 7 });
    expect(JSON.parse(localStorage.getItem(SK.RECORDS)!)[7]).toEqual({ time: 60, stars: 3 });
    expect(localStorage.getItem(SK.LEGACY_PLAYER_ID)).toBeNull();
    expect(migration.readEditionMigration()?.sourcePlayerId).toBe('p_old-owner');
    const { loadDuoProfile, getUnlockedTiers, getUnlockedModes } = await import('../src/features/duo/duoProfile');
    expect(getUnlockedTiers(loadDuoProfile())).toContain('tierI');
    expect(getUnlockedModes(loadDuoProfile())).toContain('noNotes');
  });

  it('finishes an old room in its original realm, then blocks creating another legacy room', async () => {
    localStorage.setItem('sudoku_duo_active_room_id', 'r_original123');
    localStorage.setItem('sudoku_duo_active_role', 'host');
    const { editions, migration } = await setup();
    expect(editions.ACTIVE_EDITION).toBe('legacy');
    migration.prepareEditionMigration();
    expect(migration.readEditionMigration()).toBeNull();
    localStorage.removeItem('sudoku_duo_active_room_id');
    expect(editions.mustTransitionEdition()).toBe(true);
    expect(editions.editionDuoHost()).toContain('duo-party.');
  });

  it('separates edition namespaces and distinguishes mode, changed puzzles and invalid boards', async () => {
    const { editions } = await setup();
    const { leaderboardKey } = await import('../src/platform/leaderboardScope');
    const classic = leaderboardKey(7, fixture.puzzle, 'classic');
    expect(editions.editionCollection('player_profiles')).toBe('editions/ios/player_profiles');
    expect(editions.editionProject()).toBe('sudokuzen-ios-prod');
    expect(leaderboardKey(7, fixture.puzzle, 'speed')).not.toBe(classic);
    expect(
      leaderboardKey(
        7,
        fixture.puzzle.map(() => 0),
        'classic',
      ),
    ).not.toBe(classic);
    expect(leaderboardKey(7, [1, 2], 'classic')).toBeNull();
    expect(() => editions.assertEditionProject({ projectId: 'sudokuzen-f2aa3' })).toThrow();
  });

  it('retries an interrupted cloud archive without importing old wins into the new counter', async () => {
    localStorage.setItem('sudoku_player_id', 'p_old-owner');
    localStorage.setItem('sudoku_player_alias', 'Tester');
    const source = memoryDb({
      'player_profiles/p_old-owner': {
        records: { 7: { time: 70, stars: 3 } },
        achievements: {},
        practiceRecords: { 701: { time: 50, stars: 3, techKey: 'naked_single' } },
        journey: {
          teachRead: { cloudLesson: true },
          practiceDone: { cloudPractice: true },
          techniquesUsed: ['hidden_single'],
          duoProfile: { wins: 9, losses: 2, playCount: { 'tier0-standard': 12 } },
        },
      },
    });
    fixture.legacyDb = source.db;
    const target = memoryDb();
    const { migration, SK, gs, client } = await setup();
    migration.prepareEditionMigration();
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ localLesson: true }));
    localStorage.setItem(SK.PRACTICE_DONE, JSON.stringify({ localPractice: true }));
    localStorage.setItem(SK.TECHNIQUES_USED, JSON.stringify(['naked_single']));
    localStorage.setItem(
      SK.PRACTICE_RECORDS,
      JSON.stringify({ 702: { time: 60, stars: 3, techKey: 'hidden_single' } }),
    );
    client.bindPlayerIdentityToAuth('new-owner');
    Object.assign(gs, { firebaseReady: true, db: target.db });
    const archivePath = 'editions/ios/player_profiles/p_new-owner/legacy_history/part_00000';
    target.fail(archivePath);
    await client.hydratePlayerProfileFromCloud();
    expect(migration.readEditionMigration()?.cloudImported).toBe(false);
    target.fail(null);
    await client.hydratePlayerProfileFromCloud();
    expect(migration.readEditionMigration()?.cloudImported).toBe(true);
    expect(JSON.parse(localStorage.getItem(SK.DUO_PROFILE)!)).toMatchObject({
      wins: 0,
      losses: 0,
      legacyPlayCount: { 'tier0-standard': 12 },
    });
    expect(JSON.parse(localStorage.getItem(SK.RECORDS)!)[7]).toMatchObject({ time: 70, stars: 3 });
    expect(JSON.parse(localStorage.getItem(SK.PRACTICE_RECORDS)!)[701]).toMatchObject({
      stars: 3,
      techKey: 'naked_single',
    });
    expect(JSON.parse(localStorage.getItem(SK.PRACTICE_RECORDS)!)[702]).toMatchObject({
      stars: 3,
      techKey: 'hidden_single',
    });
    expect(JSON.parse(localStorage.getItem(SK.TEACH_READ)!)).toEqual({ localLesson: true, cloudLesson: true });
    expect(JSON.parse(localStorage.getItem(SK.PRACTICE_DONE)!)).toEqual({ localPractice: true, cloudPractice: true });
    expect(JSON.parse(localStorage.getItem(SK.TECHNIQUES_USED)!)).toEqual(['naked_single', 'hidden_single']);
    expect(JSON.parse(String(target.data.get(archivePath)?.payload)).duoProfile.wins).toBe(9);
    expect(source.deleted).toHaveLength(0);
    expect([...target.data.keys()].every((key) => key.startsWith('editions/ios/'))).toBe(true);
  });

  it('keeps first clear immutable per board and creates an owner catalog atomically', async () => {
    const { gs, client } = await setup();
    const target = memoryDb();
    localStorage.setItem('sudoku_player_id', 'p_new-owner');
    localStorage.setItem('sudoku_player_alias', 'Tester');
    Object.assign(gs, { firebaseReady: true, db: target.db, isDuoMode: false, isSpeedrunMode: false });
    await client.submitFirstClear(7, 60, 3);
    await client.submitFirstClear(7, 50, 3);
    const classic = [...target.data.keys()].find((key) => key.includes('/level_first_clears/classic_'))!;
    expect(target.data.get(classic)?.firstTimeSec).toBe(60);
    Object.assign(gs, { isSpeedrunMode: true, submissionCount: 1 });
    const pendingSpeed = client.submitFirstClear(7, 50, 2);
    gs.submissionCount = 99; // Moving to another game while Firestore is pending.
    await pendingSpeed;
    const speed = [...target.data.keys()].find((key) => key.includes('/level_first_clears/speed_'))!;
    expect(target.data.get(speed)).toMatchObject({ firstStars: 0, firstSubmissions: 2, mode: 'speed', edition: 'ios' });
    expect([...target.data.keys()].filter((key) => key.includes('/score_owners/'))).toHaveLength(2);
  });

  it('account deletion removes only the current edition and leaves old and PWA data intact', async () => {
    const { gs, client } = await setup();
    localStorage.setItem('sudoku_player_id', 'p_new-owner');
    localStorage.setItem('sudoku_player_alias', 'Tester');
    const realm = 'editions/ios';
    const player = 'p_new-owner';
    const board = `classic_7_${fixture.puzzle.join('')}`;
    const target = memoryDb({
      [`${realm}/player_profiles/${player}`]: { ownerUid: 'new-owner' },
      [`${realm}/player_profiles/${player}/game_saves/sudoku_save_7`]: { ownerUid: 'new-owner' },
      [`${realm}/player_profiles/${player}/legacy_history/summary`]: { ownerUid: 'new-owner' },
      [`${realm}/score_owners/${player}/entries/${board}`]: { ownerUid: 'new-owner' },
      [`${realm}/level_first_clears/${board}/players/${player}`]: { ownerUid: 'new-owner' },
      [`${realm}/presence/${player}`]: { ownerUid: 'new-owner' },
      [`${realm}/duo_ws_rooms/r_owned`]: { hostOwnerUid: 'new-owner' },
      [`${realm}/duo_ws_rooms/r_other`]: { hostOwnerUid: 'other-owner' },
      [`editions/pwa/player_profiles/${player}`]: { ownerUid: 'new-owner' },
      [`player_profiles/p_old-owner`]: { ownerUid: 'old-owner' },
    });
    Object.assign(gs, { firebaseReady: true, db: target.db });
    await client.deletePlayerData();
    expect(fixture.deleteAuth).toHaveBeenCalledOnce();
    expect(fixture.signOutLegacy).toHaveBeenCalledOnce();
    expect(target.deleted.every((path) => path.startsWith(`${realm}/`))).toBe(true);
    expect([...target.data.keys()]).toEqual([
      `${realm}/duo_ws_rooms/r_other`,
      `editions/pwa/player_profiles/${player}`,
      'player_profiles/p_old-owner',
    ]);
  });
});
