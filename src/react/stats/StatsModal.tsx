import { useEffect, useState, type ReactElement } from 'react';
import { useStatsStore } from './statsStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { ZenStagger } from '../motion/ZenStagger';
import { t } from '../../i18n/t';
import { SK, readJson } from '../../storage/keys';
import { TITLE_DEFS, getTitleName, getEquippedTitle, setEquippedTitle } from '../../features/titles';
import teachData from '../../../teach-data.json';
import type { TeachLaunchSource, TeachOpenOptions } from '../../entities/teach';

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
type LearningModuleSummary = {
  id: string;
  name: string;
  technique: string;
  read: boolean;
  practiced: boolean;
  totalModules?: number;
  readModules?: number;
  practicedModules?: number;
  masteryPct?: number;
};
type LearningTechniqueSummary = {
  id: string;
  name: string;
  technique: string;
  totalModules: number;
  readModules: number;
  practicedModules: number;
  masteryPct: number;
};
type LearningRiskAlert = {
  id: string;
  title: string;
  detail: string;
  action: string;
  severity: 'low' | 'medium' | 'high';
};
type LearningStats = {
  teachReadCount: number;
  teachTotal: number;
  practiceDoneCount: number;
  practiceTotal: number;
  masteredTechniqueCount: number;
  totalTechniqueCount: number;
  masteryPct: number;
  nextTeachModules: LearningModuleSummary[];
  nextPracticeModules: LearningModuleSummary[];
  topTechniques?: LearningTechniqueSummary[];
  riskAlerts?: LearningRiskAlert[];
  learningLoop?: {
    recommendationClicks: number;
    replayLaunchCompletions: number;
    nextDayReturns: number;
    replayCompletionRatePct: number;
    nextDayReturnRatePct?: number;
    lastRecommendationDate?: string | null;
    lastRecommendationModuleId?: string | null;
    topConvertingModules?: Array<{
      moduleId: string;
      name: string;
      technique: string;
      clicks: number;
      completions: number;
      completionRatePct: number;
    }>;
  };
};
type LearningViewModel = Omit<LearningStats, 'topTechniques' | 'riskAlerts'> & {
  topTechniques: LearningTechniqueSummary[];
  riskAlerts: LearningRiskAlert[];
};

const TEACH_DATA = teachData as Record<string, { name?: string; technique?: string }>;

