// DuoResultModal — React component replacing the legacy #duo-result-modal DOM.
// Uses hybrid approach: React owns the modal shell, content is rendered via dangerouslySetInnerHTML.

import { useCallback, useEffect, useMemo, type CSSProperties, type ReactElement } from 'react';
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
    dur: `${1.45 + Math.random() * 0.8}s`,
    delay: `${Math.random() * 0.16}s`,
    drift: `${-70 + Math.random() * 140}px`,
    spin: `${240 + Math.random() * 420}deg`,
    size: `${6 + Math.random() * 5}px`,
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
          style={
            {
              left: d.left,
              background: d.bg,
              animationDuration: d.dur,
              animationDelay: d.delay,
              width: d.size,
              height: `calc(${d.size} * 1.45)`,
              '--confetti-drift': d.drift,
              '--confetti-spin': d.spin,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function DuoResultModal(): ReactElement {
  const {
    visible,
    contentHtml,
    iWon,
    isDraw,
    hostMoves,
    guestMoves,
    hostAlias,
    guestAlias,
    puzzle,
    rematchPending,
    openedAtMs,
    setRematchPending,
  } = useDuoResultStore();
  const safeContentHtml = useMemo(() => sanitizeHtml(contentHtml), [contentHtml]);

  const handlePlayAgain = useCallback(() => {
    if (rematchPending) return;
    setRematchPending(true);
    import('../../features/duo/duoGame')
      .then((m) => {
        return m.requestDuoRematch();
      })
      .catch(() => setRematchPending(false));
  }, [rematchPending, setRematchPending]);

  useEffect(() => {
    if (!rematchPending) return;
    const timeout = window.setTimeout(() => setRematchPending(false), 12_000);
    return () => window.clearTimeout(timeout);
  }, [rematchPending, setRematchPending]);

  const handleBack = useCallback(() => {
    if (rematchPending) return;
    import('../../features/duo/duoGame').then((m) => m.closeDuoResult()).catch(() => {});
  }, [rematchPending]);

  const handleReview = useCallback(() => {
    const hasData = hostMoves.length > 0 || guestMoves.length > 0;
    if (!hasData) return;
    import('../duoreview/duoReviewBridge')
      .then(({ bridgeOpenDuoReview }) => {
        bridgeOpenDuoReview({ hostMoves, guestMoves, hostAlias, guestAlias, puzzle });
      })
      .catch(() => {});
  }, [hostMoves, guestMoves, hostAlias, guestAlias, puzzle]);

  const showConfetti = iWon || isDraw;
  const confettiCount = iWon ? 52 : 34;
  const confettiColors = iWon ? CONFETTI_COLORS_WIN : CONFETTI_COLORS_DRAW;

  const panelClass = `duo-result-panel${iWon ? ' victory' : isDraw ? '' : visible ? ' defeat' : ''}${rematchPending ? ' rematch-pending' : ''}`;
  const titleClass = iWon ? 'victory-title' : isDraw ? 'draw-title' : 'defeat-title';
  const outcomeIcon = iWon ? '🏆' : isDraw ? '⚔️' : '◈';
  const outcomeTitle = iWon
    ? t('duoRuntime.resultVictoryTitle')
    : isDraw
      ? t('duoRuntime.resultDrawTitle')
      : t('duoRuntime.resultDefeatTitle');
  const backdropTint = iWon
    ? 'radial-gradient(circle at 50% 24%, rgba(255, 215, 0, 0.14), transparent 38%), var(--bg-color)'
    : isDraw
      ? 'radial-gradient(circle at 50% 24%, rgba(116, 185, 255, 0.12), transparent 38%), var(--bg-color)'
      : 'radial-gradient(circle at 50% 24%, rgba(214, 48, 49, 0.09), transparent 38%), var(--bg-color)';

  useEffect(() => {
    if (!visible) return;
    performance.mark?.('duo:result-mounted');
    window.dispatchEvent(
      new CustomEvent('duo:ux', {
        detail: {
          name: 'result-mounted',
          timestamp: performance.now(),
          requestToMountMs: openedAtMs > 0 ? performance.now() - openedAtMs : null,
        },
      }),
    );
  }, [visible, openedAtMs]);

  return (
    <ZenOverlay
      visible={visible}
      onClose={handleBack}
      id="duo-result-modal"
      className={`duo-result-overlay ${iWon ? 'victory' : isDraw ? 'draw' : 'defeat'}`}
      noBackdropClose
      backdropTint={backdropTint}
    >
      <div className={panelClass}>
        <div className="duo-result-aura" aria-hidden="true" />
        {showConfetti && <ConfettiLayer count={confettiCount} colors={confettiColors} />}
        <div className="duo-result-eyebrow">{t('duo.resultTitle')}</div>
        <div className="duo-result-outcome-icon" aria-hidden="true">
          {outcomeIcon}
        </div>
        <h2 className={titleClass}>{outcomeTitle}</h2>
        {/* Safety: contentHtml built by our own duo.ts code (trusted) */}
        <div dangerouslySetInnerHTML={{ __html: safeContentHtml }} />
        <button
          className="resume-btn duo-rematch-btn"
          onClick={handlePlayAgain}
          disabled={rematchPending}
          aria-busy={rematchPending}
        >
          {rematchPending && <span className="duo-rematch-spinner" aria-hidden="true" />}
          {rematchPending ? t('duo.rematchPreparing') : t('duo.playAgain')}
        </button>
        {(hostMoves.length > 0 || guestMoves.length > 0) && (
          <button
            className="back-btn"
            style={{ border: '1px solid rgba(167,139,250,0.5)', fontSize: '0.85rem', color: '#a78bfa', marginTop: 4 }}
            onClick={handleReview}
            disabled={rematchPending}
          >
            {t('duo.reviewReplay')}
          </button>
        )}
        <button
          className="back-btn"
          style={{ border: 'none', fontSize: '0.8rem', color: 'var(--text-light)' }}
          onClick={handleBack}
          disabled={rematchPending}
        >
          {t('duo.backToLobby')}
        </button>
      </div>
    </ZenOverlay>
  );
}
