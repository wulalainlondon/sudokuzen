// DuoResultModal — React component replacing the legacy #duo-result-modal DOM.
// Uses hybrid approach: React owns the modal shell, content is rendered via dangerouslySetInnerHTML.

import { useCallback, useMemo, type ReactElement } from 'react';
import { useDuoResultStore } from './duoResultStore';
import { ZenOverlay } from '../motion/ZenOverlay';

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

  const handleClose = useCallback(() => {
    (window as any).closeDuoResult?.();
  }, []);

  const showConfetti = iWon || isDraw;
  const confettiCount = iWon ? 30 : 25;
  const confettiColors = iWon ? CONFETTI_COLORS_WIN : CONFETTI_COLORS_DRAW;

  return (
    <ZenOverlay visible={visible} onClose={handleClose} id="duo-result-modal">
      <div className="duo-result-panel">
        {showConfetti && <ConfettiLayer count={confettiCount} colors={confettiColors} />}
        <h2>{"💑 雙人對決結果"}</h2>
        <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
        <button className="resume-btn" onClick={handleClose}>再來一局</button>
        <button className="back-btn" style={{ border: 'none', fontSize: '0.8rem', color: 'var(--text-light)' }} onClick={handleClose}>返回選關</button>
      </div>
    </ZenOverlay>
  );
}
