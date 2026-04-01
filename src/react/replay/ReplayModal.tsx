// ReplayModal — React component replacing the legacy #replay-modal DOM.
// Hybrid approach: React owns the modal chrome (open/close, controls, filters, list),
// while legacy replay.ts owns the board rendering via a ref.

import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { useReplayStore, type ReplayFilter } from './replayStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ── Replay Board Container ─────────────────────────────────────────────
// The 9x9 board is performance-sensitive DOM manipulation.
// We provide a container div and let legacy replay.ts render into it via ref.

function ReplayBoard(): ReactElement {
  return <div className="replay-board" id="replay-board" />;
}

// ── Progress Bar ────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }): ReactElement {
  return (
    <div className="replay-progress-bar">
      <div className="replay-progress-fill" id="rb-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────

function PlaybackControls({
  prevDisabled,
  nextDisabled,
  isPlaying,
  speed,
}: {
  prevDisabled: boolean;
  nextDisabled: boolean;
  isPlaying: boolean;
  speed: number;
}): ReactElement {
  const handleReset = useCallback(() => {
    import('../../features/replay').then((m) => m.replayReset());
  }, []);
  const handlePrev = useCallback(() => {
    import('../../features/replay').then((m) => m.replayStepBack());
  }, []);
  const handleTogglePlay = useCallback(() => {
    import('../../features/replay').then((m) => m.replayTogglePlay());
  }, []);
  const handleNext = useCallback(() => {
    import('../../features/replay').then((m) => m.replayStepForward());
  }, []);
  const handleSpeed = useCallback(() => {
    import('../../features/replay').then((m) => m.replayToggleSpeed());
  }, []);

  return (
    <div className="replay-controls">
      <button className="replay-ctrl-btn" id="rb-reset-btn" onClick={handleReset} title="重置">
        ↺
      </button>
      <button className="replay-ctrl-btn" id="rb-prev-btn" onClick={handlePrev} disabled={prevDisabled} title="上一步">
        ◄
      </button>
      <button
        className={`replay-ctrl-btn rb-play${isPlaying ? ' active' : ''}`}
        id="rb-play-btn"
        onClick={handleTogglePlay}
        title="播放/暫停"
      >
        {isPlaying ? '⏸ 暫停' : '▶ 播放'}
      </button>
      <button className="replay-ctrl-btn" id="rb-next-btn" onClick={handleNext} disabled={nextDisabled} title="下一步">
        ►
      </button>
      <button className="replay-ctrl-btn" id="rb-speed-btn" onClick={handleSpeed}>
        {speed}x
      </button>
    </div>
  );
}

// ── Filter Tabs ─────────────────────────────────────────────────────────

function FilterTabs({ active }: { active: ReplayFilter }): ReactElement {
  const handleFilter = useCallback((key: ReplayFilter) => {
    import('../../features/replay').then((m) => m.setReplayFilter(key));
  }, []);

  return (
    <div className="replay-filters">
      <button
        className={`replay-filter-btn${active === 'all' ? ' active' : ''}`}
        onClick={() => handleFilter('all')}
      >
        全部
      </button>
      <button
        className={`replay-filter-btn${active === 'mistake' ? ' active' : ''}`}
        onClick={() => handleFilter('mistake')}
      >
        錯誤
      </button>
      <button
        className={`replay-filter-btn${active === 'key' ? ' active' : ''}`}
        onClick={() => handleFilter('key')}
      >
        關鍵步
      </button>
    </div>
  );
}

// ── Step List ───────────────────────────────────────────────────────────

function StepList({ html }: { html: string }): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  // Attach click-to-jump handlers after HTML injection
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const handleClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest('.replay-item[data-step]') as HTMLElement | null;
      if (!target) return;
      const step = parseInt(target.dataset.step || '0');
      if (step > 0) {
        import('../../features/replay').then((m) => (m as any).replayJumpToStep(step));
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [html]);

  return (
    <div
      className="replay-list"
      id="replay-list"
      ref={listRef}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Main Modal ──────────────────────────────────────────────────────────

export function ReplayModal(): ReactElement | null {
  const visible = useReplayStore((s) => s.visible);
  const summaryText = useReplayStore((s) => s.summaryText);
  const listHtml = useReplayStore((s) => s.listHtml);
  const filter = useReplayStore((s) => s.filter);
  const isPlaying = useReplayStore((s) => s.isPlaying);
  const speed = useReplayStore((s) => s.speed);
  const stepInfoHtml = useReplayStore((s) => s.stepInfoHtml);
  const progressPct = useReplayStore((s) => s.progressPct);
  const prevDisabled = useReplayStore((s) => s.prevDisabled);
  const nextDisabled = useReplayStore((s) => s.nextDisabled);
  const close = useReplayStore((s) => s.close);
  const trapRef = useFocusTrap(visible);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        import('../../features/replay').then((m) => m.closeReplayModal());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        import('../../features/replay').then((m) => m.closeReplayModal());
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    import('../../features/replay').then((m) => m.closeReplayModal());
  }, []);

  if (!visible) return null;

  return (
    <div id="replay-modal" className="show" onClick={handleBackdrop} ref={trapRef}>
      <div className="replay-panel">
        <h3 className="replay-title">本局步驟回放</h3>
        <div className="replay-summary" id="replay-summary">
          {summaryText}
        </div>

        <div className="replay-visual-section">
          <ReplayBoard />
          <ProgressBar pct={progressPct} />
          <PlaybackControls
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            isPlaying={isPlaying}
            speed={speed}
          />
          <div
            className="replay-step-info"
            id="replay-step-info"
            dangerouslySetInnerHTML={{ __html: stepInfoHtml || '步驟 0 / 0' }}
          />
        </div>

        <FilterTabs active={filter} />
        <StepList html={listHtml} />
        <button className="resume-btn" onClick={handleClose}>
          關閉
        </button>
      </div>
    </div>
  );
}
