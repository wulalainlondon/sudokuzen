// MentorOverlay — React component replacing the legacy #mentor-overlay DOM.
// Simple text content overlay with dismiss button.

import { useCallback, type ReactElement } from 'react';
import { useMentorStore } from './mentorStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import type { SudokuWindow } from '../../facade/windowTypes';

export function MentorOverlay(): ReactElement {
  const { visible, text, subText } = useMentorStore();

  const handleDismiss = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    win.dismissMentor?.();
  }, []);

  return (
    <ZenOverlay visible={visible} onClose={handleDismiss} id="mentor-overlay">
      <div className="mentor-panel">
        <ZenStagger>
          <div className="mentor-text" id="mentor-text">{text}</div>
          <div className="mentor-sub" id="mentor-sub">{subText}</div>
          <button className="mentor-dismiss-btn" onClick={handleDismiss}>{"......"}</button>
        </ZenStagger>
      </div>
    </ZenOverlay>
  );
}
