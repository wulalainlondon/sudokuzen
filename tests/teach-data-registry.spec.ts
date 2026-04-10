// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('teach data registry resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('retries teach manifest after a transient failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: 'v1',
          totalModules: 1,
          modules: { '1': { technique: 'naked_single', name: 'A', subtitle: '', hasPractice: true, size: 1 } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const mod = await import('../src/data/dataRegistry');
    const first = await mod.getTeachManifest();
    expect(first).toBeNull();

    const second = await mod.getTeachManifest();
    expect(second?.version).toBe('v1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
