// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SK } from '../src/storage/keys';
import {
  computeUnlockState,
  TREE,
  UNLOCK_THRESHOLD,
} from '../src/features/practice/practiceLobby';

// Helper: build practice records where each entry has { techKey, time, stars }
function buildRecords(entries: Array<{ techKey: string; count: number }>): Record<string, any> {
  const records: Record<string, any> = {};
  let id = 9000;
  for (const { techKey, count } of entries) {
    for (let i = 0; i < count; i++) {
      records[id++] = { techKey, time: 60, stars: 3 };
    }
  }
  return records;
}

describe('practice unlock tree', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fresh state — only naked_single is unlocked, all others locked', () => {
    const state = computeUnlockState();
    const ns = state.get('naked_single');
    expect(ns).toBeDefined();
    expect(ns!.status).toBe('unlocked');

    for (const [key, val] of state.entries()) {
      if (key !== 'naked_single') {
        expect(val.status).toBe('locked');
      }
    }
  });

  it('clearing 3 levels of naked_single unlocks hidden_single', () => {
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(
      buildRecords([{ techKey: 'naked_single', count: 3 }]),
    ));
    const state = computeUnlockState();
    expect(state.get('hidden_single')!.status).not.toBe('locked');
  });

  it('clearing only 2 levels of naked_single — hidden_single still locked', () => {
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(
      buildRecords([{ techKey: 'naked_single', count: 2 }]),
    ));
    const state = computeUnlockState();
    expect(state.get('hidden_single')!.status).toBe('locked');
  });

  it('clearing all 25 of naked_single — status should be completed', () => {
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(
      buildRecords([{ techKey: 'naked_single', count: 25 }]),
    ));
    const state = computeUnlockState();
    expect(state.get('naked_single')!.status).toBe('completed');
  });

  it('clearing partial levels — status should be partial', () => {
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(
      buildRecords([{ techKey: 'naked_single', count: 10 }]),
    ));
    const state = computeUnlockState();
    expect(state.get('naked_single')!.status).toBe('partial');
    expect(state.get('naked_single')!.cleared).toBe(10);
  });

  it('phase 2 branching: hidden_triple 3+ unlocks x_wing, x_cycle_simple_coloring, unique_rectangle', () => {
    // Need to unlock all prerequisites up to hidden_triple
    const prereqs = [
      { techKey: 'naked_single', count: 3 },
      { techKey: 'hidden_single', count: 3 },
      { techKey: 'locked_candidates', count: 3 },
      { techKey: 'naked_pair', count: 3 },
      { techKey: 'hidden_pair', count: 3 },
      { techKey: 'naked_triple', count: 3 },
      { techKey: 'hidden_triple', count: 3 },
    ];
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(buildRecords(prereqs)));
    const state = computeUnlockState();

    // All three branches should be unlocked (not locked)
    expect(state.get('x_wing')!.status).not.toBe('locked');
    expect(state.get('x_cycle_simple_coloring')!.status).not.toBe('locked');
    expect(state.get('unique_rectangle')!.status).not.toBe('locked');
  });

  it('medusa_3d unlocks when ANY ONE of (empty_rectangle, remote_pairs, als_chain) has 3+ clears', () => {
    // Build full path to empty_rectangle through the fish/wing branch
    const prereqs = [
      { techKey: 'naked_single', count: 3 },
      { techKey: 'hidden_single', count: 3 },
      { techKey: 'locked_candidates', count: 3 },
      { techKey: 'naked_pair', count: 3 },
      { techKey: 'hidden_pair', count: 3 },
      { techKey: 'naked_triple', count: 3 },
      { techKey: 'hidden_triple', count: 3 },
      { techKey: 'x_wing', count: 3 },
      { techKey: 'finned_x_wing', count: 3 },
      { techKey: 'swordfish', count: 3 },
      { techKey: 'finned_swordfish', count: 3 },
      { techKey: 'jellyfish', count: 3 },
      { techKey: 'finned_jellyfish', count: 3 },
      { techKey: 'skyscraper', count: 3 },
      { techKey: 'two_string_kite', count: 3 },
      { techKey: 'empty_rectangle', count: 3 },
    ];
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(buildRecords(prereqs)));
    const state = computeUnlockState();

    // medusa_3d should be unlocked because empty_rectangle has 3+ clears
    expect(state.get('medusa_3d')!.status).not.toBe('locked');
  });

  it('medusa_3d should NOT unlock if none of the 3 branch ends have 3 clears', () => {
    // Only clear the phase 1 prerequisites, not any branch end to 3
    const prereqs = [
      { techKey: 'naked_single', count: 3 },
      { techKey: 'hidden_single', count: 3 },
      { techKey: 'locked_candidates', count: 3 },
      { techKey: 'naked_pair', count: 3 },
      { techKey: 'hidden_pair', count: 3 },
      { techKey: 'naked_triple', count: 3 },
      { techKey: 'hidden_triple', count: 3 },
      { techKey: 'empty_rectangle', count: 2 },
      { techKey: 'remote_pairs', count: 2 },
      { techKey: 'als_chain', count: 2 },
    ];
    localStorage.setItem(SK.PRACTICE_RECORDS, JSON.stringify(buildRecords(prereqs)));
    const state = computeUnlockState();

    expect(state.get('medusa_3d')!.status).toBe('locked');
  });

  it('total technique count should be 41', () => {
    expect(TREE.length).toBe(41);
  });

  it('all techniques in TREE should have unique keys', () => {
    const keys = TREE.map((n) => n.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('UNLOCK_THRESHOLD is 3', () => {
    expect(UNLOCK_THRESHOLD).toBe(3);
  });
});
