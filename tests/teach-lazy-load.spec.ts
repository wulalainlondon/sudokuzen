// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { useTeachStore } from '../src/features/teach/state/teachStore';

describe('teach lazy-load fallback', () => {
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
  });

  it('falls back to sync blob when shard fetch fails', async () => {
    // Set up full blob on window (simulates legacy <script> tag path)
    window.TEACH_DATA = {
      '5': {
        technique: 'hidden_pair',
        name: '隱藏數對',
        subtitle: 'test fallback',
        explanation: ['line1'],
        example: {
          board: [],
          given: [],
          notes: {},
          steps: [
            { text: 'step', focusCells: [], highlightDigits: {}, eliminateCells: [], warnCells: [], warnDigit: null },
          ],
        },
        practice: [
          {
            board: [],
            given: [],
            notes: {},
            answer: {
              eliminates: [{ cell: 0, digit: 1 }],
              patternCells: [0],
              description: '',
              proof: [],
              aicChain: [],
            },
            solution: [],
          },
        ],
      },
    };

    // fetch will fail (no server in test) → should fall back to sync blob
    const ok = await useTeachStore.getState().openTeach(5);
    expect(ok).toBe(true);
    expect(useTeachStore.getState().module?.technique).toBe('hidden_pair');
    expect(useTeachStore.getState().flow).toBe('stepping');
  });

  it('returns false for non-existent module', async () => {
    window.TEACH_DATA = {};
    const ok = await useTeachStore.getState().openTeach(999);
    expect(ok).toBe(false);
    expect(useTeachStore.getState().flow).toBe('idle');
    expect(useTeachStore.getState().open).toBe(false);
  });

  it('normalizes raw data correctly through adapter', async () => {
    window.TEACH_DATA = {
      '1': {
        technique: 'naked_single',
        name: '啟蒙',
        subtitle: 'sub',
        explanation: ['a', 'b'],
        example: {
          board: Array(81).fill(0),
          given: Array(81).fill(0),
          notes: { '10': [1, 2, 3] },
          steps: [
            {
              text: 'focus here',
              focusCells: [10, 20],
              highlightDigits: { '10': [1] },
              eliminateCells: [{ cell: 10, digit: 2 }],
              warnCells: [30],
              warnDigit: 5,
            },
          ],
        },
        practice: [],
      },
    };

    await useTeachStore.getState().openTeach(1);
    const mod = useTeachStore.getState().module!;

    expect(mod.stars).toBe(1);
    expect(mod.technique).toBe('naked_single');
    expect(mod.explanation).toEqual(['a', 'b']);
    expect(mod.example!.notes['10']).toEqual([1, 2, 3]);
    expect(mod.example!.steps[0].eliminateCells).toEqual([{ cell: 10, digit: 2 }]);
    expect(mod.example!.steps[0].warnDigit).toBe(5);
  });
});
