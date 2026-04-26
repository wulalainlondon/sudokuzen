// WinCelebration — React component with Zen Motion System.
// Renders differently for normal / practice / wild modes.

import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useWinStore, type WinMode } from './winStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { ZenStarReveal } from '../motion/ZenStarReveal';
import { ZenCountUp } from '../motion/ZenCountUp';
import { t } from '../../i18n/t';
import type { SudokuWindow } from '../../facade/windowTypes';
import { sanitizeHtml } from '../../shared/html/sanitize';

// ── Helpers ────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#0984E3', '#74B9FF', '#A29BFE', '#DFE6E9', '#B2BEC3'];

function headingText(mode: WinMode): string {
  if (mode === 'wild') return t('win.headingWild');
  if (mode === 'practice') return t('win.headingPractice');
  return t('win.headingNormal');
}

// ── Confetti layer ─────────────────────────────────────────────────────

function generateConfettiData(count: number) {
  return Array.from({ length: count }, () => ({
    left: `${Math.random() * 100}%`,
    bg: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    dur: `${2.1 + Math.random() * 1.3}s`,
    delay: `${Math.random() * 0.4}s`,
    rotate: `${Math.random() * 180}deg`,
  }));
}

function ConfettiLayer({ count }: { count: number }): ReactElement {
  const data = useMemo(() => generateConfettiData(count), [count]);
  return (
    <div className="confetti-layer">
      {data.map((d, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: d.left,
            background: d.bg,
            animationDuration: d.dur,
            animationDelay: d.delay,
            transform: `translateY(-20px) rotate(${d.rotate})`,
          }}
        />
      ))}
    </div>
  );
}

// ── Metric display ─────────────────────────────────────────────────────

function MetricDisplay(): ReactElement {
  const {
    mode,
    stars,
    isSpeedrun,
    submissions,
    expGained,
    leveledUp,
    newLevel,
    beatMentor,
    cleanSolveBonus,
    wildSession,
  } = useWinStore();

  if (mode === 'wild') {
    if (wildSession && wildSession.round >= 10) {
      const streakMult = wildSession.wins >= 10 ? 1.5 : wildSession.wins >= 8 ? 1.3 : wildSession.wins >= 5 ? 1.1 : 1.0;
      return (
        <div className="win-stars">
          {t('win.sessionComplete')}
          <br />
          {t('win.sessionWins', { wins: wildSession.wins, exp: wildSession.totalExp })}
          {streakMult > 1 && (
            <>
              <br />
              {t('win.streakBonus', { mult: streakMult })}
            </>
          )}
        </div>
      );
    }
    const mentorBonus = beatMentor ? t('win.beatMentor') : '';
    return (
      <div className="win-stars">
        {leveledUp
          ? t('win.expLevelUp', { exp: expGained, level: newLevel }) + mentorBonus
          : t('win.expGained', { exp: expGained }) + mentorBonus}
        {cleanSolveBonus > 0 && (
          <div style={{ fontSize: '13px', color: 'rgba(100, 221, 180, 0.85)', letterSpacing: '1px' }}>
            +{cleanSolveBonus} {t('wild.cleanSolveBonus')}
          </div>
        )}
      </div>
    );
  }

  if (isSpeedrun) {
    return <div className="win-stars">{t('win.speedrunSubmissions', { count: submissions })}</div>;
  }

  return (
    <div className="win-stars">
      <ZenStarReveal stars={stars} />
    </div>
  );
}

// ── Action buttons ─────────────────────────────────────────────────────

