// LibraryOverlay — React component replacing the legacy #library-overlay DOM.
// Uses hybrid approach: React owns the overlay shell, legacy renders the content list via ref.

import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { useLibraryStore } from './libraryStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

export function LibraryOverlay(): ReactElement | null {
  const visible = useLibraryStore((s) => s.visible);
  const trapRef = useFocusTrap(visible);
  const listRef = useRef<HTMLDivElement>(null);

  // When opening, render library cards via legacy function
  useEffect(() => {
    if (visible && listRef.current) {
      // Legacy renderLibraryCards uses gs.libraryListEl — we wire it up
      import('../../features/teach-legacy').then(({ renderLibraryCards }) => {
        renderLibraryCards();
      });
    }
  }, [visible]);

  // Manage body class for scroll locking
  useEffect(() => {
    if (visible) {
      document.body.classList.add('library-open');
    } else {
      document.body.classList.remove('library-open');
    }
    return () => {
      document.body.classList.remove('library-open');
    };
  }, [visible]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        (window as any).closeLibraryOverlay?.();
      }
    },
    [],
  );

  const handleBack = useCallback(() => {
    (window as any).closeLibraryOverlay?.();
  }, []);

  if (!visible) return null;

  return (
    <div id="library-overlay" className="show" onClick={handleBackdropClick} ref={trapRef}>
      <div className="library-page">
        <div className="library-header">
          <button className="library-back-btn" onClick={handleBack}>{"<- 返回"}</button>
          <h2 className="library-title">{"境界秘笈"}</h2>
          <div className="library-subtitle">{"依境界由淺入深研讀"}</div>
        </div>
        <div className="library-list" id="library-list" ref={listRef} />
      </div>
    </div>
  );
}
