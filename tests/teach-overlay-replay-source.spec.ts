// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { setLocale } from '../src/i18n/t';
import { zhTW } from '../src/i18n/locale/zh-TW';
import { TeachOverlay } from '../src/features/teach/components/TeachOverlay';
import { useTeachStore } from '../src/features/teach/state/teachStore';
import type { TeachModuleModel } from '../src/entities/teach';

let root: any = null;
let container: any = null;

const baseModule: TeachModuleModel = {
  stars: 12,
  technique: 'hidden_pair',
  name: '隱藏數對',
  subtitle: 'replay source test',
  explanation: ['line 1'],
  example: null,
  practice: [],
};

function resetTeachState(launchSource: 'tier' | 'library' | 'replay'): void {
  useTeachStore.setState({
    flow: 'idle',
    open: true,
    stars: 12,
    launchSource: launchSource as any,
    module: baseModule,
    stepIndex: 0,
    practiceIndex: 0,
    practice: { selected: new Set(), revealed: false, message: '', success: false, tone: 'neutral', hintLevel: 0 },
  });
}

function renderOverlay(launchSource: 'tier' | 'library' | 'replay'): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  resetTeachState(launchSource);
  flushSync(() => {
    root?.render(createElement(TeachOverlay));
  });

  return container;
}

beforeEach(() => {
  localStorage.clear();
  setLocale(zhTW);
});

afterEach(() => {
  if (root) root.unmount();
  root = null;
  if (container) container.remove();
  container = null;
});

describe('teach overlay replay source badge', () => {
  it('shows the source badge only for replay launches', () => {
    const replayContainer = renderOverlay('replay');
    const replayBadge = replayContainer.querySelector('.teach-source-badge');

    expect(replayBadge).not.toBeNull();
    expect(replayBadge?.textContent).toBe('回放推薦');

    if (root) root.unmount();
    if (container) container.remove();
    root = null;
    container = null;

    const tierContainer = renderOverlay('tier');
    expect(tierContainer.querySelector('.teach-source-badge')).toBeNull();

    if (root) root.unmount();
    if (container) container.remove();
    root = null;
    container = null;

    const libraryContainer = renderOverlay('library');
    expect(libraryContainer.querySelector('.teach-source-badge')).toBeNull();
  });
});
