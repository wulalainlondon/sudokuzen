// LibraryOverlay — React component replacing the legacy #library-overlay DOM.
// Uses hybrid approach: React owns the overlay shell, legacy renders the content list via ref.

import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { useLibraryStore } from './libraryStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { t } from '../../i18n/t';
import type { SudokuWindow } from '../../facade/windowTypes';

export function LibraryOverlay(): ReactElement {
  const visible = useLibraryStore((s) => s.visible);
  const listRef = useRef<HTMLDivElement>(null);

  // When opening, render library cards via legacy function
  useEffect(() => {
    if (visible && listRef.current) {
      // Legacy renderLibraryCards uses gs.libraryListEl — we wire it up
      import('../../features/teach-legacy')
        .then(({ renderLibraryCards }) => {
          renderLibraryCards();
        })
        .catch(() => {});
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

  const handleClose = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    win.closeLibraryOverlay?.();
  }, []);

  return (
    <ZenOverlay visible={visible} onClose={handleClose} id="library-overlay" className="show">
      <div className="library-page">
        <ZenStagger>
          <div className="library-header">
            <button className="library-back-btn" onClick={handleClose}>
              {t('nav.back')}
            </button>
            <h2 className="library-title">{t('library.title')}</h2>
            <div className="library-subtitle">{t('library.subtitle')}</div>
          </div>
          <div className="library-list" id="library-list" ref={listRef} />
        </ZenStagger>
      </div>
    </ZenOverlay>
  );
}
