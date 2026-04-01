// ZenStagger — children appear one by one with staggered delay.
// Wrap child elements; each direct child gets the stagger animation.

import { motion } from 'framer-motion';
import type { ReactElement, ReactNode } from 'react';
import { ZEN, zenTransitionIn, zenTransitionOut, isReducedMotion } from './zenMotion';

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: ZEN.STAGGER,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: ZEN.SLIDE_Y },
  visible: { opacity: 1, y: 0, transition: zenTransitionIn },
  exit: { opacity: 0, transition: zenTransitionOut },
};

const reducedItemVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};

export function ZenStagger({ children }: { children: ReactNode }): ReactElement {
  const reduced = isReducedMotion();
  const iv = reduced ? reducedItemVariants : itemVariants;

  // Wrap each child in a motion.div for stagger
  const items = Array.isArray(children) ? children : [children];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ display: 'contents' }}>
      {items.map((child, i) =>
        child ? (
          <motion.div key={i} variants={iv} style={{ display: 'contents' }}>
            {child}
          </motion.div>
        ) : null,
      )}
    </motion.div>
  );
}
