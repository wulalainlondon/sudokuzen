// WinCelebration — React component with Zen Motion System.
// Renders differently for normal / practice / wild modes.

import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useWinStore, type WinMode } from './winStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { ZenStarReveal } from '../motion/ZenStarReveal';
import { ZenCountUp } from '../motion/ZenCountUp';

// ── Helpers ────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#0984E3', '#74B9FF', '#A29BFE', '#DFE6E9', '#B2BEC3'];

function headingText(mode: WinMode): string {
  if (mode === 'wild') return '狩獵成功';
  if (mode === 'practice') return '修行完成';
  return 'PERFECT FLOW';
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
  const { mode, stars, isSpeedrun, submissions, expGained, leveledUp, newLevel, beatMentor, wildSession } = useWinStore();

  if (mode === 'wild') {
    if (wildSession && wildSession.round >= 10) {
      const streakMult = wildSession.wins >= 10 ? 1.5 : wildSession.wins >= 8 ? 1.3 : wildSession.wins >= 5 ? 1.1 : 1.0;
      return (
        <div className="win-stars">
          修行輪完成！<br />
          {wildSession.wins}/10 勝 · +{wildSession.totalExp} EXP
          {streakMult > 1 && <><br />連勝加成 ×{streakMult}</>}
        </div>
      );
    }
    const mentorBonus = beatMentor ? ' ⚡ 超越弈塵！' : '';
    return (
      <div className="win-stars">
        {leveledUp ? `+${expGained} EXP${mentorBonus} — Lv.${newLevel}!` : `+${expGained} EXP${mentorBonus}`}
      </div>
    );
  }

  if (isSpeedrun) {
    return <div className="win-stars">⚡ 總提交: {submissions}次</div>;
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
    (window as any).openReplayModal?.();
  }, []);

  const handleNext = useCallback(() => {
    if (mode === 'practice') {
      import('../../features/practice/practiceLobby').then((m) => m.startNextPracticeLevel());
    } else {
      import('../../features/levels').then((m) => m.advanceToNextLevel());
    }
    close();
  }, [mode, close]);

  const handleWildContinue = useCallback(() => {
    (window as any).continueWild?.();
    close();
  }, [close]);

  const handleBack = useCallback(() => {
    if (mode === 'wild') {
      (window as any).exitWild?.();
    }
    (window as any).showLevelScreen?.(true);
    close();
  }, [mode, close]);

  if (mode === 'wild') {
    const isSessionEnd = wildSession && wildSession.round >= 10;
    return (
      <div className="win-actions">
        <button className="resume-btn wild-continue-btn" onClick={handleWildContinue}>
          {isSessionEnd ? '新的修行輪' : wildSession ? `繼續修行 (${wildSession.round}/10)` : '繼續世界'}
        </button>
        <button className="back-btn" onClick={handleBack}>離開世界</button>
      </div>
    );
  }

  if (mode === 'practice') {
    return (
      <div className="win-actions">
        {showReplay && <button className="back-btn btn-replay" onClick={handleReplay}>查看回放</button>}
        <button className="resume-btn" onClick={handleNext}>下一關</button>
        <button className="back-btn" onClick={handleBack}>返回修行</button>
      </div>
    );
  }

  return (
    <div className="win-actions">
      {showReplay && <button className="back-btn btn-replay" onClick={handleReplay}>查看回放</button>}
      <button className="resume-btn" onClick={handleNext}>下一關</button>
      <button className="back-btn" onClick={handleBack}>返回選關</button>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────

function Leaderboard(): ReactElement | null {
  const { showLeaderboard, leaderboardHtml } = useWinStore();
  if (!showLeaderboard) return null;
  return (
    <div className="leaderboard-card">
      <div className="leaderboard-title">首通榜 TOP 3</div>
      <div className="leaderboard-list" id="win-leaderboard-list"
        dangerouslySetInnerHTML={{ __html: leaderboardHtml || '載入中...' }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function WinCelebration(): ReactElement {
  const { visible, mode, levelName, timeSeconds, firstKill, firstKillSub, leveledUp, mentorNote } = useWinStore();
  const close = useWinStore((s) => s.close);
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
  const displayName = mode === 'wild' && firstKill
    ? `「${firstKill} · ${firstKillSub}」首次討伐！`
    : levelName;

  const bg = 'radial-gradient(circle at top, rgba(9, 132, 227, 0.16), var(--bg-color) 60%)';

  return (
    <ZenOverlay visible={visible} onClose={close} id="win-celebration" noBackdropClose backdropTint={bg}>
      <ConfettiLayer count={confettiCount} />
      <ZenStagger>
        <h2>{headingText(mode)}</h2>
        <p id="win-level-name">{displayName}</p>
        <MetricDisplay />
        <p className="win-time"><ZenCountUp value={timeSeconds} /></p>
        {mode === 'wild' && firstKill && mentorNote && (
          <div className="win-mentor-note">
            <div className="win-mentor-note-title">── 弈塵《殘篇》──</div>
            <div className="win-mentor-note-text">{mentorNote}</div>
          </div>
        )}
        <Leaderboard />
        <ActionButtons />
      </ZenStagger>
    </ZenOverlay>
  );
}
