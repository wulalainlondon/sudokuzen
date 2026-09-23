// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { getWildProfile } from '../src/features/wild/wildController';
import { loadWildProfile, mergeWildProfiles, saveWildProfile } from '../src/features/wild/wildState';
import { SK } from '../src/storage/keys';

beforeEach(() => localStorage.clear());

it('writes a completed World record before a reload can interrupt it', () => {
  const profile = loadWildProfile();
  profile.totalExp = 200;
  profile.puzzlesCompleted = 4;
  saveWildProfile(profile);
  expect(JSON.parse(localStorage.getItem(SK.WILD_PROFILE)!)).toMatchObject({ totalExp: 200, puzzlesCompleted: 4 });
});

it('does not keep a controller profile from before a later restore', () => {
  const initial = loadWildProfile();
  initial.totalExp = 100;
  saveWildProfile(initial);
  expect(getWildProfile().totalExp).toBe(100);
  const restored = {
    ...loadWildProfile(),
    totalExp: 300,
    iqLevel: 8,
    puzzlesCompleted: 10,
    currentSession: { round: 7, wins: 5, totalExp: 120, techniques: ['naked_single'] },
  };
  localStorage.setItem(SK.WILD_PROFILE, JSON.stringify(restored));
  expect(getWildProfile()).toMatchObject({ totalExp: 300, iqLevel: 8, puzzlesCompleted: 10 });
  const stale = { ...initial, totalExp: 120, puzzlesCompleted: 1 };
  saveWildProfile(stale);
  expect(loadWildProfile()).toMatchObject({ totalExp: 300, iqLevel: 8, puzzlesCompleted: 10 });
  expect(loadWildProfile().currentSession?.round).toBe(7);
});

it('merges distinct bestiary and study progress without rolling counts back', () => {
  const local = loadWildProfile();
  local.totalExp = 280;
  local.bestiary.naked_single = {
    discovered: '2026-09-18',
    encounters: 4,
    kills: 2,
    escapes: 1,
    bestTime: 70,
    modesCleared: ['standard'],
  };
  local.studiedSkills = ['naked_single'];
  const remote = { ...loadWildProfile(), totalExp: 310, puzzlesCompleted: 8 };
  remote.bestiary = {
    naked_single: {
      discovered: '2026-09-15',
      encounters: 3,
      kills: 3,
      escapes: 0,
      bestTime: 55,
      modesCleared: ['blind'],
    },
    hidden_single: {
      discovered: '2026-09-19',
      encounters: 1,
      kills: 1,
      escapes: 0,
      bestTime: 90,
      modesCleared: ['standard'],
    },
  };
  const merged = mergeWildProfiles(remote, local);
  expect(merged).toMatchObject({ totalExp: 310, puzzlesCompleted: 8, studiedSkills: ['naked_single'] });
  expect(merged.bestiary.naked_single).toMatchObject({ encounters: 4, kills: 3, escapes: 1, bestTime: 55 });
  expect(merged.bestiary.naked_single.modesCleared).toEqual(['blind', 'standard']);
  expect(merged.bestiary.hidden_single.kills).toBe(1);
});
