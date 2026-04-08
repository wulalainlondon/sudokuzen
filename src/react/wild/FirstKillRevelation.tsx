// FirstKillRevelation — ceremony overlay for first technique conquest.
// Sequence: black backdrop fades in → technique name drifts up into view → holds → fades out → win screen.
//
// Visual language: same ink-and-silence aesthetic as EncounterTransition.
// No flash, no curtains. Light and stillness make the moment.

import { useEffect, useRef, useCallback, useState, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFirstKillRevelationStore } from './firstKillRevelationStore';
import { isReducedMotion } from '../motion/zenMotion';

// ── Timings (ms) ─────────────────────────────────────────────────────

const FADE_OUT_AT  = 1600;  // backdrop + name begin fading out
const COMPLETE_AT  = 2000;  // dismiss → win screen appears

const EASE_ZEN: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

// ── Component ────────────────────────────────────────────────────────

export function FirstKillRevelation(): ReactElement {
  const { active, techName, onComplete, dismiss } = useFirstKillRevelationStore();

  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycleRef = useRef(0);
  const reduced  = isReducedMotion();

  const clearTimers = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }, []);

  useEffect(() => {
    if (!active) {
      clearTimers();
      return;
    }

    cycleRef.current++;
    const currentCycle = cycleRef.current;

    if (reduced) {
      const t = setTimeout(() => {
        if (cycleRef.current !== currentCycle) return;
        setExiting(false);
        dismiss();
        onComplete?.();
      }, 150);
      timerRef.current.push(t);
      return clearTimers;
    }

    // Reset exit state for this cycle, then begin fade-out
    const t0 = setTimeout(() => {
      if (cycleRef.current !== currentCycle) return;
      setExiting(false);
    }, 0);

    const t1 = setTimeout(() => {
      if (cycleRef.current !== currentCycle) return;
      setExiting(true);
    }, FADE_OUT_AT);

    // Dismiss + open win screen
    const t2 = setTimeout(() => {
      if (cycleRef.current !== currentCycle) return;
      dismiss();
      onComplete?.();
    }, COMPLETE_AT);

    timerRef.current.push(t0, t1, t2);
    return clearTimers;
  }, [active, reduced, dismiss, onComplete, clearTimers]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="first-kill-revelation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 165,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Black backdrop */}
          <motion.div
            style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay, #050505)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            transition={{
              duration: exiting ? 0.4 : 0.3,
              ease: EASE_ZEN,
            }}
          />

          {/* Technique name */}
          <motion.div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '0 28px',
              textAlign: 'center',
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{
              opacity: exiting ? 0 : 1,
              y: exiting ? -6 : 0,
            }}
            transition={{
              duration: exiting ? 0.35 : 0.5,
              delay: exiting ? 0 : 0.2,
              ease: EASE_ZEN,
            }}
          >
            {/* Eyebrow line */}
            <div
              style={{
                width: '32px',
                height: '1px',
                background: 'color-mix(in srgb, var(--star-color) 40%, transparent)',
                marginBottom: '4px',
              }}
            />

            {/* Technique name */}
            <div
              style={{
                fontSize: 'min(9.5vw, 38px)',
                fontWeight: 700,
                color: 'var(--star-color)',
                letterSpacing: '6px',
                lineHeight: 1.2,
              }}
            >
              {techName}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
