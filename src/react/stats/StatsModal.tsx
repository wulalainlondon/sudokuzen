import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useStatsStore } from './statsStore';

// Import data functions from legacy stats module
// These are pure computation — no DOM side effects
type StatsData = {
  totalCleared: number;
  totalLevels: number;
  threeStarCount: number;
  totalStars: number;
  maxStars: number;
  totalTime: number;
  avgTime: number;
  fastestTime: number;
  fastestLevel: { displayName: string } | null;
  speedrunCleared: number;
  tierStats: { name: string; total: number; cleared: number }[];
  practiceCleared: number;
  practiceTotalLevels: number;
  practiceTechsStarted: number;
  practiceFullTechs: number;
};

type AchievementDef = { id: string; name: string; desc: string; icon: string };
type AchievementRecord = Record<string, { date: string }>;

function fmtSec(sec: number): string {
  if (sec <= 0) return '--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ value, sub, label }: { value: string | number; sub?: string; label: string }): ReactElement {
  return (
    <div className="stat-item">
      <div className="stat-value">
        {value}
        {sub && <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>/{sub}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: StatsData }): ReactElement {
  const completionPct = stats.totalLevels > 0 ? Math.round((stats.totalCleared / stats.totalLevels) * 100) : 0;
  const fastLabel = stats.fastestLevel ? stats.fastestLevel.displayName : '';

  return (
    <div>
      <div className="stats-section">
        <div className="stats-section-title">遊戲數據</div>
        <div className="stats-grid" id="stats-overview">
          <StatCard value={stats.totalCleared} sub={String(stats.totalLevels)} label={`通關數 (${completionPct}%)`} />
          <StatCard value={stats.threeStarCount} label="三星通關" />
          <StatCard value={stats.totalCleared > 0 ? fmtSec(stats.avgTime) : '--'} label="平均用時" />
          <StatCard value={stats.fastestTime > 0 ? fmtSec(stats.fastestTime) : '--'} label={fastLabel ? `最速 ${fastLabel}` : '最速通關'} />
          <StatCard value={stats.totalStars} sub={String(stats.maxStars)} label="總星數" />
          <StatCard value={fmtSec(stats.totalTime)} label="最佳用時總計" />
          {stats.practiceCleared > 0 && (
            <div className="stat-item" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--cell-border)', paddingTop: 8, marginTop: 4 }}>
              <div className="stat-value">
                {stats.practiceCleared}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>/{stats.practiceTotalLevels}</span>
              </div>
              <div className="stat-label">
                修行通關 ({Math.round((stats.practiceCleared / stats.practiceTotalLevels) * 100)}%) · {stats.practiceFullTechs}/41 技巧全通
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">各難度進度</div>
        <div id="stats-tier-progress">
          {stats.tierStats.map((t) => {
            const pct = t.total > 0 ? Math.round((t.cleared / t.total) * 100) : 0;
            return (
              <div className="tier-progress" key={t.name}>
                <span className="tier-name">{t.name}</span>
                <div className="tier-bar"><div className="tier-bar-fill" style={{ width: `${pct}%` }} /></div>
                <span className="tier-count">{t.cleared}/{t.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Achievement Tab ───────────────────────────────────────────────────

function AchievementTab({ achievements, records }: { achievements: AchievementDef[]; records: AchievementRecord }): ReactElement {
  const unlockedCount = achievements.filter((a) => records[a.id]).length;

  return (
    <div className="stats-section">
      <div className="stats-section-title">成就徽章</div>
      <div className="achievement-counter">
        已解鎖 <span>{unlockedCount}</span> / {achievements.length}
      </div>
      <div className="achievement-grid">
        {achievements.map((a) => {
          const u = records[a.id];
          return (
            <div key={a.id} className={`achievement-card ${u ? 'unlocked' : 'locked'}`}>
              <div className="achievement-icon">{a.icon}</div>
              <div className="achievement-name">{a.name}</div>
              <div className="achievement-desc">{a.desc}</div>
              {u && <div className="achievement-date">{u.date}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────

export function StatsModal(): ReactElement | null {
  const { visible, tab } = useStatsStore();
  const close = useStatsStore((s) => s.close);
  const setTab = useStatsStore((s) => s.setTab);

  const [stats, setStats] = useState<StatsData | null>(null);
  const [achievements, setAchievements] = useState<AchievementDef[]>([]);
  const [achievementRecords, setAchievementRecords] = useState<AchievementRecord>({});

  // Load data when modal opens
  useEffect(() => {
    if (!visible) return;
    import('../../features/stats').then((m) => {
      const s = m.computeStats();
      setStats(s);
      setAchievements(m.ACHIEVEMENTS);
      setAchievementRecords(m.loadAchievements());
      m.checkAllAchievements();
    });
  }, [visible]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  }, [close]);

  if (!visible || !stats) return null;

  return (
    <div id="stats-modal" style={{ display: 'flex' }} onClick={handleBackdrop}>
      <div className="stats-panel">
        <h2>個人統計</h2>
        <div className="stats-tabs">
          <button className={`stats-tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>總覽</button>
          <button className={`stats-tab-btn${tab === 'achievement' ? ' active' : ''}`} onClick={() => setTab('achievement')}>成就</button>
        </div>
        {tab === 'overview' && <OverviewTab stats={stats} />}
        {tab === 'achievement' && <AchievementTab achievements={achievements} records={achievementRecords} />}
        <button className="resume-btn" onClick={close}>關閉</button>
      </div>
    </div>
  );
}
