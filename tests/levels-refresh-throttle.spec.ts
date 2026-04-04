// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderLevelGrid } from '../src/features/levels';
import { __resetRefreshBusForTests, subscribeRefresh } from '../src/app/ui/refreshBus';

describe('renderLevelGrid refresh coalescing', () => {
  const rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    document.body.dataset.reactNormalLevelList = '1';
    rafQueue.length = 0;
    __resetRefreshBusForTests();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    delete document.body.dataset.reactNormalLevelList;
    __resetRefreshBusForTests();
    vi.restoreAllMocks();
  });

  it('notifies normal-level-list subscribers once per frame even if called repeatedly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRefresh('normal-level-list', listener);

    renderLevelGrid();
    renderLevelGrid();
    renderLevelGrid();

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(0);

    rafQueue[0](0);
    expect(listener).toHaveBeenCalledTimes(1);

    renderLevelGrid();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    rafQueue[1](16);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
