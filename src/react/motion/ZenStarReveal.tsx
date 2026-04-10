// ZenStarReveal — stars light up one by one with a scale pulse.
// Used for win celebration star rating display.

import { motion } from 'framer-motion';
import { useMemo, type ReactElement } from 'react';
import { ZEN, isReducedMotion } from './zenMotion';

interface ZenStarRevealProps {
  stars: number; // 1-3 earned
  total?: number; // max stars (default 3)
  /** Delay before the first star appears */
  delay?: number;
  className?: string;
}

const starVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: (i: number) => ({
    opacity: 1,
    scale: [0.5, 1.2, 1],
    transition: {
      delay: i * 0.18,
      duration: ZEN.SETTLE,
      ease: ZEN.EASE_ZEN,
      scale: {
        delay: i * 0.18,
        duration: ZEN.SETTLE,
        times: [0, 0.6, 1],
        ease: ZEN.EASE_ZEN,
      },
    },
  }),
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
};

export function ZenStarReveal({ stars, total = 3, delay = 0, className }: ZenStarRevealProps): ReactElement {
  const reduced = isReducedMotion();

  const items = useMemo(() => {
    const arr: { char: string; earned: boolean }[] = [];
    for (let i = 0; i < total; i++) {
      arr.push({ char: i < stars ? '★' : '☆', earned: i < stars });
    }
    return arr;
  }, [stars, total]);

  if (reduced) {
    return (
      <span className={className}>
        {'★'.repeat(stars)}
        {'☆'.repeat(total - stars)}
      </span>
    );
  }

  return (
    <span className={className} style={{ display: 'inline-flex', gap: 4 }}>
      {items.map((item, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={item.earned ? starVariants : reducedVariants}
          initial="hidden"
          animate="visible"
          style={{
            display: 'inline-block',
            color: item.earned ? 'var(--star-color)' : 'var(--text-light)',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            animationDelay: `${delay}s`,
          }}
        >
          {item.char}
        </motion.span>
      ))}
    </span>
  );
}
