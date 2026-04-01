import { useCallback, type ReactElement } from 'react';
import { useGameOverStore } from './gameOverStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

function backText(mode: string, wildSession: { round: number; hasMore: boolean } | null): string {
  if (mode === 'wild' && wildSession?.hasMore) return `繼續修行 (${wildSession.round}/10)`;
  if (mode === 'wild') return '離開世界';
  if (mode === 'practice') return '返回修行';
  return '返回選關';
}

export function GameOverOverlay(): ReactElement | null {
  const { visible, mode, wildSession } = useGameOverStore();
  const close = useGameOverStore((s) => s.close);
  const trapRef = useFocusTrap(visible);

  const handleRetry = useCallback(() => {
    (window as any).resetGame?.();
    close();
  }, [close]);

  const handleBack = useCallback(() => {
    if (mode === 'wild' && wildSession?.hasMore) {
      (window as any).continueWild?.();
    } else if (mode === 'wild') {
      (window as any).exitWild?.();
      (window as any).showLevelScreen?.(true);
    } else {
      (window as any).showLevelScreen?.(true);
    }
    close();
  }, [mode, wildSession, close]);

  if (!visible) return null;

  return (
    <div id="overlay" style={{ display: 'flex' }} ref={trapRef}>
      <h2>GAME OVER</h2>
      <p>你犯了 3 次錯誤</p>
      <button className="retry-btn" onClick={handleRetry}>重新開始</button>
      <button className="back-btn" onClick={handleBack}>{backText(mode, wildSession)}</button>
    </div>
  );
}
