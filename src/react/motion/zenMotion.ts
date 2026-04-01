// Zen Motion System — unified motion tokens for all overlays.
// Inspired by calligraphy: slow start, steady middle, crisp finish.
// Matches CSS --ease-zen: cubic-bezier(.2,.8,.2,1)

import { buildMotionPolicy } from '../../shared/motion/policy';

export const ZEN = {
  // Duration (seconds)
  FADE_IN: 0.25,
  FADE_OUT: 0.18,
  STAGGER: 0.06,
  SETTLE: 0.35,

  // Easing — matches --ease-zen
  EASE_ZEN: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  EASE_OUT: [0, 0, 0.2, 1] as [number, number, number, number],

  // Scale
  SCALE_IN: 0.97,
  SCALE_OUT: 0.98,

  // Distance (px)
  SLIDE_Y: 12,
  SLIDE_X: 8,
} as const;

// Reusable framer-motion transition presets
export const zenTransitionIn = {
  duration: ZEN.FADE_IN,
  ease: ZEN.EASE_ZEN,
};

export const zenTransitionOut = {
  duration: ZEN.FADE_OUT,
  ease: ZEN.EASE_OUT,
};

export const zenStaggerContainer = {
  animate: {
    transition: {
      staggerChildren: ZEN.STAGGER,
      delayChildren: 0.08,
    },
  },
};

export const zenStaggerItem = {
  initial: { opacity: 0, y: ZEN.SLIDE_Y },
  animate: { opacity: 1, y: 0, transition: zenTransitionIn },
  exit: { opacity: 0, y: -ZEN.SLIDE_X, transition: zenTransitionOut },
};

/** Returns true if animations should be suppressed. */
export function isReducedMotion(): boolean {
  return buildMotionPolicy('expressive').reducedMotion;
}
