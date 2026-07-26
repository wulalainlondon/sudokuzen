// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gs } from '../src/game/state';
import { showFeedback } from '../src/ui/feedback';

describe('feedback duration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const toast = document.createElement('div');
    Object.assign(gs as unknown as Record<string, unknown>, {
      feedbackToast: toast,
      feedbackTimer: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps important entry feedback visible for the requested duration', () => {
    showFeedback('Duo is locked', 'error', 4_000);
    expect(gs.feedbackToast?.classList.contains('show')).toBe(true);

    vi.advanceTimersByTime(3_999);
    expect(gs.feedbackToast?.classList.contains('show')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(gs.feedbackToast?.classList.contains('show')).toBe(false);
  });
});
