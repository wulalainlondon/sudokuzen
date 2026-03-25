import type { MotionPolicy, MotionPreset, PerformanceTier } from '../../entities/motion';

function detectPerformanceTier(): PerformanceTier {
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) return 'low';
  if (cores <= 8) return 'medium';
  return 'high';
}

function detectReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function buildMotionPolicy(preferredPreset: MotionPreset = 'expressive'): MotionPolicy {
  const reducedMotion = detectReducedMotion();
  const performanceTier = detectPerformanceTier();
  const preset: MotionPreset = reducedMotion ? 'none' : preferredPreset;

  const allowCanvasFx = !reducedMotion && performanceTier !== 'low';
  const allowGsapTimeline = !reducedMotion && performanceTier === 'high';

  return {
    preset,
    reducedMotion,
    performanceTier,
    allowCanvasFx,
    allowGsapTimeline,
  };
}
