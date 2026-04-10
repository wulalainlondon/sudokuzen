// ReplayModal — React component replacing the legacy #replay-modal DOM.
// Hybrid approach: React owns the modal chrome (open/close, controls, filters, list),
// while legacy replay.ts owns the board rendering via a ref.

import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useReplayStore, type ReplayFilter } from './replayStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { t } from '../../i18n/t';
import { sanitizeHtml } from '../../shared/html/sanitize';
import type { TeachLaunchSource, TeachOpenOptions } from '../../entities/teach';

// ── Replay Board Container ─────────────────────────────────────────────
// The 9x9 board is performance-sensitive DOM manipulation.
// We provide a container div and let legacy replay.ts render into it via ref.

function ReplayBoard(): ReactElement {
  return <div className="replay-board" id="replay-board" />;
}

type ReplayDiagnosisTone = 'neutral' | 'good' | 'warn' | 'danger';

type ReplayDiagnosisMetric = {
  label: string;
  value: string;
  tone?: ReplayDiagnosisTone;
};

type ReplayDiagnosisPayload = {
  title?: unknown;
  summary?: unknown;
  description?: unknown;
  overview?: unknown;
  learningFocus?: unknown;
  metrics?: unknown;
  advice?: unknown;
  suggestions?: unknown;
  recommendations?: unknown;
  notes?: unknown;
  highlights?: unknown;
  mistakeCount?: unknown;
  mistakes?: unknown;
  errorCount?: unknown;
  keyStepCount?: unknown;
  keySteps?: unknown;
  keyCount?: unknown;
  totalSteps?: unknown;
  actionCount?: unknown;
  paceLabel?: unknown;
  pace?: unknown;
  speedLabel?: unknown;
  accuracyPct?: unknown;
  keyRatio?: unknown;
};

type ReplayDiagnosisRecommendation = {
  moduleId?: string | null;
  techniqueKey?: string;
  technique?: string;
  module?: string;
  reason: string;
};

type NormalizedReplayDiagnosis = {
  title: string;
  summary: string;
  metrics: ReplayDiagnosisMetric[];
  advice: string[];
  recommendations: ReplayDiagnosisRecommendation[];
};

type ReplayStoreWithDiagnosis = {
  diagnosis?: ReplayDiagnosisPayload | null;
};

function getReplayDiagnosisLabel(key: string, fallback: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function getLearningCtaLabel(): string {
  return getReplayDiagnosisLabel('replayDiagnosis.ctaLearning', 'Open Learning');
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text) return text;
    }
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item): item is string => !!item);
}

function normalizeRecommendations(raw: Record<string, unknown>): ReplayDiagnosisRecommendation[] {
  const items: ReplayDiagnosisRecommendation[] = [];
  const list = Array.isArray(raw.recommendations) ? raw.recommendations : [];

  for (const item of list) {
    if (typeof item === 'string') {
      const reason = item.trim();
      if (reason) items.push({ reason });
      continue;
    }

    const obj = asPlainObject(item);
    if (!obj) continue;
    const moduleId = pickText(obj.moduleId, obj.moduleID, obj.module_id, obj.id, obj.stars) ?? undefined;
    const techniqueKey = pickText(obj.techniqueKey, obj.technique_key, obj.key) ?? undefined;
    const technique = pickText(obj.technique, obj.techniqueLabel, obj.focusLabel, obj.title, obj.name) ?? undefined;
    const module = pickText(obj.module, obj.moduleName, obj.moduleTitle) ?? undefined;
    const reason =
      pickText(obj.reason, obj.detail, obj.description, obj.summary, obj.note) ??
      getReplayDiagnosisLabel('replayDiagnosis.recommendationFallback', 'Use this item as your next practice target.');

    items.push({ moduleId, techniqueKey, technique, module, reason });
  }

  if (items.length > 0) return items.slice(0, 4);

  const focus = asPlainObject(raw.learningFocus);
  const focusType = pickText(focus?.focusType);
  const focusLabel = pickText(focus?.focusLabel);
  const summary = pickText(raw.summary, raw.description, raw.overview);
  const fallbackReason =
    summary ??
    focusLabel ??
    getReplayDiagnosisLabel('replayDiagnosis.recommendationFallback', 'Use this item as your next practice target.');

  if (focusType === 'mistake') {
    items.push({
      moduleId: null,
      technique: getReplayDiagnosisLabel('replayDiagnosis.recommendationMistake', 'Mistake review'),
      reason: fallbackReason,
    });
  } else if (focusType === 'key_step') {
    items.push({
      moduleId: null,
      technique: getReplayDiagnosisLabel('replayDiagnosis.recommendationKeyStep', 'Key-step practice'),
      reason: fallbackReason,
    });
  } else if (focusType === 'pace') {
    items.push({
      moduleId: null,
      technique: getReplayDiagnosisLabel('replayDiagnosis.recommendationPace', 'Pace control'),
      reason: fallbackReason,
    });
  } else if (focusType === 'balanced') {
    items.push({
      moduleId: null,
      technique: getReplayDiagnosisLabel('replayDiagnosis.recommendationBalanced', 'Balanced review'),
      reason: fallbackReason,
    });
  }

  return items.slice(0, 4);
}

