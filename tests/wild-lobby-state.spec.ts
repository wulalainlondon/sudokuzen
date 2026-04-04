import { describe, expect, it } from 'vitest';
import { computeEnterButtonState } from '../src/features/wild/wildLobby';
import { bridgeOpenWildMentorNote, bridgeCloseWildMentorNote, bridgeHasWildMentorNoteOpen } from '../src/react/wild/wildLobbyBridge';
import { useWildLobbyStore } from '../src/react/wild/wildLobbyStore';

describe('wild lobby enter state machine', () => {
  const baseProfile = {
    iqLevel: 1,
    totalExp: 0,
    gateOverflowExp: 0,
    puzzlesCompleted: 0,
    totalEncounters: 0,
    cooldowns: {},
    bestiary: {},
    battlefieldMode: 'knight' as const,
    autoCastEnabled: true,
    currentSession: null,
    fragments: {},
    studiedSkills: [],
  };

  it('returns resume_saved when saved encounter exists', () => {
    expect(computeEnterButtonState({ ...baseProfile }, true)).toBe('resume_saved');
  });

  it('returns session_continue for active session rounds', () => {
    expect(
      computeEnterButtonState(
        { ...baseProfile, iqLevel: 30, currentSession: { round: 4, wins: 1, totalExp: 10, techniques: [] } },
        false,
      ),
    ).toBe('session_continue');
  });

  it('returns session_new when level gate reached without active session', () => {
    expect(computeEnterButtonState({ ...baseProfile, iqLevel: 25 }, false)).toBe('session_new');
  });

  it('returns idle for newbie free roam', () => {
    expect(computeEnterButtonState({ ...baseProfile, iqLevel: 8 }, false)).toBe('idle');
  });
});

describe('wild mentor note modal bridge', () => {
  it('opens and closes mentor note state', () => {
    useWildLobbyStore.getState().closeMentorNote();
    expect(bridgeHasWildMentorNoteOpen()).toBe(false);
    bridgeOpenWildMentorNote('A', 'B');
    expect(bridgeHasWildMentorNoteOpen()).toBe(true);
    bridgeCloseWildMentorNote();
    expect(bridgeHasWildMentorNoteOpen()).toBe(false);
  });
});
