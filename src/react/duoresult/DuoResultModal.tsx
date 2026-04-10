// DuoResultModal — React component replacing the legacy #duo-result-modal DOM.
// Uses hybrid approach: React owns the modal shell, content is rendered via dangerouslySetInnerHTML.

import { useCallback, useMemo, type ReactElement } from 'react';
import { useDuoResultStore } from './duoResultStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { t } from '../../i18n/t';
import { sanitizeHtml } from '../../shared/html/sanitize';

const CONFETTI_COLORS_WIN = ['#FFD700', '#FF6B6B', '#74b9ff', '#55efc4', '#a29bfe'];
const CONFETTI_COLORS_DRAW = ['#fd79a8', '#a29bfe', '#74b9ff', '#dfe6e9', '#fab1a0'];

function generateConfettiData(count: number, colors: string[]) {
  return Array.from({ length: count }, () => ({
    left: `${Math.random() * 100}%`,
    bg: colors[Math.floor(Math.random() * colors.length)],
    dur: `${2 + Math.random() * 1.3}s`,
    delay: `${Math.random() * 0.4}s`,
  }));
}

function ConfettiLayer({ count, colors }: { count: number; colors: string[] }): ReactElement {
  const data = useMemo(() => generateConfettiData(count, colors), [count, colors]);
  return (
    <div className="confetti-layer" id="duo-confetti-layer">
      {data.map((d, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: d.left,
            background: d.bg,
            animationDuration: d.dur,
            animationDelay: d.delay,
          }}
        />
      ))}
    </div>
  );
}

export function DuoResultModal(): ReactElement {
  const { visible, contentHtml, iWon, isDraw } = useDuoResultStore();
  const safeContentHtml = useMemo(() => sanitizeHtml(contentHtml), [contentHtml]);

  const handlePlayAgain = useCallback(() => {
    // Close result modal and navigate back to duo lobby for rematch
    import('../../features/duo/duoGame')
      .then((m) => {
        m.closeDuoResult();
      })
      .catch(() => {});
  }, []);

  const handleBack = useCallback(() => {
    import('../../features/duo/duoGame').then((m) => m.closeDuoResult()).catch(() => {});
  }, []);

  const showConfetti = iWon || isDraw;
  const confettiCount = iWon ? 30 : 25;
  const confettiColors = iWon ? CONFETTI_COLORS_WIN : CONFETTI_COLORS_DRAW;

  const panelClass = `duo-result-panel${iWon ? ' victory' : isDraw ? '' : visible ? ' defeat' : ''}`;
  const titleClass = iWon ? 'victory-title' : isDraw ? 'draw-title' : 'defeat-title';

  return (
    <ZenOverlay visible={visible} onClose={handleBack} id="duo-result-modal">
      <div className={panelClass}>
        {showConfetti && <ConfettiLayer count={confettiCount} colors={confettiColors} />}
        <h2 className={titleClass}>{t('duo.resultTitle')}</h2>
        {/* Safety: contentHtml built by our own duo.ts code (trusted) */}
        <div dangerouslySetInnerHTML={{ __html: safeContentHtml }} />
        <button className="resume-btn" onClick={handlePlayAgain}>
          {t('duo.playAgain')}
        </button>
        <button
          className="back-btn"
          style={{ border: 'none', fontSize: '0.8rem', color: 'var(--text-light)' }}
          onClick={handleBack}
        >
          {t('duo.backToLobby')}
        </button>
      </div>
    </ZenOverlay>
  );
}