function normalizeMetrics(raw: Record<string, unknown>): ReplayDiagnosisMetric[] {
  const metrics: ReplayDiagnosisMetric[] = [];

  if (Array.isArray(raw.metrics)) {
    for (const item of raw.metrics) {
      const obj = asPlainObject(item);
      if (!obj) continue;
      const label = pickText(obj.label, obj.name);
      const value = pickText(obj.value, obj.text);
      if (!label || !value) continue;
      const tone = pickText(obj.tone);
      metrics.push({
        label,
        value,
        tone: tone === 'good' || tone === 'warn' || tone === 'danger' ? tone : 'neutral',
      });
    }
  }

  if (metrics.length) return metrics.slice(0, 4);

  const mistakes = pickNumber(raw.mistakeCount, raw.mistakes, raw.errorCount);
  const keySteps = pickNumber(raw.keyStepCount, raw.keySteps, raw.keyCount);
  const totalSteps = pickNumber(raw.totalSteps, raw.actionCount);
  const pace = pickText(raw.paceLabel, raw.pace, raw.speedLabel);
  const accuracyPct = pickNumber(raw.accuracyPct, raw.keyRatio);

  if (mistakes !== null) {
    metrics.push({
      label: getReplayDiagnosisLabel('replayDiagnosis.metricMistakes', 'Mistakes'),
      value: String(Math.max(0, Math.round(mistakes))),
      tone: mistakes === 0 ? 'good' : 'warn',
    });
  }
  if (keySteps !== null) {
    metrics.push({
      label: getReplayDiagnosisLabel('replayDiagnosis.metricKeySteps', 'Key steps'),
      value: String(Math.max(0, Math.round(keySteps))),
      tone: 'neutral',
    });
  }
  if (totalSteps !== null) {
    metrics.push({
      label: getReplayDiagnosisLabel('replayDiagnosis.metricTotalSteps', 'Total steps'),
      value: String(Math.max(0, Math.round(totalSteps))),
      tone: 'neutral',
    });
  }
  if (pace) {
    metrics.push({
      label: getReplayDiagnosisLabel('replayDiagnosis.metricPace', 'Pace'),
      value: pace,
      tone: 'neutral',
    });
  } else if (accuracyPct !== null) {
    metrics.push({
      label: getReplayDiagnosisLabel('replayDiagnosis.metricAccuracy', 'Accuracy'),
      value: `${Math.max(0, Math.min(100, Math.round(accuracyPct)))}%`,
      tone: accuracyPct >= 90 ? 'good' : accuracyPct >= 70 ? 'neutral' : 'warn',
    });
  }

  return metrics.slice(0, 4);
}

