// MentorOverlay — React component replacing the legacy #mentor-overlay DOM.
// Simple text content overlay with dismiss button.

import { useCallback, type ReactElement } from 'react';
import { useMentorStore } from './mentorStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

export function MentorOverlay(): ReactElement | null {
  const { visible, text, subText } = useMentorStore();
  const trapRef = useFocusTrap(visible);

  const handleDismiss = useCallback(() => {
    (window as any).dismissMentor?.();
  }, []);

  if (!visible) return null;

  return (
    <div id="mentor-overlay" ref={trapRef}>
      <div className="mentor-panel">
        <div className="mentor-text" id="mentor-text">{text}</div>
        <div className="mentor-sub" id="mentor-sub">{subText}</div>
        <button className="mentor-dismiss-btn" onClick={handleDismiss}>{"......"}</button>
      </div>
    </div>
  );
}
