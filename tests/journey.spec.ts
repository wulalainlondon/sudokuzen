// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { getJourneyState, getJourneyLockMessage, JOURNEY_GATES } from '../src/features/journey';
import { SK } from '../src/storage/keys';

function buildPracticeRecords(techniques: string[]): Record<string, unknown> {
  const records: Record<string, unknown> = {};
  techniques.forEach((technique, techIndex) => {
    for (let i = 0; i < 3; i++) {
      records[`${techIndex}-${i}`] = { time: 20, stars: 3, techKey: technique, replayHistory: [] };
    }
  });
  return records;
}

describe('journey rollout policy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts in the prologue with later modes visibly gated', () => {
    const state = getJourneyState();
    expect(state.currentChapter).toBe('prologue');
    expect(state.practiceUnlocked).toBe(false);
    expect(state.worldUnlocked).toBe(false);
    expect(state.duoUnlocked).toBe(false);
  });

  it('unlocks Practice after three normal clears', () => {
    localStorage.setItem(
      SK.RECORDS,
      JSON.stringify({
        1: { time: 30, stars: 3 },
        2: { time: 31, stars: 3 },
        3: { time: 32, stars: 3 },
      }),
    );
    const state = getJourneyState();
    expect(state.normalClears).toBe(JOURNEY_GATES.practiceNormalClears);
    expect(state.practiceUnlocked).toBe(true);
    expect(state.worldUnlocked).toBe(false);
    expect(state.currentChapter).toBe('practice');
  });

  it('counts a technique only after study, three practices, and field proof', () => {
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true }));
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(buildPracticeRecords(['naked_single'])));
    localStorage.setItem(SK.TECHNIQUES_USED, JSON.stringify(['naked_single']));

    const state = getJourneyState();
    expect(state.verifiedTechniques).toEqual(['naked_single']);
    expect(state.verifiedLevel).toBe(1);
    expect(state.worldUnlocked).toBe(true);
    expect(state.duoUnlocked).toBe(false);
  });

  it('does not unlock World from reading a lesson alone', () => {
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true }));

    const state = getJourneyState();
    expect(state.teachReadCount).toBe(1);
    expect(state.verifiedLevel).toBe(0);
    expect(state.worldUnlocked).toBe(false);
  });

  it('unlocks Duo at verified training level three', () => {
    const techniques = ['naked_single', 'hidden_single', 'locked_candidates'];
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true, 2: true, 3: true }));
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(buildPracticeRecords(techniques)));
    localStorage.setItem(SK.TECHNIQUES_USED, JSON.stringify(techniques));

    const state = getJourneyState();
    expect(state.verifiedLevel).toBe(JOURNEY_GATES.duoVerifiedTechniques);
    expect(state.duoUnlocked).toBe(true);
    expect(state.currentChapter).toBe('duo');
  });

  it('grandfathers players who already used World or Duo', () => {
    localStorage.setItem(SK.WILD_PROFILE, JSON.stringify({ iqLevel: 1, totalEncounters: 1 }));
    expect(getJourneyState().worldUnlocked).toBe(true);

    localStorage.clear();
    localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify({ playCount: { 'tier0-standard': 1 } }));
    const duoState = getJourneyState();
    expect(duoState.practiceUnlocked).toBe(true);
    expect(duoState.worldUnlocked).toBe(true);
    expect(duoState.duoUnlocked).toBe(true);

    localStorage.clear();
    localStorage.setItem(SK.DUO_RECORDS, JSON.stringify({ legacyRoom: { result: 'win' } }));
    const legacyDuoState = getJourneyState();
    expect(legacyDuoState.duoPlays).toBe(1);
    expect(legacyDuoState.duoUnlocked).toBe(true);
  });

  it('keeps every mode open for a player upgrading from the pre-journey PWA', () => {
    localStorage.setItem(SK.LEGACY_PLAYER_ID, 'p_legacy_install_123');

    const state = getJourneyState();
    expect(state.normalClears).toBe(0);
    expect(state.verifiedLevel).toBe(0);
    expect(state.practiceUnlocked).toBe(true);
    expect(state.worldUnlocked).toBe(true);
    expect(state.duoUnlocked).toBe(true);
    expect(state.currentChapter).toBe('duo');
  });

  it('explains the next gate with current progress', () => {
    expect(getJourneyLockMessage('practice')).toContain('0/3');
    expect(getJourneyLockMessage('world')).toContain('Lv.0/1');
    expect(getJourneyLockMessage('duo')).toContain('Lv.0');
  });
});
