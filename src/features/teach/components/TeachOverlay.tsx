import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';

import { buildMotionPolicy } from '../../../shared/motion/policy';
import { StepPulseCanvas } from '../../../shared/fx/StepPulseCanvas';
import { DemoBoard } from './DemoBoard';
import { PracticeBoard } from './PracticeBoard';
import { TeachBoard } from './TeachBoard';
import { useTeachStore } from '../state/teachStore';
import { t } from '../../../i18n/t';

function resultToneClass(tone: 'success' | 'partial' | 'error' | 'neutral'): string {
  if (tone === 'success') return 'practice-result success';
  if (tone === 'partial') return 'practice-result partial';
  if (tone === 'error') return 'practice-result error';
  return 'practice-result';
}

function getTeachStageLabel(stars: number | undefined): string {
  if (!Number.isFinite(stars)) return t('teachOverlay.stageStudying');
  if ((stars ?? 0) <= 7) return t('teachOverlay.stageBeginner');
  if ((stars ?? 0) <= 17) return t('teachOverlay.stageIntermediate');
  if ((stars ?? 0) <= 25) return t('teachOverlay.stageAdvanced');
  if ((stars ?? 0) <= 35) return t('teachOverlay.stageExpert');
  return t('teachOverlay.stageGodlike');
}

export function TeachOverlay(): ReactElement {
  const {
    open,
    module,
    flow,
    launchSource,
    stepIndex,
    practiceIndex,
    practice,
    closeTeach,
    startStepping,
    nextStep,
    prevStep,
    startPractice,
    toggleSelection,
    toggleFillSelection,
    submitPractice,
    revealPractice,
    showHint,
    retryPractice,
    backToSteps,
  } = useTeachStore();

  const stepTextRef = useRef<HTMLParagraphElement | null>(null);
  const policy = useMemo(() => buildMotionPolicy('expressive'), []);

  const step = module?.example?.steps?.[stepIndex] ?? null;
  const stepsTotal = Math.max(module?.example?.steps.length ?? 1, 1);
  const practiceItem = module?.practice?.[practiceIndex] ?? null;
  const hasFillTargets = (practiceItem?.answer.fills?.length ?? 0) > 0;
  const stage = getTeachStageLabel(module?.stars);
  const showReplaySource = launchSource === 'replay';

  useEffect(() => {
    if (!stepTextRef.current || !policy.allowGsapTimeline) return;
    gsap.fromTo(stepTextRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
  }, [stepIndex, flow, policy.allowGsapTimeline]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTeach();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, closeTeach]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            key="teach-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeTeach}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.42)',
              backdropFilter: 'blur(3px)',
              zIndex: 1500,
            }}
          />

          {/* Dialog */}
          <motion.section
            key="teach-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={module?.name ?? t('teachOverlay.defaultTitle')}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: policy.reducedMotion ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              position: 'fixed',
              inset: 0,
              margin: 'auto',
              width: 'min(95vw, 760px)',
              maxHeight: 'calc(100dvh - 24px)',
              overflowY: 'auto',
              zIndex: 1501,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'var(--grid-bg)',
              padding: '20px',
              color: 'var(--text-main)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div className="relative overflow-hidden rounded-card bg-surface p-4">
              {policy.allowCanvasFx ? <StepPulseCanvas active={flow === 'stepping'} /> : null}

              <div className="teach-header relative z-10">
                <h2 className="teach-title">{module?.name ?? t('teachOverlay.defaultTitle')}</h2>
                <p className="teach-subtitle">
                  【{stage}】{module?.subtitle ?? ''}
                </p>
                {showReplaySource ? <span className="teach-source-badge">{t('teachOverlay.replaySource')}</span> : null}
              </div>

              <div className="teach-explanation relative z-10">
                <p className="teach-level-note">{t('teachOverlay.chapterLabel', { stage })}</p>
                {(module?.explanation ?? []).map((line, idx) => (
                  <p key={`${idx}-${line}`}>{line}</p>
                ))}
              </div>

              {flow === 'demo' && module ? <DemoBoard module={module} /> : null}

              {flow === 'stepping' ? (
                <>
                  <TeachBoard example={module?.example ?? null} step={step} />
                  <p ref={stepTextRef} className="teach-step-text whitespace-pre-line">
                    {step?.text ?? module?.explanation?.[0] ?? t('teachOverlay.loading')}
                  </p>
                  <div className="teach-nav">
                    <button className="rz-focus-ring" onClick={prevStep} disabled={stepIndex <= 0}>
                      {t('teachOverlay.prevStep')}
                    </button>
                    <span id="teach-step-indicator">
                      {stepIndex + 1}/{stepsTotal}
                    </span>
                    <button className="rz-focus-ring" onClick={nextStep} disabled={stepIndex >= stepsTotal - 1}>
                      {t('teachOverlay.nextStep')}
                    </button>
                  </div>
                </>
              ) : null}

              {flow === 'practice' || flow === 'result' ? (
                <>
                  <div className="practice-header">
                    <span className="practice-tech-name">
                      {module?.name} · {module?.technique}
                    </span>
                    <span className="practice-instruction">
                      {hasFillTargets
                        ? t('teachOverlay.practiceInstructionMixed')
                        : t('teachOverlay.practiceInstruction')}
                    </span>
                  </div>
                  <PracticeBoard
                    item={practiceItem}
                    practice={practice}
                    onToggle={toggleSelection}
                    onToggleFill={toggleFillSelection}
                  />
                  <div className="practice-status">
                    <span id="practice-counter">
                      {t('teachOverlay.selectedCount', { count: String(practice.selected.size) })}
                    </span>
                    <button className="rz-focus-ring" onClick={showHint}>
                      {t('teachOverlay.hint')}
                    </button>
                  </div>
                  <p className={`${resultToneClass(practice.tone)} whitespace-pre-line`}>{practice.message}</p>
                </>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {flow === 'demo' ? (
                <>
                  <button className="teach-done-btn rz-focus-ring" onClick={closeTeach}>
                    {t('teachOverlay.skip')}
                  </button>
                  <button className="practice-confirm-btn rz-focus-ring" onClick={startStepping}>
                    {t('teachOverlay.breakdown')}
                  </button>
                </>
              ) : null}
              {flow === 'stepping' ? (
                <>
                  <button className="teach-done-btn rz-focus-ring" onClick={closeTeach}>
                    {t('teachOverlay.skipStepping')}
                  </button>
                  <button className="teach-done-btn rz-focus-ring" onClick={startPractice}>
                    {t('teachOverlay.startPractice')}
                  </button>
                </>
              ) : null}
              {flow === 'practice' ? (
                <>
                  <button className="practice-reveal-btn rz-focus-ring" onClick={revealPractice}>
                    {t('teachOverlay.revealAnswer')}
                  </button>
                  <button className="practice-confirm-btn rz-focus-ring" onClick={submitPractice}>
                    {hasFillTargets ? t('teachOverlay.confirmSelection') : t('teachOverlay.confirmElim')}
                  </button>
                </>
              ) : null}
              {flow === 'result' ? (
                <>
                  <button className="practice-reveal-btn rz-focus-ring" onClick={backToSteps}>
                    {t('teachOverlay.backToSteps')}
                  </button>
                  {(module?.practice.length ?? 0) > 0 ? (
                    <button className="practice-confirm-btn rz-focus-ring" onClick={retryPractice}>
                      {t('teachOverlay.retryPractice')}
                    </button>
                  ) : null}
                  <button className="practice-reveal-btn rz-focus-ring" onClick={closeTeach}>
                    {t('teachOverlay.close')}
                  </button>
                </>
              ) : null}
            </div>
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
