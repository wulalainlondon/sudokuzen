// ZenOverlay — unified backdrop + content animation wrapper for all modals.
// Usage: wrap modal content inside <ZenOverlay visible={...} onClose={...}>

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, type ReactElement, type ReactNode } from 'react';
import { ZEN, zenTransitionIn, zenTransitionOut, isReducedMotion } from './zenMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ZenOverlayProps {
  visible: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** DOM id for the overlay container (for CSS targeting) */
  id?: string;
  /** Extra className on the overlay */
  className?: string;
  /** Disable backdrop click-to-close (e.g. for game over) */
  noBackdropClose?: boolean;
  /** Custom background tint for the backdrop */
  backdropTint?: string;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: zenTransitionIn },
  exit: { opacity: 0, transition: zenTransitionOut },
};

const contentVariants = {
  hidden: { opacity: 0, scale: ZEN.SCALE_IN, y: ZEN.SLIDE_Y },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...zenTransitionIn, duration: ZEN.FADE_IN + 0.05 },
  },
  exit: {
    opacity: 0,
    scale: ZEN.SCALE_OUT,
    y: -ZEN.SLIDE_X,
    transition: zenTransitionOut,
  },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};

export function ZenOverlay({
  visible,
  onClose,
  children,
  id,
  className,
  noBackdropClose,
  backdropTint,
}: ZenOverlayProps): ReactElement {
  const trapRef = useFocusTrap(visible);
  const reduced = isReducedMotion();

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (!noBackdropClose && e.target === e.currentTarget) onClose?.();
    },
    [onClose, noBackdropClose],
  );

  const bv = reduced ? reducedVariants : backdropVariants;
  const cv = reduced ? reducedVariants : contentVariants;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="zen-overlay-backdrop"
          id={id}
          className={className}
          ref={trapRef}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            zIndex: 150,
            background: backdropTint || 'var(--bg-color)',
          }}
          variants={bv}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={handleBackdrop}
        >
          <motion.div
            key="zen-overlay-content"
            variants={cv}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ width: '100%', display: 'contents' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
