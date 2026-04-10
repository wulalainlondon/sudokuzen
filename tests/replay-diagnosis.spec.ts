// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { gs, type ActionRecord, type LevelData } from '../src/game/state';
import { buildReplayDiagnosis, closeReplayModal, openReplayModal, type ReplayDiagnosis } from '../src/features/replay';
import { bridgeSetReplayDiagnosis } from '../src/react/replay/replayBridge';
import { useReplayStore } from '../src/react/replay/replayStore';

function makeHistory(): ActionRecord[] {
  return [
    { t: 5, type: 'fill', detail: 'r1c1=1', idx: 0, val: 1, notes: null },
    { t: 15, type: 'mistake', detail: 'r1c2=9', idx: 1, val: 9, notes: null },
    { t: 25, type: 'eliminate', detail: 'remove 2', idx: 2, val: 2, notes: null },
    { t: 38, type: 'note', detail: 'mark notes', idx: 3, val: null, notes: [1, 2, 3] },
  ];
}

describe('replay diagnosis', () => {
  beforeEach(() => {
    localStorage.clear();
    gs.seconds = 40;
    gs.actionHistory = [];
    gs.currentLevel = null;
    useReplayStore.setState({
      visible: false,
      summaryText: '-',
      listHtml: '',
      filter: 'all',
      stepIdx: 0,
      totalSteps: 0,
      isPlaying: false,
      speed: 1,
      stepInfoHtml: '',
      progressPct: 0,
      diagnosis: null,
      prevDisabled: true,
      nextDisabled: false,
    });
  });

  it('builds a deterministic diagnosis payload from replay history', () => {
    const history = makeHistory();
    const diagnosis = buildReplayDiagnosis(history, 40.9);
    const diagnosisAgain = buildReplayDiagnosis(history, 40.9);

    expect(diagnosis).toEqual(diagnosisAgain);
    expect(diagnosis.totalActions).toBe(4);
    expect(diagnosis.elapsedSeconds).toBe(40);
    expect(diagnosis.mistakeCount).toBe(1);
    expect(diagnosis.keyCount).toBe(3);
    expect(diagnosis.keyRatePct).toBe(75);
    expect(diagnosis.mistakeRatePct).toBe(25);
    expect(diagnosis.paceLabel).toBe('slow');
    expect(diagnosis.learningFocus).toEqual({
      focusType: 'mistake',
      focusLabel: 'Review mistakes first',
    });
    expect(diagnosis.recommendations.map((item) => item.techniqueKey)).toEqual([
      'naked_single',
      'hidden_single',
      'locked_candidates',
      'naked_pair',
    ]);
    expect(diagnosis.recommendations.map((item) => item.moduleId)).toEqual(['1', '2', '3', '4']);
    expect(diagnosis.recommendations.every((item) => item.moduleName)).toBe(true);
    expect(diagnosis.summary).toBe('4 actions · 1 mistake · 3 key steps');
    expect(diagnosis.insights).toEqual([
      '1 mistake is concentrated and worth reviewing first.',
      'Key steps dominate (75% of moves).',
      'Tempo is slow (10.0s/action).',
    ]);
  });

  it('writes diagnosis through the bridge and clears it on close', () => {
    const diagnosis = buildReplayDiagnosis(makeHistory(), 40);
    bridgeSetReplayDiagnosis(diagnosis);
    expect(useReplayStore.getState().diagnosis).toEqual(diagnosis);

    closeReplayModal();
    expect(useReplayStore.getState().diagnosis).toBeNull();
  });

  it('publishes diagnosis through the replay open path', () => {
    gs.currentLevel = {
      id: 1,
      stars: 1,
      difficultyName: 'Test Tier',
      displayName: 'Test Level',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(0),
    } as LevelData;
    gs.actionHistory = makeHistory();
    gs.seconds = 40;
    openReplayModal();

    const diagnosis = useReplayStore.getState().diagnosis;
    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.totalActions).toBe(4);
    expect(diagnosis?.mistakeCount).toBe(1);
    expect(diagnosis?.keyCount).toBe(3);
    expect(diagnosis?.learningFocus).toEqual({
      focusType: 'mistake',
      focusLabel: 'Review mistakes first',
    });
    const diagnosisWithRecs = diagnosis as ReplayDiagnosis | null;
    expect(diagnosisWithRecs?.recommendations.map((item) => item.techniqueKey)).toEqual([
      'naked_single',
      'hidden_single',
      'locked_candidates',
      'naked_pair',
    ]);
    expect(diagnosis?.summary).toBe('4 actions · 1 mistake · 3 key steps');
  });

  it('selects different learning focus modes deterministically', () => {
    const keyStepHistory: ActionRecord[] = [
      { t: 1, type: 'note', detail: 'note 1', idx: 0, val: null, notes: [1] },
      { t: 2, type: 'erase', detail: 'erase', idx: 0, val: null, notes: null },
      { t: 3, type: 'note', detail: 'note 2', idx: 1, val: null, notes: [2] },
      { t: 4, type: 'note', detail: 'note 3', idx: 2, val: null, notes: [3] },
    ];
    const paceHistory: ActionRecord[] = [
      { t: 1, type: 'fill', detail: 'fill 1', idx: 0, val: 1, notes: null },
      { t: 2, type: 'fill', detail: 'fill 2', idx: 1, val: 2, notes: null },
      { t: 3, type: 'fill', detail: 'fill 3', idx: 2, val: 3, notes: null },
      { t: 4, type: 'fill', detail: 'fill 4', idx: 3, val: 4, notes: null },
    ];
    const balancedHistory: ActionRecord[] = [
      { t: 1, type: 'fill', detail: 'fill 1', idx: 0, val: 1, notes: null },
      { t: 2, type: 'fill', detail: 'fill 2', idx: 1, val: 2, notes: null },
    ];

    expect(buildReplayDiagnosis(keyStepHistory, 12).learningFocus).toEqual({
      focusType: 'key_step',
      focusLabel: 'Increase key-step usage',
    });
    expect(buildReplayDiagnosis(keyStepHistory, 12).recommendations.map((item) => item.techniqueKey)).toEqual([
      'hidden_pair',
      'naked_triple',
      'hidden_triple',
      'x_wing',
    ]);
    expect(buildReplayDiagnosis(paceHistory, 80).learningFocus).toEqual({
      focusType: 'pace',
      focusLabel: 'Improve solving pace',
    });
    expect(buildReplayDiagnosis(paceHistory, 80).recommendations.map((item) => item.techniqueKey)).toEqual([
      'naked_single',
      'hidden_single',
      'naked_pair',
      'hidden_pair',
    ]);
    expect(buildReplayDiagnosis(balancedHistory, 2).learningFocus).toEqual({
      focusType: 'balanced',
      focusLabel: 'Balanced replay profile',
    });
    expect(buildReplayDiagnosis(balancedHistory, 2).recommendations.map((item) => item.techniqueKey)).toEqual([
      'hidden_single',
      'locked_candidates',
      'naked_pair',
    ]);
  });
});
