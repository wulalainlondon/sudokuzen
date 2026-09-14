// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const manifest = {
  version: 'manifest-version',
  totalLevels: 1,
  shards: { normal: { file: 'normal.json', count: 1, size: 1, hash: 'normal-content-hash' } },
};
const levels = [{ id: 1, p: Array(81).fill(0), sl: Array(81).fill(1), s: 1, dn: 'Easy', dp: 'One' }];
const response = (value: unknown) => ({ ok: true, json: vi.fn(async () => value) });

describe('concurrent data loading and recovery', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares the request and parsing across all three startup callers', async () => {
    const shard = response(levels);
    const fetch = vi.fn().mockResolvedValueOnce(response(manifest)).mockResolvedValueOnce(shard);
    vi.stubGlobal('fetch', fetch);
    const { getNormalLevels } = await import('../src/data/dataRegistry');
    const [a, b, c] = await Promise.all([getNormalLevels(), getNormalLevels(), getNormalLevels()]);
    expect(fetch).toHaveBeenCalledTimes(2); // One manifest plus one shard.
    expect(shard.json).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a[0].id).toBe(1);
    expect(fetch.mock.calls[1][0]).toContain('normal.json?v=normal-content-hash');
  });

  it('retries a failed shard instead of caching an empty result', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(manifest))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(levels));
    vi.stubGlobal('fetch', fetch);
    const { getNormalLevels } = await import('../src/data/dataRegistry');
    expect(await getNormalLevels()).toEqual([]);
    expect(await getNormalLevels()).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('bounds a stuck manifest and permits a fresh request even if the old fetch ignores abort', async () => {
    vi.useFakeTimers();
    let finishOld: (value: unknown) => void = () => {};
    const fetch = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(response(manifest));
    vi.stubGlobal('fetch', fetch);
    const { getDataManifest } = await import('../src/data/dataRegistry');
    const first = getDataManifest();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await first).toBeNull();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await getDataManifest()).toEqual(manifest);
    finishOld(response({ ...manifest, version: 'obsolete' }));
    await vi.advanceTimersByTimeAsync(0);
    expect((await getDataManifest())?.version).toBe(manifest.version);
  });

  it('bounds a stalled shard body and clears its in-flight entry for retry', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(manifest))
      .mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) })
      .mockResolvedValueOnce(response(levels));
    vi.stubGlobal('fetch', fetch);
    const { getNormalLevels } = await import('../src/data/dataRegistry');
    const pending = getNormalLevels();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toEqual([]);
    expect(await getNormalLevels()).toHaveLength(1);
  });

  it('also shares teaching shard loads and uses the per-module content hash', async () => {
    const module = { name: 'A', technique: 'naked_single' };
    const shard = response(module);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ version: 'all-teach', modules: { '1': { hash: 'teach-one' } } }))
      .mockResolvedValueOnce(shard);
    vi.stubGlobal('fetch', fetch);
    const { getTeachShard } = await import('../src/data/dataRegistry');
    const values = await Promise.all([getTeachShard(1), getTeachShard(1)]);
    expect(values).toEqual([module, module]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(shard.json).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[1][0]).toContain('1.json?v=teach-one');
  });
});