function buildFallbackAdvice(raw: Record<string, unknown>): string[] {
  const advice = normalizeTextList(raw.advice ?? raw.suggestions ?? raw.recommendations ?? raw.notes ?? raw.highlights);
  if (advice.length) return advice.slice(0, 3);

  const mistakes = pickNumber(raw.mistakeCount, raw.mistakes, raw.errorCount);
  const keySteps = pickNumber(raw.keyStepCount, raw.keySteps, raw.keyCount);
  const totalSteps = pickNumber(raw.totalSteps, raw.actionCount);
  const pace = pickText(raw.paceLabel, raw.pace, raw.speedLabel);
  const result: string[] = [];

  if (mistakes !== null && mistakes > 0) {
    result.push(
      getReplayDiagnosisLabel('replayDiagnosis.adviceMistake', 'Review the first mistake and replay from there.'),
    );
  }
  if (totalSteps !== null && keySteps !== null && totalSteps > 0 && keySteps / totalSteps < 0.4) {
    result.push(
      getReplayDiagnosisLabel(
        'replayDiagnosis.adviceKeySteps',
        'Focus on the key steps that actually drive the solve.',
      ),
    );
  }
  if (pace && /slow|low|weak/i.test(pace)) {
    result.push(getReplayDiagnosisLabel('replayDiagnosis.advicePace', 'Trim unnecessary steps to reduce replay time.'));
  }
  if (!result.length) {
    result.push(
      getReplayDiagnosisLabel(
        'replayDiagnosis.adviceDefault',
        'Replay data is ready, but no strong signal was detected yet.',
      ),
    );
  }
  return result.slice(0, 3);
}

function normalizeDiagnosis(raw: unknown): NormalizedReplayDiagnosis | null {
  const obj = asPlainObject(raw);
  if (!obj) return null;

  const title =
    pickText(obj.title, obj.heading, obj.name) ?? getReplayDiagnosisLabel('replayDiagnosis.title', 'Replay diagnosis');
  const summary =
    pickText(obj.summary, obj.description, obj.overview) ??
    getReplayDiagnosisLabel('replayDiagnosis.summary', 'Analysis of this replay.');
  const metrics = normalizeMetrics(obj);
  const advice = buildFallbackAdvice(obj);
  const recommendations = normalizeRecommendations(obj);

  return { title, summary, metrics, advice, recommendations };
}

async function openTeachModuleFromRecommendation(moduleId: string | null | undefined): Promise<void> {
  const target = typeof moduleId === 'string' ? moduleId.trim() : '';
  if (!target) return;
  const source: TeachLaunchSource = 'replay';
  const options: TeachOpenOptions = { preferredStep: 'firstInteractive', skipDemo: true };

  type TeachBridge = {
    openTeach?: (stars: string | number, source?: TeachLaunchSource, options?: TeachOpenOptions) => Promise<boolean>;
  };
  type TeachWindow = Window & {
    __reactTeachBridge?: TeachBridge;
    showTeachModal?: (stars: string | number, source?: TeachLaunchSource) => void;
  };

  const w = window as TeachWindow;

  try {
    const handled = await w.__reactTeachBridge?.openTeach?.(target, source, options);
    if (handled) return;
  } catch {
    // Fallback below.
  }

  try {
    w.showTeachModal?.(target, source);
  } catch {
    // Non-blocking helper: swallow failures by design.
  }
}

