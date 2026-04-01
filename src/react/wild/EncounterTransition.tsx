// EncounterTransition — ink-wash encounter reveal overlay for World mode.
// Full-screen transition with 4 phases: ink expand, technique reveal, mode stamp, ink contract.

import { useEffect, useRef, useCallback, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEncounterTransitionStore } from './encounterTransitionStore';
import { isReducedMotion } from '../motion/zenMotion';

// ── Rarity color map ─────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  common: '#DFE6E9',
  rare: '#E2B93B',
  legendary: '#A29BFE',
  mythic: '#D63031',
};

// ── Challenge mode single-character labels ───────────────────────────

const MODE_CHARS: Record<string, string> = {
  standard: '修',
  blind: '盲',
  ironman: '鐵',
  noNotes: '念',
  timed: '限',
  gauntlet: '百',
};

// ── Phase timings (ms) ───────────────────────────────────────────────

const PHASE1_END = 400;
const PHASE2_END = 1200;
const PHASE3_END = 1600;
const PHASE4_END = 2200;

export function EncounterTransition(): ReactElement {
  const {
    active,
    techName,
    techSubtitle,
    rarity,
    challengeMode,
    isBoss,
    isFirstEncounter,
    dismiss,
  } = useEncounterTransitionStore();

  const phaseRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduced = isReducedMotion();

  const cleanup = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
    phaseRef.current = 0;
  }, []);

  useEffect(() => {
    if (!active) {
      cleanup();
      return;
    }

    // Reduced motion: show briefly then dismiss
    if (reduced) {
      const t = setTimeout(() => dismiss(), 300);
      timerRef.current.push(t);
      return cleanup;
    }

    // Phase 1: Ink wash expand (0ms) — audio triggered by wildController
    phaseRef.current = 1;

    // Phase 2: Technique reveal (400ms)
    const t2 = setTimeout(() => {
      phaseRef.current = 2;
    }, PHASE1_END);
    timerRef.current.push(t2);

    // Phase 3: Mode stamp (1200ms)
    const t3 = setTimeout(() => {
      phaseRef.current = 3;
    }, PHASE2_END);
    timerRef.current.push(t3);

    // Phase 4: Ink contracts + dismiss (1600ms -> 2200ms)
    const t4 = setTimeout(() => {
      phaseRef.current = 4;
      dismiss();
    }, PHASE4_END);
    timerRef.current.push(t4);

    return cleanup;
  }, [active, reduced, dismiss, cleanup]);

  const color = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const modeChar = MODE_CHARS[challengeMode] || '修';
  const showNonStandardMode = challengeMode !== 'standard';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="encounter-transition"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] } }}
        >
          {/* Phase 1: Ink wash backdrop */}
          <motion.div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, #0a0a0a 0%, #000 100%)',
            }}
            initial={{ opacity: 0, scale: 0.1, borderRadius: '50%' }}
            animate={{
              opacity: 1,
              scale: 2.5,
              borderRadius: '0%',
              transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.1,
              borderRadius: '50%',
              transition: { duration: 0.5, ease: [0.4, 0, 1, 1] },
            }}
          />

          {/* Phase 2: Technique name + subtitle */}
          <motion.div
            style={{
              position: 'relative',
              zIndex: 2,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { delay: PHASE1_END / 1000, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
            }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            {/* First encounter badge */}
            {isFirstEncounter && (
              <motion.div
                style={{
                  fontSize: '14px',
                  letterSpacing: '4px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontWeight: 300,
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { delay: PHASE1_END / 1000 + 0.15, duration: 0.4 },
                }}
              >
                {'初遇'}
              </motion.div>
            )}

            {/* Technique name */}
            <motion.div
              style={{
                fontSize: '42px',
                fontWeight: 700,
                color,
                letterSpacing: '6px',
                textShadow: `0 0 30px ${color}44`,
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  delay: PHASE1_END / 1000 + 0.05,
                  duration: 0.5,
                  ease: [0.2, 0.8, 0.2, 1],
                },
              }}
            >
              {techName}
            </motion.div>

            {/* Subtitle */}
            <motion.div
              style={{
                fontSize: '16px',
                color: 'rgba(255, 255, 255, 0.5)',
                letterSpacing: '2px',
                fontWeight: 300,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { delay: PHASE1_END / 1000 + 0.2, duration: 0.4 },
              }}
            >
              {techSubtitle}
            </motion.div>

            {/* Phase 3: Challenge mode stamp */}
            {showNonStandardMode && (
              <motion.div
                style={{
                  marginTop: '24px',
                  fontSize: isBoss ? '32px' : '28px',
                  fontWeight: 900,
                  color: isBoss ? '#D63031' : 'rgba(255, 255, 255, 0.7)',
                  letterSpacing: '8px',
                }}
                initial={{ opacity: 0, scale: 2.5 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: {
                    delay: PHASE2_END / 1000,
                    duration: 0.3,
                    ease: [0.2, 0.8, 0.2, 1],
                  },
                }}
              >
                {isBoss ? '天劫' : modeChar}
              </motion.div>
            )}

            {/* Boss indicator (even for standard mode) */}
            {isBoss && !showNonStandardMode && (
              <motion.div
                style={{
                  marginTop: '24px',
                  fontSize: '32px',
                  fontWeight: 900,
                  color: '#D63031',
                  letterSpacing: '8px',
                }}
                initial={{ opacity: 0, scale: 2.5 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: {
                    delay: PHASE2_END / 1000,
                    duration: 0.3,
                    ease: [0.2, 0.8, 0.2, 1],
                  },
                  // Shake keyframes for boss
                  x: [0, -3, 3, -2, 2, 0],
                }}
              >
                {'天劫'}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
