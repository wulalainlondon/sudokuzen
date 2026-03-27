import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';

import { buildMotionPolicy } from '../../../shared/motion/policy';
import { StepPulseCanvas } from '../../../shared/fx/StepPulseCanvas';
import { DemoBoard } from './DemoBoard';
import { PracticeBoard } from './PracticeBoard';
import { TeachBoard } from './TeachBoard';
import { useTeachStore } from '../state/teachStore';

function resultToneClass(tone: 'success' | 'partial' | 'error' | 'neutral'): string {
  if (tone === 'success') return 'practice-result success';
  if (tone === 'partial') return 'practice-result partial';
  if (tone === 'error') return 'practice-result error';
  return 'practice-result';
}

function getTeachStageLabel(stars: number | undefined): string {
  if (!Number.isFinite(stars)) return '研習中';
  if ((stars ?? 0) <= 7) return '入門';
  if ((stars ?? 0) <= 17) return '進階';
  if ((stars ?? 0) <= 25) return '高階';
  if ((stars ?? 0) <= 35) return '專家';
  return '神級';
}

export function TeachOverlay(): ReactElement {
  const {
    open,
    module,
    flow,
    stepIndex,
    practiceIndex,
    practice,
    closeTeach,
    startStepping,
    nextStep,
    prevStep,
    startPractice,
    toggleSelection,
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
  const stage = getTeachStageLabel(module?.stars);

  useEffect(() => {
    if (!stepTextRef.current || !policy.allowGsapTimeline) return;
    gsap.fromTo(stepTextRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
  }, [stepIndex, flow, policy.allowGsapTimeline]);

  return (
    <div className="react-teach-overlay" data-open={open}>
      <Dialog.Root open={open} onOpenChange={(next) => !next && closeTeach()}>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
                  style={{ zIndex: 1500 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild>
                <motion.section
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  transition={{ duration: policy.reducedMotion ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                  className="fixed left-1/2 top-1/2 w-[min(95vw,760px)] max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-card border border-white/40 bg-panel p-5 text-text shadow-zen"
                  style={{ zIndex: 1501 }}
                >
                  <div className="relative overflow-hidden rounded-card bg-surface p-4">
                    {policy.allowCanvasFx ? <StepPulseCanvas active={flow === 'stepping'} /> : null}

                    <Dialog.Title className="teach-title relative z-10">{module?.name ?? '教學'}</Dialog.Title>
                    <Dialog.Description className="teach-subtitle relative z-10">
                      【{stage}】{module?.subtitle ?? ''}
                    </Dialog.Description>

                    <div className="teach-explanation relative z-10">
                      <p className="teach-level-note">章節定位：{stage}層</p>
                      {(module?.explanation ?? []).map((line, idx) => (
                        <p key={`${idx}-${line}`}>{line}</p>
                      ))}
                    </div>

                    {flow === 'demo' && module ? <DemoBoard module={module} /> : null}

                    {flow === 'stepping' ? (
                      <>
                        <TeachBoard example={module?.example ?? null} step={step} />
                        <p ref={stepTextRef} className="teach-step-text whitespace-pre-line">
                          {step?.text ?? module?.explanation?.[0] ?? '載入教學內容中...'}
                        </p>
                        <div className="teach-nav">
                          <button className="rz-focus-ring" onClick={prevStep} disabled={stepIndex <= 0}>
                            ← 上一步
                          </button>
                          <span id="teach-step-indicator">
                            {stepIndex + 1}/{stepsTotal}
                          </span>
                          <button className="rz-focus-ring" onClick={nextStep} disabled={stepIndex >= stepsTotal - 1}>
                            下一步 →
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
                          <span className="practice-instruction">點擊要消去的候選數</span>
                        </div>
                        <PracticeBoard item={practiceItem} practice={practice} onToggle={toggleSelection} />
                        <div className="practice-status">
                          <span id="practice-counter">已選 {practice.selected.size} 個</span>
                          <button className="rz-focus-ring" onClick={showHint}>
                            💡 提示
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
                          跳過
                        </button>
                        <button className="practice-confirm-btn rz-focus-ring" onClick={startStepping}>
                          分解動作 →
                        </button>
                      </>
                    ) : null}
                    {flow === 'stepping' ? (
                      <>
                        <button className="teach-done-btn rz-focus-ring" onClick={closeTeach}>
                          先跳過
                        </button>
                        <button className="teach-done-btn rz-focus-ring" onClick={startPractice}>
                          馬上練習 →
                        </button>
                      </>
                    ) : null}
                    {flow === 'practice' ? (
                      <>
                        <button className="practice-reveal-btn rz-focus-ring" onClick={revealPractice}>
                          看答案
                        </button>
                        <button className="practice-confirm-btn rz-focus-ring" onClick={submitPractice}>
                          確認消去
                        </button>
                      </>
                    ) : null}
                    {flow === 'result' ? (
                      <>
                        <button className="practice-reveal-btn rz-focus-ring" onClick={backToSteps}>
                          返回步驟
                        </button>
                        {(module?.practice.length ?? 0) > 0 ? (
                          <button className="practice-confirm-btn rz-focus-ring" onClick={retryPractice}>
                            再來一題
                          </button>
                        ) : null}
                        <button className="practice-reveal-btn rz-focus-ring" onClick={closeTeach}>
                          關閉
                        </button>
                      </>
                    ) : null}
                  </div>
                </motion.section>
              </Dialog.Content>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  );
}
