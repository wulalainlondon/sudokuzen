// AchievementToast — React component replacing the legacy #achievement-toast DOM.
// Floating toast notification, NOT a modal. Auto-dismisses after 3s.

import { useEffect, useRef, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAchievementToastStore } from './achievementToastStore';
import { t } from '../../i18n/t';

export function AchievementToast(): ReactElement {
  const { visible, currentIcon, currentName } = useAchievementToastStore();
  const dismiss = useAchievementToastStore((s) => s.dismiss);
  const showNext = useAchievementToastStore((s) => s.showNext);
  const queue = useAchievementToastStore((s) => s.queue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Auto-dismiss after 3s
    timerRef.current = setTimeout(() => {
      dismiss();
      // After a short gap, show next if queued
      if (queue.length > 0) {
        setTimeout(() => showNext(), 400);
      }
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, dismiss, showNext, queue.length]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="achievement-toast"
          className="achievement-toast show"
          id="achievement-toast"
          style={{ zIndex: 200 }}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="achievement-toast-icon" id="achievement-toast-icon">{currentIcon}</div>
          <div className="achievement-toast-text">
            <span className="achievement-toast-label">{t('toast.achievementUnlock')}</span>
            <span className="achievement-toast-name" id="achievement-toast-name">{currentName}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