function ActionButtons(): ReactElement {
  const { mode, wildSession, showReplay } = useWinStore();
  const close = useWinStore((s) => s.close);

  const handleReplay = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    win.openReplayModal?.();
  }, []);

  const handleNext = useCallback(() => {
    if (mode === 'practice') {
      import('../../features/practice/practiceLobby').then((m) => m.startNextPracticeLevel()).catch(() => {});
    } else {
      import('../../features/levels').then((m) => m.advanceToNextLevel()).catch(() => {});
    }
    close();
  }, [mode, close]);

  const handleWildContinue = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    win.continueWild?.();
    close();
  }, [close]);

  const handleBack = useCallback(() => {
    const win = window as unknown as SudokuWindow;
    if (mode === 'wild') {
      win.exitWild?.();
    }
    win.showLevelScreen?.(true);
    close();
  }, [mode, close]);

  if (mode === 'wild') {
    const isSessionEnd = wildSession && wildSession.round >= 10;
    return (
      <div className="win-actions">
        <button className="resume-btn wild-continue-btn" onClick={handleWildContinue}>
          {isSessionEnd
            ? t('nav.newSession')
            : wildSession
              ? t('nav.continueSession', { round: wildSession.round })
              : t('nav.continueWorld')}
        </button>
        <button className="back-btn" onClick={handleBack}>
          {t('nav.leaveWorld')}
        </button>
      </div>
    );
  }

  if (mode === 'practice') {
    return (
      <div className="win-actions">
        {showReplay && (
          <button className="back-btn btn-replay" onClick={handleReplay}>
            {t('win.viewReplay')}
          </button>
        )}
        <button className="resume-btn" onClick={handleNext}>
          {t('nav.nextLevel')}
        </button>
        <button className="back-btn" onClick={handleBack}>
          {t('nav.backToPractice')}
        </button>
      </div>
    );
  }

  return (
    <div className="win-actions">
      {showReplay && (
        <button className="back-btn btn-replay" onClick={handleReplay}>
          {t('win.viewReplay')}
        </button>
      )}
      <button className="resume-btn" onClick={handleNext}>
        {t('nav.nextLevel')}
      </button>
      <button className="back-btn" onClick={handleBack}>
        {t('nav.backToLevels')}
      </button>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────

function Leaderboard(): ReactElement | null {
  const { showLeaderboard, leaderboardHtml } = useWinStore();
  const safeLeaderboardHtml = useMemo(() => sanitizeHtml(leaderboardHtml || t('prelevel.loading')), [leaderboardHtml]);
  if (!showLeaderboard) return null;
  return (
    <div className="leaderboard-card">
      <div className="leaderboard-title">{t('prelevel.leaderboardTitle')}</div>
      {/* Safety: leaderboard HTML from Firebase — player aliases sanitized by normalizeAlias() which strips HTML */}
      <div
        className="leaderboard-list"
        id="win-leaderboard-list"
        dangerouslySetInnerHTML={{ __html: safeLeaderboardHtml }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function WinCelebration(): ReactElement {
  const {
    visible,
    mode,
    levelName,
    timeSeconds,
    firstKill,
    firstKillSub,
    leveledUp,
    mentorNote,
    practiceTechName,
    practiceCleared,
    practiceTotal,
  } = useWinStore();
  const close = useWinStore((s) => s.close);

  const handleGoToLibrary = useCallback(() => {
    close();
    const win = window as unknown as SudokuWindow;
    win.openLibraryOverlay?.();
  }, [close]);
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      if (navigator.vibrate) {
        if (mode === 'wild' && leveledUp) navigator.vibrate([25, 45, 25, 45, 25, 45, 25, 70, 50]);
        else if (mode === 'practice') navigator.vibrate([25, 45, 25]);
        else navigator.vibrate([25, 45, 25, 45, 25, 70, 50]);
      }
    }
    prevVisibleRef.current = visible;
  }, [visible, mode, leveledUp]);

  const confettiCount = mode === 'wild' && leveledUp ? 35 : 22;
  const displayName = levelName;

  const bg = 'radial-gradient(circle at top, rgba(9, 132, 227, 0.16), var(--bg-color) 60%)';

  return (
    <ZenOverlay visible={visible} onClose={close} id="win-celebration" noBackdropClose backdropTint={bg}>
      <ConfettiLayer count={confettiCount} />
      <ZenStagger>
        <h2>{headingText(mode)}</h2>
        <p id="win-level-name">{displayName}</p>
        <MetricDisplay />
        <p className="win-time">
          <ZenCountUp value={timeSeconds} />
        </p>
        {mode === 'practice' && practiceTechName && (
          <div>
            <div className="win-practice-sub">
              {t('win.practiceProgress', { tech: practiceTechName, cleared: practiceCleared, total: practiceTotal })}
            </div>
            <div className="win-practice-progress">
              <div
                className="win-practice-progress-fill"
                style={{ width: `${(practiceCleared / practiceTotal) * 100}%` }}
              />
            </div>
          </div>
        )}
        {mode === 'wild' && firstKill && (
          <div
            className="win-mentor-note"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.12)',
              marginTop: '8px',
              paddingTop: '16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                letterSpacing: '3px',
                color: 'rgba(255,255,255,0.45)',
                fontWeight: 400,
                marginBottom: '10px',
              }}
            >
              ⬡ {t('wild.firstDiscovery')}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--star-color)',
                  letterSpacing: '2px',
                }}
              >
                {firstKill}
              </span>
              {firstKillSub && (
                <span
                  style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: '1px',
                    fontWeight: 300,
                  }}
                >
                  {firstKillSub}
                </span>
              )}
            </div>
            <div className="win-mentor-note-title">{t('win.mentorNoteTitle')}</div>
            {mentorNote && <div className="win-mentor-note-text">{mentorNote}</div>}
            <button className="back-btn win-library-btn" onClick={handleGoToLibrary}>
              {t('wild.viewInBestiary')} →
            </button>
          </div>
        )}
        <Leaderboard />
        <ActionButtons />
      </ZenStagger>
    </ZenOverlay>
  );
}
