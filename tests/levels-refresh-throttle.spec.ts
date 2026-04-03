// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderLevelGrid } from '../src/features/levels';

describe('renderLevelGrid refresh coalescing', () => {
  const rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    document.body.dataset.reactNormalLevelList = '1';
    rafQueue.length = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    delete document.body.dataset.reactNormalLevelList;
    vi.restoreAllMocks();
  });

  it('dispatches one refresh event per frame even if called repeatedly', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderLevelGrid();
    renderLevelGrid();
    renderLevelGrid();

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(0);

    rafQueue[0](0);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    renderLevelGrid();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    rafQueue[1](16);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
  });
});
