// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTeachStore } from '../src/features/teach/state/teachStore';

describe('teach store state machine', () => {
  beforeEach(() => {
    localStorage.clear();
    useTeachStore.setState({
      flow: 'idle',
      open: false,
      stars: null,
      launchSource: 'tier',
      module: null,
      stepIndex: 0,
      practiceIndex: 0,
      practice: { selected: new Set(), revealed: false, message: '', success: false, tone: 'neutral', hintLevel: 0 },
    });

    window.TEACH_DATA = {
      '1': {
        technique: 'naked_single',
        name: '啟蒙',
        subtitle: 'test',
        explanation: ['a'],
        example: {
          board: [],
          given: [],
          notes: {},
          steps: [
            { text: 's1', focusCells: [], highlightDigits: {}, eliminateCells: [], warnCells: [], warnDigit: null },
          ],
        },
        practice: [
          {
            board: [],
            given: [],
            notes: {},
            answer: {
              eliminates: [{ cell: 2, digit: 4 }],
              fills: [{ cell: 10, digit: 7 }],
              patternCells: [2],
              description: 'ok',
              proof: [],
              aicChain: [],
            },
            solution: [],
          },
        ],
      },
    };
  });

  it('opens teach and enters stepping flow', async () => {
    const ok = await useTeachStore.getState().openTeach(1);
    expect(ok).toBe(true);
    expect(useTeachStore.getState().flow).toBe('stepping');
    expect(useTeachStore.getState().open).toBe(true);
  });

  it('can finish practice and produce success result + persistence', async () => {
    await useTeachStore.getState().openTeach(1);
    useTeachStore.getState().startPractice();
    useTeachStore.getState().toggleSelection(2, 4);
    useTeachStore.getState().toggleFillSelection(10, 7);
    useTeachStore.getState().submitPractice();

    expect(useTeachStore.getState().flow).toBe('result');
    expect(useTeachStore.getState().practice.success).toBe(true);
    expect(localStorage.getItem('sudoku_practice_done')).toContain('1');
  });

  it('hint level 3 auto reveals answer', async () => {
    await useTeachStore.getState().openTeach(1);
    useTeachStore.getState().startPractice();
    useTeachStore.getState().showHint();
    useTeachStore.getState().showHint();
    useTeachStore.getState().showHint();

    expect(useTeachStore.getState().flow).toBe('result');
    expect(useTeachStore.getState().practice.revealed).toBe(true);
    expect(useTeachStore.getState().practice.success).toBe(false);
  });

  it('preserves replay launch source without restoring the library overlay on close', async () => {
    const renderLibraryCards = vi.fn();
    const openLibraryOverlay = vi.fn();
    const w = window as Window & {
      renderLibraryCards?: typeof renderLibraryCards;
      openLibraryOverlay?: typeof openLibraryOverlay;
    };
    w.renderLibraryCards = renderLibraryCards;
    w.openLibraryOverlay = openLibraryOverlay;

    const ok = await useTeachStore.getState().openTeach(1, 'replay');
    expect(ok).toBe(true);
    expect(useTeachStore.getState().launchSource).toBe('replay');

    useTeachStore.getState().closeTeach();

    expect(renderLibraryCards).not.toHaveBeenCalled();
    expect(openLibraryOverlay).not.toHaveBeenCalled();
    expect(useTeachStore.getState().launchSource).toBe('tier');
  });

  it('replay source opens directly in stepping and jumps to first interactive step', async () => {
    window.TEACH_DATA = {
      '1': {
        technique: 'naked_single',
        name: '啟蒙',
        subtitle: 'test',
        explanation: ['a'],
        example: {
          board: [],
          given: [],
          notes: {},
          steps: [
            { text: 'intro', focusCells: [], highlightDigits: {}, eliminateCells: [], warnCells: [], warnDigit: null },
            {
              text: 'interactive',
              focusCells: [10],
              highlightDigits: { '10': [5] },
              eliminateCells: [{ cell: 10, digit: 2 }],
              warnCells: [],
              warnDigit: null,
            },
          ],
        },
        practice: [],
      },
    };

    const ok = await useTeachStore.getState().openTeach(1, 'replay');
    expect(ok).toBe(true);
    expect(useTeachStore.getState().flow).toBe('stepping');
    expect(useTeachStore.getState().stepIndex).toBe(1);
  });
});
