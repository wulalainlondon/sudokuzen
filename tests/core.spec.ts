import { describe, expect, it } from 'vitest';
import { formatSeconds } from '../src/game/utils';
import { filterReplayActions } from '../src/replay/filter';
import { hashStringToSeed, pickDailyIndex } from '../src/game/levelSelector';

describe('core helpers', () => {
  it('formats seconds', () => {
    expect(formatSeconds(0)).toBe('00:00');
    expect(formatSeconds(125)).toBe('02:05');
  });

  it('filters replay actions', () => {
    const actions = [{ type: 'fill' }, { type: 'mistake' }, { type: 'erase' }];
    expect(filterReplayActions(actions, 'all')).toHaveLength(3);
    expect(filterReplayActions(actions, 'mistake')).toHaveLength(1);
    expect(filterReplayActions(actions, 'key')).toHaveLength(2);
  });

  it('builds stable daily index', () => {
    const seed = hashStringToSeed('2026-03-24-tab0');
    expect(pickDailyIndex(seed, 100)).toBe(seed % 100);
  });
});
