import { describe, expect, it } from 'vitest';
import {
  getReplayHistory,
  sanitizeReplayHistory,
  toClassicLevelRecord,
  toSpeedLevelRecord,
} from '../src/shared/records/levelRecords';

describe('level record replay sanitization', () => {
  it('keeps only valid replay actions and normalizes values', () => {
    const history = sanitizeReplayHistory([
      { t: 12.8, type: 'fill', detail: 'r1c1=1', idx: '8.9', val: '3.2', notes: [1, '2', 0, 10, 9.8] },
      { t: 1, type: 'unknown', detail: 'bad type' },
      { t: 2, type: 'mistake', detail: '' },
      { t: 5, type: 'note', detail: 'note set', notes: [1, 4, 7] },
      { t: 9, type: 'erase', detail: 'bad notes shape', notes: '123' },
    ]);

    expect(history).toEqual([
      { t: 12, type: 'fill', detail: 'r1c1=1', idx: 8, val: 3, notes: [1, 2] },
      { t: 5, type: 'note', detail: 'note set', idx: null, val: null, notes: [1, 4, 7] },
    ]);
  });

  it('normalizes classic and speed records safely', () => {
    expect(toClassicLevelRecord(123)).toEqual({ time: 123, stars: 1, replayHistory: [] });

    const classic = toClassicLevelRecord({
      time: -12.5,
      stars: 8,
      techKey: 'xy_wing',
      replayHistory: [{ t: -4, type: 'eliminate', detail: 'rm 3', idx: 9, val: 3 }],
    });
    expect(classic).toEqual({
      time: 0,
      stars: 3,
      techKey: 'xy_wing',
      replayHistory: [{ t: 0, type: 'eliminate', detail: 'rm 3', idx: 9, val: 3, notes: null }],
    });

    const speed = toSpeedLevelRecord({
      time: '83.9',
      submissions: 0,
      replayHistory: [{ t: 1, type: 'quick_note', detail: 'q', notes: [] }],
    });
    expect(speed).toEqual({
      time: 83,
      submissions: 1,
      replayHistory: [{ t: 1, type: 'quick_note', detail: 'q', idx: null, val: null, notes: [] }],
    });
  });

  it('returns empty replay history for malformed containers', () => {
    expect(getReplayHistory(null)).toEqual([]);
    expect(getReplayHistory({ replayHistory: { bad: true } })).toEqual([]);
  });
});
