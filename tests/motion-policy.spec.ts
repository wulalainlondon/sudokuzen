// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { buildMotionPolicy } from '../src/shared/motion/policy';

describe('motion policy', () => {
  it('disables advanced effects under reduced motion', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 12 });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    });

    const policy = buildMotionPolicy('cinematic');
    expect(policy.reducedMotion).toBe(true);
    expect(policy.preset).toBe('none');
    expect(policy.allowCanvasFx).toBe(false);
    expect(policy.allowGsapTimeline).toBe(false);
  });
});
