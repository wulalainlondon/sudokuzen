// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeLearningStats,
  recordLearningRecommendationClick,
  recordLearningTabVisit,
  recordReplayRecommendationCompletion,
} from '../src/features/stats';
import { SK } from '../src/storage/keys';

type GlobalWithTeachData = typeof globalThis & { TEACH_DATA?: Record<string, unknown> };

function setTeachData(data: Record<string, unknown>): void {
  (globalThis as GlobalWithTeachData).TEACH_DATA = data;
}

describe('computeLearningStats', () => {
  beforeEach(() => {
    localStorage.clear();
    setTeachData({});
  });

  it('returns zero counts with no teach data', () => {
    const stats = computeLearningStats();
    expect(stats).toMatchObject({
      teachReadCount: 0,
      teachTotal: 0,
      practiceDoneCount: 0,
      practiceTotalTechniques: 0,
      unreadTeach: 0,
      unmasteredTech: 0,
      masteryPct: 0,
    });
  });

  it('counts partial teach reads and practice completions', () => {
    setTeachData({
      '1': { technique: 'naked_single', practice: [{ id: 1 }] },
      '2': { technique: 'hidden_single', practice: [{ id: 2 }] },
      '3': { technique: 'locked_candidates', practice: [] },
    });
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true, 3: true, 99: true }));
    localStorage.setItem(SK.PRACTICE_DONE, JSON.stringify({ 1: true, 2: false, 77: true }));

    const stats = computeLearningStats();
    expect(stats).toMatchObject({
      teachReadCount: 2,
      teachTotal: 3,
      practiceDoneCount: 1,
      practiceTotalTechniques: 2,
      practiceTotal: 2,
      unreadTeach: 1,
      unmasteredTech: 1,
      masteredTechniqueCount: 1,
      totalTechniqueCount: 2,
    });
  });

  it('caps completed counts to available teach modules implicitly via intersection', () => {
    setTeachData({
      '1': { technique: 'naked_single', practice: [{ id: 1 }] },
      '2': { technique: 'hidden_single', practice: [{ id: 2 }] },
    });
    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true, 2: true }));
    localStorage.setItem(SK.PRACTICE_DONE, JSON.stringify({ 1: true, 2: true, 3: true }));

    const stats = computeLearningStats();
    expect(stats.teachReadCount).toBe(2);
    expect(stats.practiceDoneCount).toBe(2);
    expect(stats.unreadTeach).toBe(0);
    expect(stats.unmasteredTech).toBe(0);
    expect(stats.masteryPct).toBe(100);
  });

  it('builds ranked technique progress and actionable risk alerts', () => {
    setTeachData({
      '1': { technique: 'naked_single', name: 'Naked 1', practice: [{ id: 1 }] },
      '2': { technique: 'naked_single', name: 'Naked 2', practice: [{ id: 2 }] },
      '3': { technique: 'hidden_single', name: 'Hidden 1', practice: [{ id: 3 }] },
      '4': { technique: 'hidden_pair', name: 'Hidden 2', practice: [{ id: 4 }] },
      '5': { technique: 'locked_candidates', name: 'Locked 1', practice: [{ id: 5 }] },
    });

    localStorage.setItem(SK.TEACH_READ, JSON.stringify({ 1: true, 3: true, 4: true, 5: true }));
    localStorage.setItem(SK.PRACTICE_DONE, JSON.stringify({ 1: true, 3: true, 5: true }));
    localStorage.setItem(
      SK.PRACTICE_RECORDS,
      JSON.stringify({
        1: { time: 10, submissions: 1, replayHistory: [], techKey: 'naked_single' },
        2: { time: 12, submissions: 1, replayHistory: [], techKey: 'naked_single' },
        3: { time: 15, submissions: 1, replayHistory: [], techKey: 'hidden_single' },
        4: { time: 20, submissions: 1, replayHistory: [], techKey: 'hidden_pair' },
      }),
    );

    const stats = computeLearningStats();
    expect(stats.techniqueProgress).toMatchObject([
      { technique: 'hidden_pair', name: 'Hidden 2', read: 1, practiced: 0, clears: 1, total: 1, pct: 67 },
      { technique: 'hidden_single', name: 'Hidden 1', read: 1, practiced: 1, clears: 1, total: 1, pct: 100 },
      { technique: 'locked_candidates', name: 'Locked 1', read: 1, practiced: 1, clears: 0, total: 1, pct: 67 },
      { technique: 'naked_single', name: 'Naked 1', read: 1, practiced: 1, clears: 2, total: 2, pct: 67 },
    ]);

    expect(stats.topTechniques).toMatchObject([
      {
        id: 'hidden_single',
        technique: 'hidden_single',
        totalModules: 1,
        readModules: 1,
        practicedModules: 1,
        masteryPct: 100,
      },
      {
        id: 'naked_single',
        technique: 'naked_single',
        totalModules: 2,
        readModules: 1,
        practicedModules: 1,
        masteryPct: 67,
      },
      {
        id: 'hidden_pair',
        technique: 'hidden_pair',
        totalModules: 1,
        readModules: 1,
        practicedModules: 0,
        masteryPct: 67,
      },
      {
        id: 'locked_candidates',
        technique: 'locked_candidates',
        totalModules: 1,
        readModules: 1,
        practicedModules: 1,
        masteryPct: 67,
      },
    ]);

    expect(stats.riskAlerts).toMatchObject([
      {
        id: 'hidden_pair',
        title: 'Hidden 2',
        detail: '已讀但尚未完成練習',
        technique: 'hidden_pair',
        severity: 'high',
        reason: '已讀但尚未完成練習',
      },
      {
        id: 'locked_candidates',
        title: 'Locked 1',
        detail: '練習已做但清關數過低',
        technique: 'locked_candidates',
        severity: 'medium',
        reason: '練習已做但清關數過低',
      },
    ]);
  });

  it('tracks learning loop metrics for click, completion, and next-day return', () => {
    setTeachData({
      '1': { technique: 'naked_single', name: 'Naked 1', practice: [{ id: 1 }] },
    });

    recordLearningRecommendationClick('1', new Date('2026-04-10T08:00:00+08:00'), {
      source: 'replay',
      techniqueKey: 'naked_single',
    });
    recordReplayRecommendationCompletion('1', { source: 'replay', techniqueKey: 'naked_single' });
    // Same-day visit does not count as next-day return.
    recordLearningTabVisit(new Date('2026-04-10T22:00:00+08:00'));
    // Next day first visit counts.
    recordLearningTabVisit(new Date('2026-04-11T09:00:00+08:00'));
    // Same day should not double count.
    recordLearningTabVisit(new Date('2026-04-11T18:00:00+08:00'));

    const stats = computeLearningStats();
    expect(stats.learningLoop).toMatchObject({
      recommendationClicks: 1,
      replayLaunchCompletions: 1,
      nextDayReturns: 1,
      replayCompletionRatePct: 100,
      nextDayReturnRatePct: 100,
      lastRecommendationDate: '2026-04-10',
      lastRecommendationModuleId: '1',
    });
    expect(stats.learningLoop?.topConvertingModules).toMatchObject([
      {
        moduleId: '1',
        name: 'Naked 1',
        technique: 'naked_single',
        clicks: 1,
        completions: 1,
        completionRatePct: 100,
      },
    ]);
    expect(localStorage.getItem(SK.LEARNING_LOOP_METRICS)).toContain('"nextDayReturns":1');
  });

  it('ranks top converting modules by completion rate then completions', () => {
    setTeachData({
      '1': { technique: 'naked_single', name: 'Naked 1', practice: [{ id: 1 }] },
      '2': { technique: 'hidden_single', name: 'Hidden 1', practice: [{ id: 2 }] },
      '3': { technique: 'locked_candidates', name: 'Locked 1', practice: [{ id: 3 }] },
    });

    recordLearningRecommendationClick('1', new Date('2026-04-10T08:00:00+08:00'), { source: 'replay' });
    recordLearningRecommendationClick('1', new Date('2026-04-10T08:01:00+08:00'), { source: 'replay' });
    recordReplayRecommendationCompletion('1', { source: 'replay' });

    recordLearningRecommendationClick('2', new Date('2026-04-10T08:02:00+08:00'), { source: 'replay' });
    recordReplayRecommendationCompletion('2', { source: 'replay' });

    recordLearningRecommendationClick('3', new Date('2026-04-10T08:03:00+08:00'), { source: 'replay' });
    recordLearningRecommendationClick('3', new Date('2026-04-10T08:04:00+08:00'), { source: 'replay' });
    recordReplayRecommendationCompletion('3', { source: 'replay' });
    recordReplayRecommendationCompletion('3', { source: 'replay' });

    const stats = computeLearningStats();
    expect(stats.learningLoop?.topConvertingModules?.map((x) => x.moduleId)).toEqual(['3', '2', '1']);
  });

  it('keeps backward compatibility when legacy W14 metrics are loaded', () => {
    localStorage.setItem(
      SK.LEARNING_LOOP_METRICS,
      JSON.stringify({
        recommendationClicks: 4,
        replayLaunchCompletions: 2,
        nextDayReturns: 1,
        lastRecommendationDate: '2026-04-10',
        lastRecommendationModuleId: '7',
        lastReturnAwardDate: '2026-04-11',
      }),
    );

    const stats = computeLearningStats();
    expect(stats.learningLoop).toMatchObject({
      recommendationClicks: 4,
      replayLaunchCompletions: 2,
      nextDayReturns: 1,
      replayCompletionRatePct: 50,
      nextDayReturnRatePct: 25,
      lastRecommendationDate: '2026-04-10',
      lastRecommendationModuleId: '7',
    });
    expect(stats.learningLoop?.topConvertingModules).toEqual([]);
  });
});
