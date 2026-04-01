import { motion } from 'framer-motion';
import { useCallback, type ReactElement } from 'react';
import { useGameOverStore } from './gameOverStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { ZEN, isReducedMotion } from '../motion/zenMotion';
import { t } from '../../i18n/t';

function backText(mode: string, wildSession: { round: number; hasMore: boolean } | null): string {
  if (mode === 'wild' && wildSession?.hasMore) return t('nav.continueSession', { round: wildSession.round });
  if (mode === 'wild') return t('nav.leaveWorld');
  if (mode === 'practice') return t('nav.backToPractice');
  return t('nav.backToLevels');
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
  const heading = isWild ? t('gameover.headingWild') : t('gameover.headingNormal');
  const subtext = isWild && techName
    ? t('gameover.subtextWild', { tech: techName })
    : t('gameover.subtextNormal');
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
            <div className="gameover-mentor-attr">{t('gameover.ironmanQuoteAttr')}</div>
            <div className="gameover-mentor-text">
              {t('gameover.ironmanQuote')}
            </div>
          </div>
        )}
        <button className="retry-btn" onClick={handleRetry}>{t('nav.retry')}</button>
        <button className="back-btn" onClick={handleBack}>{backText(mode, wildSession)}</button>
      </ZenStagger>
    </ZenOverlay>
  );
}