function DiagnosisMetric({ metric }: { metric: ReplayDiagnosisMetric }): ReactElement {
  return (
    <div className={`replay-diagnosis-metric replay-diagnosis-metric--${metric.tone || 'neutral'}`}>
      <div className="replay-diagnosis-metric-label">{metric.label}</div>
      <div className="replay-diagnosis-metric-value">{metric.value}</div>
    </div>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: NormalizedReplayDiagnosis | null }): ReactElement {
  const handleOpenLearning = useCallback(() => {
    void (async () => {
      try {
        const { closeReplayModal } = await import('../../features/replay');
        closeReplayModal();
      } catch {
        // Ignore module-load failures; the action should remain non-blocking.
      }

      try {
        const { bridgeOpenStats } = await import('../stats/statsBridge');
        bridgeOpenStats();
      } catch {
        // Ignore module-load failures; the action should remain non-blocking.
      }

      try {
        const { useStatsStore } = await import('../stats/statsStore');
        useStatsStore.getState().setTab('learning');
      } catch {
        // Ignore module-load failures; the action should remain non-blocking.
      }
    })();
  }, []);

  const handleOpenRecommendation = useCallback(
    (moduleId: string | null | undefined, techniqueKey: string | undefined) => {
      void (async () => {
        try {
          const { recordLearningRecommendationClick } = await import('../../features/stats');
          recordLearningRecommendationClick(moduleId ?? null, new Date(), {
            source: 'replay',
            techniqueKey: techniqueKey ?? null,
          });
        } catch {
          // Ignore module-load failures; the action should remain non-blocking.
        }

        try {
          const { closeReplayModal } = await import('../../features/replay');
          closeReplayModal();
        } catch {
          // Ignore module-load failures; the action should remain non-blocking.
        }

        await openTeachModuleFromRecommendation(moduleId);
      })();
    },
    [],
  );

  const ctaLabel = getLearningCtaLabel();

  const renderRecommendations = (items: ReplayDiagnosisRecommendation[]): ReactElement => {
    if (!items.length) {
      return (
        <div className="replay-diagnosis-recommendations-empty">
          {getReplayDiagnosisLabel('replayDiagnosis.recommendationsEmpty', 'No concrete recommendations yet.')}
        </div>
      );
    }

    return (
      <div className="replay-diagnosis-recommendations-list">
        {items.slice(0, 4).map((item, idx) => (
          <div className="replay-diagnosis-recommendation" key={`${idx}-${item.technique || item.reason}`}>
            <div className="replay-diagnosis-recommendation-head">
              {item.technique && <span className="replay-diagnosis-recommendation-technique">{item.technique}</span>}
              {item.module && <span className="replay-diagnosis-recommendation-module">{item.module}</span>}
            </div>
            <div className="replay-diagnosis-recommendation-reason">{item.reason}</div>
            {item.moduleId && (
              <div className="replay-diagnosis-recommendation-actions">
                <button
                  className="replay-diagnosis-cta replay-diagnosis-recommendation-cta"
                  onClick={() => handleOpenRecommendation(item.moduleId, item.techniqueKey)}
                >
                  Open module
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!diagnosis) {
    return (
      <section className="replay-diagnosis replay-diagnosis--empty" aria-live="polite">
        <div className="replay-diagnosis-head">
          <div className="replay-diagnosis-title">
            {getReplayDiagnosisLabel('replayDiagnosis.title', 'Replay diagnosis')}
          </div>
        </div>
        <div className="replay-diagnosis-summary">
          {getReplayDiagnosisLabel(
            'replayDiagnosis.pending',
            'Open a finished replay to generate a compact diagnosis report.',
          )}
        </div>
        <div className="replay-diagnosis-actions">
          <button className="replay-diagnosis-cta" onClick={handleOpenLearning}>
            {ctaLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="replay-diagnosis" aria-live="polite">
      <div className="replay-diagnosis-head">
        <div className="replay-diagnosis-title">{diagnosis.title}</div>
      </div>
      <div className="replay-diagnosis-summary">{diagnosis.summary}</div>
      {diagnosis.metrics.length > 0 && (
        <div className="replay-diagnosis-metrics">
          {diagnosis.metrics.slice(0, 4).map((metric) => (
            <DiagnosisMetric key={`${metric.label}-${metric.value}`} metric={metric} />
          ))}
        </div>
      )}
      {diagnosis.advice.length > 0 && (
        <div className="replay-diagnosis-advice">
          {diagnosis.advice.slice(0, 3).map((line, idx) => (
            <div className="replay-diagnosis-advice-item" key={`${idx}-${line}`}>
              {line}
            </div>
          ))}
        </div>
      )}
      <div className="replay-diagnosis-recommendations">
        <div className="replay-diagnosis-recommendations-title">
          {getReplayDiagnosisLabel('replayDiagnosis.recommendationsTitle', 'Recommendations')}
        </div>
        {renderRecommendations(diagnosis.recommendations)}
      </div>
      <div className="replay-diagnosis-actions">
        <button className="replay-diagnosis-cta" onClick={handleOpenLearning}>
          {ctaLabel}
        </button>
      </div>
    </section>
  );
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
    import('../../features/replay').then((m) => m.replayReset()).catch(() => {});
  }, []);
  const handlePrev = useCallback(() => {
    import('../../features/replay').then((m) => m.replayStepBack()).catch(() => {});
  }, []);
  const handleTogglePlay = useCallback(() => {
    import('../../features/replay').then((m) => m.replayTogglePlay()).catch(() => {});
  }, []);
  const handleNext = useCallback(() => {
    import('../../features/replay').then((m) => m.replayStepForward()).catch(() => {});
  }, []);
  const handleSpeed = useCallback(() => {
    import('../../features/replay').then((m) => m.replayToggleSpeed()).catch(() => {});
  }, []);

  return (
    <div className="replay-controls">
      <button className="replay-ctrl-btn" id="rb-reset-btn" onClick={handleReset} title={t('replay.reset')}>
        ↺
      </button>
      <button
        className="replay-ctrl-btn"
        id="rb-prev-btn"
        onClick={handlePrev}
        disabled={prevDisabled}
        title={t('replay.prevStep')}
      >
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
      <button
        className="replay-ctrl-btn"
        id="rb-next-btn"
        onClick={handleNext}
        disabled={nextDisabled}
        title={t('replay.nextStep')}
      >
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
    import('../../features/replay').then((m) => m.setReplayFilter(key)).catch(() => {});
  }, []);

  return (
    <div className="replay-filters">
      <button className={`replay-filter-btn${active === 'all' ? ' active' : ''}`} onClick={() => handleFilter('all')}>
        {t('replay.filterAll')}
      </button>
      <button
        className={`replay-filter-btn${active === 'mistake' ? ' active' : ''}`}
        onClick={() => handleFilter('mistake')}
      >
        {t('replay.filterMistake')}
      </button>
      <button className={`replay-filter-btn${active === 'key' ? ' active' : ''}`} onClick={() => handleFilter('key')}>
        {t('replay.filterKey')}
      </button>
    </div>
  );
}

// ── Step List ───────────────────────────────────────────────────────────

function StepList({ html }: { html: string }): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);

  // Attach click-to-jump handlers after HTML injection
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const handleClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest('.replay-item[data-step]') as HTMLElement | null;
      if (!target) return;
      const step = parseInt(target.dataset.step || '0');
      if (step > 0) {
        import('../../features/replay').then((m) => m.replayJumpToStep(step)).catch(() => {});
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [safeHtml]);

  return (
    // Safety: step list HTML built by our own replay.ts code (trusted)
    <div className="replay-list" id="replay-list" ref={listRef} dangerouslySetInnerHTML={{ __html: safeHtml }} />
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
  const diagnosisRaw = useReplayStore((s) => (s as ReplayStoreWithDiagnosis).diagnosis ?? null);
  const diagnosis = useMemo(() => normalizeDiagnosis(diagnosisRaw), [diagnosisRaw]);
  const safeStepInfoHtml = useMemo(
    () => sanitizeHtml(stepInfoHtml || t('replay.stepInfo', { current: 0, total: 0 })),
    [stepInfoHtml],
  );

  // Clear replay board to prevent stale content when modal closes
  useEffect(() => {
    if (!visible) return;
    const rafId = requestAnimationFrame(() => {
      import('../../features/replay').then((m) => m.replayReset()).catch(() => {});
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
        import('../../features/replay').then((m) => m.closeReplayModal()).catch(() => {});
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  const handleClose = useCallback(() => {
    import('../../features/replay').then((m) => m.closeReplayModal()).catch(() => {});
  }, []);

  return (
    <ZenOverlay visible={visible} onClose={handleClose} id="replay-modal" className="show">
      <div className="replay-panel">
        <h3 className="replay-title">{t('replay.title')}</h3>
        <div className="replay-summary" id="replay-summary">
          {summaryText}
        </div>
        <DiagnosisCard diagnosis={diagnosis} />

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
            dangerouslySetInnerHTML={{ __html: safeStepInfoHtml }}
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
