import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ failed: true }));
const shards = {
  T03: [
    { id: 1, puzzle: Array(81).fill(1), solution: Array(81).fill(1) },
    { id: 2, puzzle: Array(81).fill(2), solution: Array(81).fill(2) },
  ],
  T04: [
    { id: 3, puzzle: Array(81).fill(3), solution: Array(81).fill(3) },
    { id: 4, puzzle: Array(81).fill(4), solution: Array(81).fill(4) },
  ],
};

vi.mock('../src/data/dataRegistry', () => ({
  getDataManifest: async () => ({ shards: { 'duo-T03': { count: 2 }, 'duo-T04': { count: 2 } } }),
  loadDuoShard: async (key: 'T03' | 'T04') => (key === 'T03' && state.failed ? [] : shards[key]),
}));

describe('Duo puzzle pool', () => {
  beforeEach(() => {
    vi.resetModules();
    state.failed = true;
  });

  it('never caches a partial tier or selects a different board after a shard fetch fails', async () => {
    const { loadDuoTierPuzzles, pickDuoPuzzle, duoPuzzleFingerprint } = await import('../src/features/duo/duoTiers');
    expect(await loadDuoTierPuzzles('tierIII')).toEqual([]);
    expect(await pickDuoPuzzle('tierIII', 0)).toBeNull();

    state.failed = false;
    const recovered = await loadDuoTierPuzzles('tierIII');
    expect(recovered.map((level) => level.id)).toEqual([1, 2, 3, 4]);
    expect(duoPuzzleFingerprint((await pickDuoPuzzle('tierIII', 0))!)).toBe(`p81:${'1'.repeat(81)}`);
  });
});
