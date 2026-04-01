// AchievementToast — React component replacing the legacy #achievement-toast DOM.
// Floating toast notification, NOT a modal. Auto-dismisses after 3s.

import { useEffect, useRef, type ReactElement } from 'react';
import { useAchievementToastStore } from './achievementToastStore';

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
    <div className={`achievement-toast${visible ? ' show' : ''}`} id="achievement-toast">
      <div className="achievement-toast-icon" id="achievement-toast-icon">{currentIcon}</div>
      <div className="achievement-toast-text">
        <span className="achievement-toast-label">{"成就解鎖"}</span>
        <span className="achievement-toast-name" id="achievement-toast-name">{currentName}</span>
      </div>
    </div>
  );
}
