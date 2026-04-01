import { motion } from 'framer-motion';
import { useCallback, type ReactElement } from 'react';
import { useGameOverStore } from './gameOverStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { ZEN, isReducedMotion } from '../motion/zenMotion';

function backText(mode: string, wildSession: { round: number; hasMore: boolean } | null): string {
  if (mode === 'wild' && wildSession?.hasMore) return `繼續修行 (${wildSession.round}/10)`;
  if (mode === 'wild') return '離開世界';
  if (mode === 'practice') return '返回修行';
  return '返回選關';
}

// Subtle shake for the heading — conveys "regret", not "alarm"
const shakeVariants = {
  hidden: { x: 0 },
  visible: isReducedMotion()
    ? { x: 0 }
    : {
        x: [0, -3, 3, -2, 2, 0],
        transition: { duration: ZEN.SETTLE, delay: 0.1, ease: ZEN.EASE_ZEN },
      },
};

export function GameOverOverlay(): ReactElement {
  const { visible, mode, wildSession, techName, isIronman } = useGameOverStore();
  const close = useGameOverStore((s) => s.close);

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

  const isWild = mode === 'wild';
  const heading = isWild ? '逃脫了。' : 'GAME OVER';
  const subtext = isWild && techName
    ? `「${techName}」消失在候選數的迷霧裡。`
    : '你犯了 3 次錯誤';
  const bg = isWild ? 'radial-gradient(circle at top, rgba(0,0,0,0.22), var(--bg-color) 60%)' : undefined;

  return (
    <ZenOverlay visible={visible} onClose={close} id="overlay" noBackdropClose backdropTint={bg}>
      <ZenStagger>
        <motion.h2 variants={shakeVariants} initial="hidden" animate="visible">
          {heading}
        </motion.h2>
        <p>{subtext}</p>
        {isWild && isIronman && (
          <div className="gameover-mentor-quote">
            <div className="gameover-mentor-attr">── 弈塵《殘篇》──</div>
            <div className="gameover-mentor-text">
              「鐵壁不是永遠不犯錯。{'\n'}是犯錯的時候，不會再犯第二次。」
            </div>
          </div>
        )}
        <button className="retry-btn" onClick={handleRetry}>重新開始</button>
        <button className="back-btn" onClick={handleBack}>{backText(mode, wildSession)}</button>
      </ZenStagger>
    </ZenOverlay>
  );
}
