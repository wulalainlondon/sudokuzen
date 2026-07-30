// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { hydratePlayerProfileFromCloud } from '../src/firebase/client';
import { gs } from '../src/game/state';
import { SK, readJson, writeJson } from '../src/storage/keys';

type DocData = Record<string, unknown>;

function makeDoc(data: DocData) {
  return {
    exists: true,
    data: () => data,
  };
}

function makeEmptySnap() {
  return { docs: [] };
}

function makeProfileDb(profileData: DocData) {
  const profileDoc = {
    get: async () => makeDoc(profileData),
    collection: (name: string) => {
      if (name !== 'game_saves') {
        throw new Error(`unexpected nested collection: ${name}`);
      }
      return {
        get: async () => makeEmptySnap(),
      };
    },
  };

  return {
    collection(name: string) {
      if (name === 'player_profiles') {
        return {
          doc(id: string) {
            if (id !== 'player-1') {
              throw new Error(`unexpected doc id: ${id}`);
            }
            return profileDoc;
          },
        };
      }
      if (name === 'alias_player_index') {
        return {
          doc() {
            return {
              get: async () => ({ exists: false, data: () => null }),
              set: async () => {},
            };
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

describe('firebase client record normalization', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(gs as unknown as Record<string, unknown>, {
      firebaseReady: true,
      db: null,
      aliasInputEl: null,
    });
    localStorage.setItem(SK.PLAYER_ID, 'player-1');
    localStorage.setItem(SK.PLAYER_ALIAS, 'Tester');
  });

  it('sanitizes replayHistory during classic record hydrate/merge without changing stars/time selection', async () => {
    writeJson(SK.RECORDS, {
      7: {
        time: 100,
        stars: 2,
        replayHistory: [{ t: 1, type: 'fill', detail: 'ok', idx: 3, val: 4, notes: [1, 'x'] }, { bad: true }],
      },
    });

    Object.assign(gs as unknown as Record<string, unknown>, {
      db: makeProfileDb({
        records: {
          7: {
            time: 90,
            stars: 3,
            replayHistory: [{ t: -1, type: 'mistake', detail: 'oops', notes: [9, 10] }, null],
          },
        },
        speedRecords: {},
        achievements: {},
        settings: {},
      }),
    });

    await hydratePlayerProfileFromCloud();

    const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(records[7]).toEqual({
      time: 90,
      stars: 3,
      replayHistory: [{ t: 0, type: 'mistake', detail: 'oops', idx: null, val: null, notes: [9] }],
    });
  });

  it('sanitizes replayHistory during speed record hydrate/merge without changing submissions/time selection', async () => {
    writeJson(SK.SPEED_RECORDS, {
      12: {
        time: 50,
        submissions: 3,
        replayHistory: [{ t: 1, type: 'note', detail: 'local', notes: [2, 11] }],
      },
    });

    Object.assign(gs as unknown as Record<string, unknown>, {
      db: makeProfileDb({
        records: {},
        speedRecords: {
          12: {
            time: 70,
            submissions: 1,
            replayHistory: [
              { t: 4, type: 'quick_note', detail: 'remote', notes: ['3', 0] },
              { t: 8, type: 'bad', detail: 'drop me' },
            ],
          },
        },
        achievements: {},
        settings: {},
      }),
    });

    await hydratePlayerProfileFromCloud();

    const speedRecords = readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {});
    expect(speedRecords[12]).toEqual({
      time: 70,
      submissions: 1,
      replayHistory: [{ t: 4, type: 'quick_note', detail: 'remote', idx: null, val: null, notes: [3] }],
    });
  });

  it('restores remote Duo progress when a reinstalled PWA already has an empty local profile', async () => {
    writeJson(SK.DUO_PROFILE, {});
    writeJson(SK.DUO_RECORDS, {});

    Object.assign(gs as unknown as Record<string, unknown>, {
      db: makeProfileDb({
        records: {},
        speedRecords: {},
        achievements: {},
        settings: {},
        journey: {
          duoProfile: {
            playCount: {
              'tier0-standard': 1,
              'tierI-standard': 7,
              'tierII-standard': 89,
              'tierIII-standard': 9,
              'tierIV-standard': 2,
            },
            wins: 40,
            losses: 63,
            draws: 5,
            currentStreak: 0,
            bestStreak: 14,
            rivals: { mm: { wins: 40, losses: 63 } },
          },
          duoRecords: {
            wins: { mm: 2, Steven: 0 },
            streak: 2,
            streakHolder: 'mm',
          },
        },
      }),
    });

    await hydratePlayerProfileFromCloud();

    expect(readJson(SK.DUO_PROFILE, {})).toEqual({
      playCount: {
        'tier0-standard': 1,
        'tierI-standard': 7,
        'tierII-standard': 89,
        'tierIII-standard': 9,
        'tierIV-standard': 2,
      },
      wins: 40,
      losses: 63,
      draws: 5,
      currentStreak: 0,
      bestStreak: 14,
      rivals: { mm: { wins: 40, losses: 63 } },
    });
    expect(readJson(SK.DUO_RECORDS, {})).toEqual({
      wins: { mm: 2, Steven: 0 },
      streak: 2,
      streakHolder: 'mm',
    });
  });

  it('merges Duo snapshots without rolling back newer local match progress', async () => {
    writeJson(SK.DUO_PROFILE, {
      playCount: { 'tierII-standard': 90 },
      wins: 41,
      losses: 63,
      draws: 5,
      currentStreak: 1,
      bestStreak: 14,
      rivals: { mm: { wins: 41, losses: 63 } },
    });

    Object.assign(gs as unknown as Record<string, unknown>, {
      db: makeProfileDb({
        records: {},
        speedRecords: {},
        achievements: {},
        settings: {},
        journey: {
          duoProfile: {
            playCount: { 'tierI-standard': 7, 'tierII-standard': 89 },
            wins: 40,
            losses: 63,
            draws: 5,
            currentStreak: 0,
            bestStreak: 14,
            rivals: { mm: { wins: 40, losses: 63 } },
          },
        },
      }),
    });

    await hydratePlayerProfileFromCloud();

    expect(readJson(SK.DUO_PROFILE, {})).toEqual({
      playCount: { 'tierI-standard': 7, 'tierII-standard': 90 },
      wins: 41,
      losses: 63,
      draws: 5,
      currentStreak: 1,
      bestStreak: 14,
      rivals: { mm: { wins: 41, losses: 63 } },
    });
  });

  it('does not invent legacy Duo records for a player with no Duo history', async () => {
    Object.assign(gs as unknown as Record<string, unknown>, {
      db: makeProfileDb({
        records: {},
        speedRecords: {},
        achievements: {},
        settings: {},
        journey: {},
      }),
    });

    await hydratePlayerProfileFromCloud();

    expect(localStorage.getItem(SK.DUO_RECORDS)).toBeNull();
  });
});