function fmtSec(sec: number): string {
  if (sec <= 0) return '--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getLearningLabel(key: string, fallback: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

async function openTeachModuleFromStats(moduleId: string): Promise<boolean> {
  const target = moduleId.trim();
  if (!target) return false;
  const source: TeachLaunchSource = 'stats';
  const options: TeachOpenOptions = { preferredStep: 'firstInteractive' };

  type TeachBridge = {
    openTeach?: (stars: string | number, source?: TeachLaunchSource, options?: TeachOpenOptions) => Promise<boolean>;
  };
  type TeachWindow = Window & {
    __reactTeachBridge?: TeachBridge;
    showTeachModal?: (stars: string | number, source?: TeachLaunchSource) => void;
  };

  const w = window as TeachWindow;

  try {
    const handled = await w.__reactTeachBridge?.openTeach?.(target, source, options);
    if (handled) return true;
  } catch {
    // Fallback below.
  }

  try {
    w.showTeachModal?.(target, source);
    return true;
  } catch {
    return false;
  }
}

function buildLearningStats(): LearningStats {
  const teachRead = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  const practiceDone = readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {});
  const moduleEntries = Object.entries(TEACH_DATA)
    .map(([id, mod]) => ({
      id,
      name: mod.name || `Module ${id}`,
      technique: mod.technique || '',
      read: !!teachRead[id],
      practiced: !!practiceDone[id],
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));

  const totalTechniqueCount = new Set(moduleEntries.map((m) => m.technique).filter(Boolean)).size;
  const masteredTechniques = new Set(
    moduleEntries
      .filter((m) => m.practiced)
      .map((m) => m.technique)
      .filter(Boolean),
  );
  const teachReadCount = moduleEntries.filter((m) => m.read).length;
  const practiceDoneCount = moduleEntries.filter((m) => m.practiced).length;
  const unread = moduleEntries.filter((m) => !m.read);
  const unpracticed = moduleEntries.filter((m) => m.read && !m.practiced);
  const techniqueMap = new Map<
    string,
    {
      id: string;
      name: string;
      technique: string;
      totalModules: number;
      readModules: number;
      practicedModules: number;
    }
  >();

  for (const mod of moduleEntries) {
    const techniqueKey = mod.technique || `module-${mod.id}`;
    const current = techniqueMap.get(techniqueKey) || {
      id: techniqueKey,
      name: mod.technique || mod.name || `Module ${mod.id}`,
      technique: mod.technique || '',
      totalModules: 0,
      readModules: 0,
      practicedModules: 0,
    };
    current.totalModules += 1;
    if (mod.read) current.readModules += 1;
    if (mod.practiced) current.practicedModules += 1;
    if (!current.name || current.name === `Module ${mod.id}`) {
      current.name = mod.name || current.name;
    }
    techniqueMap.set(techniqueKey, current);
  }

  const techniqueProgress = [...techniqueMap.values()]
    .map((entry) => ({
      ...entry,
      masteryPct: entry.totalModules > 0 ? Math.round((entry.practicedModules / entry.totalModules) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.masteryPct !== a.masteryPct) return b.masteryPct - a.masteryPct;
      if (b.practicedModules !== a.practicedModules) return b.practicedModules - a.practicedModules;
      if (b.readModules !== a.readModules) return b.readModules - a.readModules;
      return a.name.localeCompare(b.name);
    });

  const topTechniques = techniqueProgress.slice(0, 6);
  const riskAlerts: LearningRiskAlert[] = [];
  if (unread.length > 0) {
    riskAlerts.push({
      id: 'teach-backlog',
      title: 'Teach backlog',
      detail: `${unread.length} unread module${unread.length === 1 ? '' : 's'} remain`,
      action: 'Read the next module',
      severity: unread.length >= 8 ? 'high' : 'medium',
    });
  }
  if (unpracticed.length > 0) {
    riskAlerts.push({
      id: 'practice-backlog',
      title: 'Practice backlog',
      detail: `${unpracticed.length} read module${unpracticed.length === 1 ? '' : 's'} still need practice`,
      action: 'Clear a practice module',
      severity: unpracticed.length >= 6 ? 'high' : 'medium',
    });
  }
  const stalledTechniques = techniqueProgress.filter((t) => t.readModules > 0 && t.practicedModules === 0).slice(0, 3);
  if (stalledTechniques.length > 0) {
    riskAlerts.push({
      id: 'stalled-techniques',
      title: 'Stalled techniques',
      detail: stalledTechniques.map((t) => t.name).join(', '),
      action: 'Practice these techniques next',
      severity: stalledTechniques.length >= 3 ? 'high' : 'medium',
    });
  }

  return {
    teachReadCount,
    teachTotal: moduleEntries.length,
    practiceDoneCount,
    practiceTotal: moduleEntries.length,
    masteredTechniqueCount: masteredTechniques.size,
    totalTechniqueCount,
    masteryPct:
      moduleEntries.length > 0
        ? Math.round(((teachReadCount / moduleEntries.length + practiceDoneCount / moduleEntries.length) / 2) * 100)
        : 0,
    nextTeachModules: unread.slice(0, 4),
    nextPracticeModules: unpracticed.slice(0, 4),
    topTechniques,
    riskAlerts,
  };
}

function normalizeTechniqueSummary(raw: unknown, fallbackIndex: number): LearningTechniqueSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const technique =
    typeof obj.technique === 'string' && obj.technique.trim()
      ? obj.technique.trim()
      : typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : `tech-${fallbackIndex}`;
  const name =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim()
        : technique;
  const readModules = Number(obj.readModules ?? obj.read ?? 0);
  const practicedModules = Number(obj.practicedModules ?? obj.practiced ?? 0);
  const totalModules = Number(obj.totalModules ?? obj.total ?? 0);
  const pctRaw = Number(obj.masteryPct ?? obj.pct ?? 0);
  const masteryPct =
    Number.isFinite(pctRaw) && pctRaw >= 0
      ? Math.min(100, Math.max(0, Math.round(pctRaw)))
      : totalModules > 0
        ? Math.round((Math.max(0, practicedModules) / totalModules) * 100)
        : 0;

  return {
    id: technique,
    name,
    technique,
    totalModules: Number.isFinite(totalModules) && totalModules > 0 ? Math.floor(totalModules) : 0,
    readModules: Number.isFinite(readModules) && readModules > 0 ? Math.floor(readModules) : 0,
    practicedModules: Number.isFinite(practicedModules) && practicedModules > 0 ? Math.floor(practicedModules) : 0,
    masteryPct,
  };
}

function normalizeRiskAlert(raw: unknown, fallbackIndex: number): LearningRiskAlert | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim()
        : `Risk ${fallbackIndex + 1}`;
  const detail =
    typeof obj.detail === 'string' && obj.detail.trim()
      ? obj.detail.trim()
      : typeof obj.reason === 'string' && obj.reason.trim()
        ? obj.reason.trim()
        : '';
  const action = typeof obj.action === 'string' && obj.action.trim() ? obj.action.trim() : detail || 'Take action next';
  const severity =
    obj.severity === 'high' || obj.severity === 'medium' || obj.severity === 'low'
      ? obj.severity
      : Number(obj.pct ?? 0) < 35
        ? 'high'
        : 'medium';

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `risk-${fallbackIndex}`,
    title,
    detail: detail || title,
    action,
    severity,
  };
}

