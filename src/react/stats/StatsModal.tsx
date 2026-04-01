import { useEffect, useState, type ReactElement } from 'react';
import { useStatsStore } from './statsStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { t } from '../../i18n/t';
import { TITLE_DEFS, getTitleName, getEquippedTitle, setEquippedTitle } from '../../features/titles';

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
        <div className="stats-section-title">{t('stats.sectionGameData')}</div>
        <div className="stats-grid" id="stats-overview">
          <StatCard value={stats.totalCleared} sub={String(stats.totalLevels)} label={t('stats.cleared', { pct: completionPct })} />
          <StatCard value={stats.threeStarCount} label={t('stats.threeStar')} />
          <StatCard value={stats.totalCleared > 0 ? fmtSec(stats.avgTime) : '--'} label={t('stats.avgTime')} />
          <StatCard value={stats.fastestTime > 0 ? fmtSec(stats.fastestTime) : '--'} label={fastLabel ? t('stats.fastestLevel', { name: fastLabel }) : t('stats.fastestTime')} />
          <StatCard value={stats.totalStars} sub={String(stats.maxStars)} label={t('stats.totalStars')} />
          <StatCard value={fmtSec(stats.totalTime)} label={t('stats.totalTime')} />
          {stats.practiceCleared > 0 && (
            <div className="stat-item" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--cell-border)', paddingTop: 8, marginTop: 4 }}>
              <div className="stat-value">
                {stats.practiceCleared}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>/{stats.practiceTotalLevels}</span>
              </div>
              <div className="stat-label">
                {t('stats.practiceProgress', { pct: Math.round((stats.practiceCleared / stats.practiceTotalLevels) * 100), techs: stats.practiceFullTechs })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">{t('stats.sectionTierProgress')}</div>
        <div id="stats-tier-progress">
          {stats.tierStats.map((tier) => {
            const pct = tier.total > 0 ? Math.round((tier.cleared / tier.total) * 100) : 0;
            return (
              <div className="tier-progress" key={tier.name}>
                <span className="tier-name">{tier.name}</span>
                <div className="tier-bar"><div className="tier-bar-fill" style={{ width: `${pct}%` }} /></div>
                <span className="tier-count">{tier.cleared}/{tier.total}</span>
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
  const [equippedTitle, setEquippedState] = useState(() => getEquippedTitle());

  const handleEquip = (titleId: string) => {
    setEquippedTitle(titleId);
    setEquippedState(titleId);
  };

  return (
    <div className="stats-section">
      <div className="stats-section-title">{t('titles.sectionTitle')}</div>
      <div style={{ marginBottom: 10 }}>
        <button
          className={`title-equip-btn ${equippedTitle === 'none' ? 'equipped' : ''}`}
          onClick={() => handleEquip('none')}
        >
          {equippedTitle === 'none' ? t('titles.equippedMark') : t('titles.noTitle')}
        </button>
      </div>
      <div className="stats-section-title">{t('stats.sectionAchievements')}</div>
      <div className="achievement-counter">
        {t('stats.achievementsUnlocked', { unlocked: unlockedCount, total: achievements.length })}
      </div>
      <div className="achievement-grid">
        {achievements.map((a) => {
          const u = records[a.id];
          const titleDef = TITLE_DEFS.find(td => td.achievementId === a.id);
          const isEquipped = titleDef ? equippedTitle === titleDef.id : false;
          return (
            <div key={a.id} className={`achievement-card ${u ? 'unlocked' : 'locked'}`}>
              <div className="achievement-icon">{a.icon}</div>
              <div className="achievement-name">{a.name}</div>
              <div className="achievement-desc">{a.desc}</div>
              {u && <div className="achievement-date">{u.date}</div>}
              {u && titleDef && (
                <button
                  className={`title-equip-btn ${isEquipped ? 'equipped' : ''}`}
                  onClick={() => handleEquip(titleDef.id)}
                >
                  {isEquipped ? t('titles.equippedMark') : `${t('titles.equipButton')}\u300C${getTitleName(titleDef.id)}\u300D`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────

export function StatsModal(): ReactElement {
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

  return (
    <ZenOverlay visible={visible && !!stats} onClose={close} id="stats-modal">
      <div className="stats-panel">
        <ZenStagger>
          <h2>{t('stats.title')}</h2>
          <div className="stats-tabs">
            <button className={`stats-tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>{t('stats.tabOverview')}</button>
            <button className={`stats-tab-btn${tab === 'achievement' ? ' active' : ''}`} onClick={() => setTab('achievement')}>{t('stats.tabAchievements')}</button>
          </div>
          {tab === 'overview' && stats && <OverviewTab stats={stats} />}
          {tab === 'achievement' && <AchievementTab achievements={achievements} records={achievementRecords} />}
          <button className="resume-btn" onClick={close}>{t('nav.close')}</button>
        </ZenStagger>
      </div>
    </ZenOverlay>
  );
}
