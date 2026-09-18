// MentorOverlay — React component replacing the legacy #mentor-overlay DOM.
// Simple text content overlay with dismiss button.

import { useCallback, type ReactElement } from 'react';
import { useMentorStore } from './mentorStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import type { SudokuWindow } from '../../facade/windowTypes';
import { t } from '../../i18n/t';

export function MentorOverlay(): ReactElement {
  const { visible, text, subText, dismissLabelKey } = useMentorStore();

  const handleDismiss = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    win.dismissMentor?.();
  }, []);

  return (
    <ZenOverlay visible={visible} onClose={handleDismiss} id="mentor-overlay">
      <div className="mentor-panel">
        <ZenStagger>
          <div className="mentor-text" id="mentor-text" style={{ whiteSpace: 'pre-wrap' }}>
            {text}
          </div>
          <div className="mentor-sub" id="mentor-sub" style={{ whiteSpace: 'pre-wrap' }}>
            {subText}
          </div>
          <button className="mentor-dismiss-btn" onClick={handleDismiss}>
            {t(dismissLabelKey)}
          </button>
        </ZenStagger>
      </div>
    </ZenOverlay>
  );
}