function normalizeLearningStats(raw?: Partial<LearningViewModel> | null): LearningViewModel {
  const fallback = buildLearningStats() as LearningViewModel;
  if (!raw) return fallback;
  const topTechniques =
    Array.isArray(raw.topTechniques) && raw.topTechniques.length > 0
      ? raw.topTechniques
          .map((item, index) => normalizeTechniqueSummary(item, index))
          .filter((item): item is LearningTechniqueSummary => !!item)
      : fallback.topTechniques;
  const riskAlerts =
    Array.isArray(raw.riskAlerts) && raw.riskAlerts.length > 0
      ? raw.riskAlerts
          .map((item, index) => normalizeRiskAlert(item, index))
          .filter((item): item is LearningRiskAlert => !!item)
      : fallback.riskAlerts;
  return {
    ...fallback,
    ...raw,
    topTechniques,
    riskAlerts,
  };
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
          <StatCard
            value={stats.totalCleared}
            sub={String(stats.totalLevels)}
            label={t('stats.cleared', { pct: completionPct })}
          />
          <StatCard value={stats.threeStarCount} label={t('stats.threeStar')} />
          <StatCard value={stats.totalCleared > 0 ? fmtSec(stats.avgTime) : '--'} label={t('stats.avgTime')} />
          <StatCard
            value={stats.fastestTime > 0 ? fmtSec(stats.fastestTime) : '--'}
            label={fastLabel ? t('stats.fastestLevel', { name: fastLabel }) : t('stats.fastestTime')}
          />
          <StatCard value={stats.totalStars} sub={String(stats.maxStars)} label={t('stats.totalStars')} />
          <StatCard value={fmtSec(stats.totalTime)} label={t('stats.totalTime')} />
          {stats.practiceCleared > 0 && (
            <div
              className="stat-item"
              style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--cell-border)', paddingTop: 8, marginTop: 4 }}
            >
              <div className="stat-value">
                {stats.practiceCleared}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>/{stats.practiceTotalLevels}</span>
              </div>
              <div className="stat-label">
                {t('stats.practiceProgress', {
                  pct: Math.round((stats.practiceCleared / stats.practiceTotalLevels) * 100),
                  techs: stats.practiceFullTechs,
                })}
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
                <div className="tier-bar">
                  <div className="tier-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="tier-count">
                  {tier.cleared}/{tier.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Achievement Tab ───────────────────────────────────────────────────

function AchievementTab({
  achievements,
  records,
}: {
  achievements: AchievementDef[];
  records: AchievementRecord;
}): ReactElement {
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
          const titleDef = TITLE_DEFS.find((td) => td.achievementId === a.id);
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
                  {isEquipped
                    ? t('titles.equippedMark')
                    : `${t('titles.equipButton')}\u300C${getTitleName(titleDef.id)}\u300D`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LearningTab({
  learning,
  onOpenModule,
}: {
  learning: LearningViewModel;
  onOpenModule: (moduleId: string) => void;
}): ReactElement {
  const noTeachLeft = learning.teachReadCount >= learning.teachTotal && learning.teachTotal > 0;
  const noPracticeLeft = learning.practiceDoneCount >= learning.practiceTotal && learning.practiceTotal > 0;
  const topTechniques = Array.isArray(learning.topTechniques) ? learning.topTechniques : [];
  const riskAlerts = Array.isArray(learning.riskAlerts) ? learning.riskAlerts : [];
  const loop = learning.learningLoop ?? {
    recommendationClicks: 0,
    replayLaunchCompletions: 0,
    nextDayReturns: 0,
    replayCompletionRatePct: 0,
    nextDayReturnRatePct: 0,
    topConvertingModules: [],
  };
  const topConvertingModules = Array.isArray(loop.topConvertingModules) ? loop.topConvertingModules : [];

  return (
    <div>
      <div className="stats-section">
        <div className="stats-section-title">{getLearningLabel('stats.sectionLearning', 'Learning')}</div>
        <div className="stats-grid learning-grid">
          <StatCard
            value={learning.teachReadCount}
            sub={String(learning.teachTotal)}
            label={getLearningLabel('stats.learningTeachRead', 'Teach Read')}
          />
          <StatCard
            value={learning.practiceDoneCount}
            sub={String(learning.practiceTotal)}
            label={getLearningLabel('stats.learningPracticeDone', 'Practice Done')}
          />
          <StatCard
            value={learning.masteredTechniqueCount}
            sub={String(learning.totalTechniqueCount)}
            label={getLearningLabel('stats.learningTechniques', 'Techniques')}
          />
          <StatCard value={learning.masteryPct} label={getLearningLabel('stats.learningMastery', 'Mastery')} />
        </div>
      </div>

      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">{getLearningLabel('stats.learningLoopTitle', 'Learning Loop')}</div>
        <div className="stats-grid learning-grid">
          <StatCard
            value={loop.recommendationClicks}
            label={getLearningLabel('stats.learningLoopClicks', 'Recommendation clicks')}
          />
          <StatCard
            value={loop.replayLaunchCompletions}
            label={getLearningLabel('stats.learningLoopCompletions', 'Replay-to-teach completions')}
          />
          <StatCard
            value={loop.nextDayReturns}
            label={getLearningLabel('stats.learningLoopNextDay', 'Next-day returns')}
          />
          <StatCard
            value={`${Math.max(0, Math.min(100, loop.nextDayReturnRatePct || 0))}%`}
            label={getLearningLabel('stats.learningLoopNextDayRate', 'Next-day return rate')}
          />
          <StatCard
            value={`${Math.max(0, Math.min(100, loop.replayCompletionRatePct))}%`}
            label={getLearningLabel('stats.learningLoopRate', 'Completion rate')}
          />
        </div>
      </div>

      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">
          {getLearningLabel('stats.learningLoopTopModules', 'Top converting modules')}
        </div>
        <div className="learning-ranking">
          {topConvertingModules.length > 0 ? (
            topConvertingModules.map((item, index) => (
              <div className="learning-ranking-item" key={`funnel-${item.moduleId}`}>
                <div className="learning-ranking-head">
                  <div className="learning-ranking-rank">#{index + 1}</div>
                  <div className="learning-ranking-body">
                    <div className="learning-item-title">
                      <span>{item.name}</span>
                      <span className="learning-item-tag">{Math.max(0, Math.min(100, item.completionRatePct))}%</span>
                    </div>
                    <div className="learning-item-sub">
                      {item.technique || getLearningLabel('stats.learningUnknownTech', 'Technique unknown')}
                    </div>
                  </div>
                </div>
                <div className="learning-ranking-meta">
                  {item.clicks} {getLearningLabel('stats.learningLoopClicks', 'Recommendation clicks')} ·{' '}
                  {item.completions} {getLearningLabel('stats.learningLoopCompletions', 'Replay-to-teach completions')}
                </div>
                <button
                  className="learning-open-module-btn rz-focus-ring"
                  onClick={() => onOpenModule(item.moduleId)}
                  type="button"
                >
                  {getLearningLabel('stats.learningLoopOpenModule', 'Open module')}
                </button>
              </div>
            ))
          ) : (
            <div className="learning-item learning-item-empty">
              {getLearningLabel('stats.learningLoopTopModulesEmpty', 'No conversion data yet')}
            </div>
          )}
        </div>
      </div>

      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">
          {getLearningLabel('stats.learningTopTechniques', 'Top Mastered Techniques')}
        </div>
        <div className="learning-ranking">
          {topTechniques.length > 0 ? (
            topTechniques.map((tech, index) => {
              const pct = Math.max(0, Math.min(100, tech.masteryPct));
              return (
                <div className="learning-ranking-item" key={tech.id}>
                  <div className="learning-ranking-head">
                    <div className="learning-ranking-rank">#{index + 1}</div>
                    <div className="learning-ranking-body">
                      <div className="learning-item-title">
                        <span>{tech.name}</span>
                        <span className="learning-item-tag">{pct}%</span>
                      </div>
                      <div className="learning-item-sub">
                        {tech.technique || getLearningLabel('stats.learningUnknownTech', 'Technique unknown')}
                      </div>
                    </div>
                  </div>
                  <div className="learning-ranking-bar" aria-hidden="true">
                    <div className="learning-ranking-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="learning-ranking-meta">
                    {tech.practicedModules}/{tech.totalModules} practice · {tech.readModules}/{tech.totalModules} read
                  </div>
                </div>
              );
            })
          ) : (
            <div className="learning-item learning-item-empty">
              {getLearningLabel('stats.learningNoRanking', 'No ranking data yet')}
            </div>
          )}
        </div>
      </div>

      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">{getLearningLabel('stats.learningRiskAlerts', 'Risk Alerts')}</div>
        <div className="learning-risk-list">
          {riskAlerts.length > 0 ? (
            riskAlerts.map((alert) => (
              <div className={`learning-risk-item severity-${alert.severity}`} key={alert.id}>
                <div className="learning-risk-title">
                  <span>{alert.title}</span>
                  <span className="learning-item-tag">{alert.severity}</span>
                </div>
                <div className="learning-risk-detail">{alert.detail}</div>
                <div className="learning-risk-action">{alert.action}</div>
              </div>
            ))
          ) : (
            <div className="learning-item learning-item-empty">
              {getLearningLabel('stats.learningNoRisk', 'No risks detected')}
            </div>
          )}
        </div>
      </div>

      <div className="stats-section" style={{ marginTop: 14 }}>
        <div className="stats-section-title">{getLearningLabel('stats.learningNext', 'Next Actions')}</div>
        <div className="learning-list">
          {learning.nextTeachModules.length > 0 ? (
            <>
              <div className="learning-item learning-item-empty">
                {getLearningLabel('stats.learningUnread', 'Unread modules')}
              </div>
              {learning.nextTeachModules.map((module) => (
                <div className="learning-item" key={`teach-${module.id}`}>
                  <div className="learning-item-title">
                    {module.name}
                    <span className="learning-item-tag">{getLearningLabel('stats.learningToRead', 'Read')}</span>
                  </div>
                  <div className="learning-item-sub">
                    {module.technique || getLearningLabel('stats.learningUnknownTech', 'Technique unknown')}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="learning-item learning-item-empty">
              {getLearningLabel('stats.learningTeachComplete', 'Teach track complete')}
            </div>
          )}

          {learning.nextPracticeModules.length > 0 ? (
            <>
              <div className="learning-item learning-item-empty" style={{ marginTop: 4 }}>
                {getLearningLabel('stats.learningPracticeBacklog', 'Practice backlog')}
              </div>
              {learning.nextPracticeModules.map((module) => (
                <div className="learning-item" key={`practice-${module.id}`}>
                  <div className="learning-item-title">
                    {module.name}
                    <span className="learning-item-tag">
                      {getLearningLabel('stats.learningToPractice', 'Practice')}
                    </span>
                  </div>
                  <div className="learning-item-sub">
                    {module.technique || getLearningLabel('stats.learningUnknownTech', 'Technique unknown')}
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {noTeachLeft && noPracticeLeft && (
            <div className="learning-item learning-item-empty">
              {getLearningLabel('stats.learningComplete', 'All learning modules complete')}
            </div>
          )}
        </div>
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
  const [learning, setLearning] = useState<LearningViewModel | null>(null);
  const [achievements, setAchievements] = useState<AchievementDef[]>([]);
  const [achievementRecords, setAchievementRecords] = useState<AchievementRecord>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenModule = (moduleId: string) => {
    void (async () => {
      const ok = await openTeachModuleFromStats(moduleId);
      if (ok) {
        close();
        return;
      }
      import('../../ui/feedback')
        .then((m) =>
          m.showFeedback(getLearningLabel('stats.learningLoopOpenModuleFailed', 'Unable to open module'), 'error'),
        )
        .catch(() => {});
    })();
  };

  // Load data when modal opens — deferred with setTimeout(0) so browser paints
  // the loading spinner before the synchronous computation blocks the main thread
  useEffect(() => {
    if (!visible) {
      setStats(null);
      setLearning(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    const timerId = setTimeout(() => {
      void import('../../features/stats')
        .then((m) => {
          if (cancelled) return;
          const statsModule = m as typeof import('../../features/stats') & {
            computeLearningStats?: () => unknown;
          };
          setStats(m.computeStats());
          setLearning(
            normalizeLearningStats(
              statsModule.computeLearningStats
                ? (statsModule.computeLearningStats() as unknown as Partial<LearningViewModel>)
                : null,
            ),
          );
          setAchievements(m.ACHIEVEMENTS);
          setAchievementRecords(m.loadAchievements());
          setIsLoading(false);
          m.checkAllAchievements();
        })
        .catch(() => {
          if (!cancelled) {
            setLearning(normalizeLearningStats(null));
            setIsLoading(false);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || tab !== 'learning') return;
    let cancelled = false;
    const timerId = setTimeout(() => {
      void import('../../features/stats')
        .then((m) => {
          if (cancelled) return;
          if (typeof m.recordLearningTabVisit === 'function') m.recordLearningTabVisit();
          const statsModule = m as typeof import('../../features/stats') & {
            computeLearningStats?: () => unknown;
          };
          setLearning(
            normalizeLearningStats(
              statsModule.computeLearningStats
                ? (statsModule.computeLearningStats() as unknown as Partial<LearningViewModel>)
                : null,
            ),
          );
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [visible, tab]);

  return (
    <ZenOverlay visible={visible} onClose={close} id="stats-modal">
      <div className="stats-panel">
        {stats ? (
          <ZenStagger>
            <h2>{t('stats.title')}</h2>
            <div className="stats-tabs">
              <button
                className={`stats-tab-btn${tab === 'overview' ? ' active' : ''}`}
                onClick={() => setTab('overview')}
              >
                {t('stats.tabOverview')}
              </button>
              <button
                className={`stats-tab-btn${tab === 'learning' ? ' active' : ''}`}
                onClick={() => setTab('learning')}
              >
                {getLearningLabel('stats.tabLearning', 'Learning')}
              </button>
              <button
                className={`stats-tab-btn${tab === 'achievement' ? ' active' : ''}`}
                onClick={() => setTab('achievement')}
              >
                {t('stats.tabAchievements')}
              </button>
            </div>
            {tab === 'overview' && stats && <OverviewTab stats={stats} />}
            {tab === 'learning' && learning && <LearningTab learning={learning} onOpenModule={handleOpenModule} />}
            {tab === 'achievement' && <AchievementTab achievements={achievements} records={achievementRecords} />}
            <button className="resume-btn" onClick={close}>
              {t('nav.close')}
            </button>
          </ZenStagger>
        ) : (
          <div className="stats-loading">
            <div className="stats-loading-spinner" />
          </div>
        )}
      </div>
    </ZenOverlay>
  );
}
