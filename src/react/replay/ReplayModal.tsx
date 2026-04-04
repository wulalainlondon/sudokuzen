// ReplayModal — React component replacing the legacy #replay-modal DOM.
// Hybrid approach: React owns the modal chrome (open/close, controls, filters, list),
// while legacy replay.ts owns the board rendering via a ref.

import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { useReplayStore, type ReplayFilter } from './replayStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { t } from '../../i18n/t';

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
      <button className="replay-ctrl-btn" id="rb-reset-btn" onClick={handleReset} title={t('replay.reset')}>
        ↺
      </button>
      <button className="replay-ctrl-btn" id="rb-prev-btn" onClick={handlePrev} disabled={prevDisabled} title={t('replay.prevStep')}>
        ◄
      </button>
      <button
        className={`replay-ctrl-btn rb-play${isPlaying ? ' active' : ''}`}
        id="rb-play-btn"
        onClick={handleTogglePlay}
        title={isPlaying ? t('replay.pause') : t('replay.play')}
      >
        {isPlaying ? t('replay.pause') : t('replay.play')}
      </button>
      <button className="replay-ctrl-btn" id="rb-next-btn" onClick={handleNext} disabled={nextDisabled} title={t('replay.nextStep')}>
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
        {t('replay.filterAll')}
      </button>
      <button
        className={`replay-filter-btn${active === 'mistake' ? ' active' : ''}`}
        onClick={() => handleFilter('mistake')}
      >
        {t('replay.filterMistake')}
      </button>
      <button
        className={`replay-filter-btn${active === 'key' ? ' active' : ''}`}
        onClick={() => handleFilter('key')}
      >
        {t('replay.filterKey')}
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
    // Safety: step list HTML built by our own replay.ts code (trusted)
    <div
      className="replay-list"
      id="replay-list"
      ref={listRef}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Main Modal ──────────────────────────────────────────────────────────

export function ReplayModal(): ReactElement {
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

  // Clear replay board to prevent stale content when modal closes
  useEffect(() => {
    if (!visible) return;
    const rafId = requestAnimationFrame(() => {
      import('../../features/replay').then((m) => m.replayReset());
    });
    return () => {
      cancelAnimationFrame(rafId);
      const board = document.getElementById('replay-board');
      if (board) board.innerHTML = '';
    };
  }, [visible]);

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

  const handleClose = useCallback(() => {
    import('../../features/replay').then((m) => m.closeReplayModal());
  }, []);

  return (
    <ZenOverlay visible={visible} onClose={handleClose} id="replay-modal" className="show">
      <div className="replay-panel">
        <h3 className="replay-title">{t('replay.title')}</h3>
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
            dangerouslySetInnerHTML={{ __html: stepInfoHtml || t('replay.stepInfo', { current: 0, total: 0 }) }}
          />
        </div>

        <FilterTabs active={filter} />
        <StepList html={listHtml} />
        <button className="resume-btn" onClick={handleClose}>
          {t('nav.close')}
        </button>
      </div>
    </ZenOverlay>
  );
}
