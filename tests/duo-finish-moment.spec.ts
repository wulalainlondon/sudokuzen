// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDuoFinishMoment, showDuoFinishMoment } from '../src/features/duo/duoFinishMoment';

describe('Duo finish moment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    clearDuoFinishMoment();
    vi.useRealTimers();
  });

  it('shows an immediate persistent local completion state', () => {
    showDuoFinishMoment('local', '挑戰完成', '成績已送出 · 等待最終裁定');

    const element = document.getElementById('duo-finish-moment');
    expect(element?.classList.contains('visible')).toBe(true);
    expect(element?.classList.contains('local')).toBe(true);
    expect(element?.querySelector('.duo-finish-moment-title')?.textContent).toBe('挑戰完成');
    expect(element?.querySelector('.duo-finish-moment-detail')?.textContent).toContain('等待最終裁定');

    vi.advanceTimersByTime(10_000);
    expect(element?.classList.contains('visible')).toBe(true);
  });

  it('shows a non-blocking opponent chase state and dismisses it automatically', () => {
    showDuoFinishMoment('opponent', 'Steven 已完成', '最後追趕 · 完成你的棋盤');

    const element = document.getElementById('duo-finish-moment');
    expect(element?.classList.contains('opponent')).toBe(true);
    expect(element?.style.pointerEvents).toBe('');

    vi.advanceTimersByTime(3_199);
    expect(element?.classList.contains('visible')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(element?.classList.contains('visible')).toBe(false);
  });

  it('reuses one live region and clears it when the final result opens', () => {
    showDuoFinishMoment('local', '完成', '等待');
    showDuoFinishMoment('opponent', '對手完成', '追趕');

    expect(document.querySelectorAll('#duo-finish-moment')).toHaveLength(1);
    expect(document.getElementById('duo-finish-moment')?.dataset.kind).toBe('opponent');

    clearDuoFinishMoment();
    expect(document.getElementById('duo-finish-moment')).toBeNull();
  });
});
