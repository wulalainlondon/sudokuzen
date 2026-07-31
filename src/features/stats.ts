// Stats, achievements, and stats modal — extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getAllLevels, getTeachData } from '../data/dataRegistry';
import { toClassicLevelRecord } from '../shared/records/levelRecords';
import { mergeCloudAchievements, syncAchievementsToCloud } from '../firebase/client';
import { t } from '../i18n/t';

// ── Achievement definitions ───────────────────────────────────────────

// Each achievement teaches a behavior or marks a genuine milestone.
// No padding, no filler — every unlock should feel meaningful.

const ACHIEVEMENT_DEFS = [
  // ── Journey milestones (4) ──────────────────────────────────────
  { id: 'first_clear', icon: '🌱' },
  { id: 'clear_50', icon: '💪' },
  { id: 'clear_all', icon: '👑' },
  { id: 'tier_any', icon: '🪷' },

  // ── Precision (3) ──────────────────────────────────────────────
  { id: 'perfect_one', icon: '⭐' },
  { id: 'no_guess', icon: '🧠' },
  { id: 'streak_5_clean', icon: '🪨' },

  // ── Scoring (4) ────────────────────────────────────────────────
  { id: 'grade_a', icon: '🅰️' },
  { id: 'grade_s', icon: '🏅' },
  { id: 'grade_s_10', icon: '💎' },
  { id: 'streak_3_s', icon: '🔱' },

  // ── Technique mastery (6) ──────────────────────────────────────
  { id: 'tech_locked', icon: '🔒' },
  { id: 'tech_fish', icon: '🐟' },
  { id: 'tech_wing', icon: '🦋' },
  { id: 'tech_chain', icon: '🔗' },
  { id: 'tech_als', icon: '🧬' },
  { id: 'tech_variety', icon: '📚' },

  // ── Candidate elimination (3) ──────────────────────────────────
  { id: 'elim_100', icon: '✂️' },
  { id: 'elim_1000', icon: '🗡️' },
  { id: 'elim_5000', icon: '⚔️' },

  // ── Learning (6) ───────────────────────────────────────────────
  { id: 'teach_read_10', icon: '📖' },
  { id: 'teach_read_all', icon: '🏛️' },
  { id: 'practice_10', icon: '🎯' },
  { id: 'practice_master_1', icon: '🧿' },
  { id: 'practice_master_10', icon: '🔟' },
  { id: 'practice_master_all', icon: '🏆' },

  // ── Speed (2) ──────────────────────────────────────────────────
  { id: 'speed_2min', icon: '⚡' },
  { id: 'speed_1min', icon: '💨' },

  // ── Mode variety (3) ───────────────────────────────────────────
  { id: 'speedrun_first', icon: '🏎️' },
  { id: 'ghost_win', icon: '👻' },
  { id: 'replay_10', icon: '🎬' },

  // ── Wild challenge modes (4) ───────────────────────────────────
  { id: 'mode_blind_first', icon: '🙈' },
  { id: 'mode_ironman_first', icon: '🛡️' },
  { id: 'mode_all_one_tech', icon: '👑' },
  { id: 'mode_blind_10', icon: '🔮' },
] as const;

/** Localised achievement list — resolves name/desc from i18n at access time. */
const ACHIEVEMENTS = ACHIEVEMENT_DEFS.map((def) => ({
  ...def,
  get name() {
    return t(`achievements.${def.id}.name`);
  },
  get desc() {
    return t(`achievements.${def.id}.desc`);
  },
}));
export { ACHIEVEMENTS };

// ── Persistence helpers ───────────────────────────────────────────────

export function loadAchievements(): Record<string, { date: string }> {
  return readJson<Record<string, { date: string }>>(SK.ACHIEVEMENTS, {});
}

export function saveAchievementsData(data: Record<string, { date: string }>): void {
  writeJson(SK.ACHIEVEMENTS, data);
}

type LearningLoopMetrics = {
  recommendationClicks: number;
  replayLaunchCompletions: number;
  nextDayReturns: number;
  lastRecommendationDate: string | null;
  lastRecommendationModuleId: string | null;
  lastReturnAwardDate: string | null;
  moduleFunnels: Record<
    string,
    {
      clicks: number;
      completions: number;
      techniqueKey: string | null;
      sourceClicks: Record<string, number>;
      sourceCompletions: Record<string, number>;
    }
  >;
};

type LearningLoopAttribution = {
  source?: string;
  techniqueKey?: string | null;
};

function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readLearningLoopMetrics(): LearningLoopMetrics {
  const raw = readJson<Partial<LearningLoopMetrics>>(SK.LEARNING_LOOP_METRICS, {});
  const moduleFunnelsRaw =
    raw.moduleFunnels && typeof raw.moduleFunnels === 'object' && !Array.isArray(raw.moduleFunnels)
      ? (raw.moduleFunnels as Record<string, unknown>)
      : {};
  const moduleFunnels: LearningLoopMetrics['moduleFunnels'] = {};

  for (const [moduleId, value] of Object.entries(moduleFunnelsRaw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    const sourceClicksRaw =
      obj.sourceClicks && typeof obj.sourceClicks === 'object' && !Array.isArray(obj.sourceClicks)
        ? (obj.sourceClicks as Record<string, unknown>)
        : {};
    const sourceCompletionsRaw =
      obj.sourceCompletions && typeof obj.sourceCompletions === 'object' && !Array.isArray(obj.sourceCompletions)
        ? (obj.sourceCompletions as Record<string, unknown>)
        : {};
    const sourceClicks: Record<string, number> = {};
    const sourceCompletions: Record<string, number> = {};

    for (const [source, count] of Object.entries(sourceClicksRaw)) {
      sourceClicks[source] = Math.max(0, Number(count) || 0);
    }
    for (const [source, count] of Object.entries(sourceCompletionsRaw)) {
      sourceCompletions[source] = Math.max(0, Number(count) || 0);
    }

    moduleFunnels[moduleId] = {
      clicks: Math.max(0, Number(obj.clicks) || 0),
      completions: Math.max(0, Number(obj.completions) || 0),
      techniqueKey: typeof obj.techniqueKey === 'string' && obj.techniqueKey.trim() ? obj.techniqueKey.trim() : null,
      sourceClicks,
      sourceCompletions,
    };
  }

  return {
    recommendationClicks: Math.max(0, Number(raw.recommendationClicks) || 0),
    replayLaunchCompletions: Math.max(0, Number(raw.replayLaunchCompletions) || 0),
    nextDayReturns: Math.max(0, Number(raw.nextDayReturns) || 0),
    lastRecommendationDate: typeof raw.lastRecommendationDate === 'string' ? raw.lastRecommendationDate : null,
    lastRecommendationModuleId:
      typeof raw.lastRecommendationModuleId === 'string' ? raw.lastRecommendationModuleId : null,
    lastReturnAwardDate: typeof raw.lastReturnAwardDate === 'string' ? raw.lastReturnAwardDate : null,
    moduleFunnels,
  };
}

function writeLearningLoopMetrics(metrics: LearningLoopMetrics): void {
  writeJson(SK.LEARNING_LOOP_METRICS, metrics);
}

export function recordLearningRecommendationClick(
  moduleId: string | null,
  date = new Date(),
  attribution?: LearningLoopAttribution,
): void {
  const metrics = readLearningLoopMetrics();
  metrics.recommendationClicks += 1;
  metrics.lastRecommendationDate = todayKey(date);
  metrics.lastRecommendationModuleId = typeof moduleId === 'string' && moduleId.trim() ? moduleId.trim() : null;
  const normalizedId = typeof moduleId === 'string' && moduleId.trim() ? moduleId.trim() : null;
  const source =
    typeof attribution?.source === 'string' && attribution.source.trim() ? attribution.source.trim() : 'unknown';
  const techniqueKey =
    typeof attribution?.techniqueKey === 'string' && attribution.techniqueKey.trim()
      ? attribution.techniqueKey.trim()
      : null;
  if (normalizedId) {
    const existing = metrics.moduleFunnels[normalizedId] ?? {
      clicks: 0,
      completions: 0,
      techniqueKey: null,
      sourceClicks: {},
      sourceCompletions: {},
    };
    existing.clicks += 1;
    existing.sourceClicks[source] = (existing.sourceClicks[source] || 0) + 1;
    if (techniqueKey) existing.techniqueKey = techniqueKey;
    metrics.moduleFunnels[normalizedId] = existing;
  }
  writeLearningLoopMetrics(metrics);
}

export function recordReplayRecommendationCompletion(
  moduleId?: string | null,
  attribution?: LearningLoopAttribution,
): void {
  const metrics = readLearningLoopMetrics();
  metrics.replayLaunchCompletions += 1;
  const normalizedId = typeof moduleId === 'string' && moduleId.trim() ? moduleId.trim() : null;
  const source =
    typeof attribution?.source === 'string' && attribution.source.trim() ? attribution.source.trim() : 'unknown';
  const techniqueKey =
    typeof attribution?.techniqueKey === 'string' && attribution.techniqueKey.trim()
      ? attribution.techniqueKey.trim()
      : null;
  if (normalizedId) {
    const existing = metrics.moduleFunnels[normalizedId] ?? {
      clicks: 0,
      completions: 0,
      techniqueKey: null,
      sourceClicks: {},
      sourceCompletions: {},
    };
    existing.completions += 1;
    existing.sourceCompletions[source] = (existing.sourceCompletions[source] || 0) + 1;
    if (techniqueKey) existing.techniqueKey = techniqueKey;
    metrics.moduleFunnels[normalizedId] = existing;
  }
  writeLearningLoopMetrics(metrics);
}

export function recordLearningTabVisit(date = new Date()): void {
  const metrics = readLearningLoopMetrics();
  if (!metrics.lastRecommendationDate) return;
  const today = todayKey(date);
  if (today <= metrics.lastRecommendationDate) return;
  if (metrics.lastReturnAwardDate === today) return;
  metrics.nextDayReturns += 1;
  metrics.lastReturnAwardDate = today;
  writeLearningLoopMetrics(metrics);
}

// ── Achievement unlock & toast ────────────────────────────────────────

export function unlockAchievement(id: string): boolean {
  const data = loadAchievements();
  if (data[id]) return false;
  data[id] = { date: new Date().toISOString().slice(0, 10) };
  saveAchievementsData(data);
  void syncAchievementsToCloud(data);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) gs.achievementToastQueue.push(a);
  return true;
}

export async function hydrateAchievementsFromCloud(): Promise<void> {
  const local = loadAchievements();
  const merged = await mergeCloudAchievements(local);
  if (!merged) return;
  if (JSON.stringify(local) === JSON.stringify(merged)) return;
  saveAchievementsData(merged);
}

export function processAchievementToasts(): void {
  if (gs.achievementToastActive || !gs.achievementToastQueue.length) return;
  // Duo has a deliberate two-stage finish. Do not let an achievement toast
  // steal focus while either player is still finishing or while the result
  // reveal is entering. The queue remains intact and is retried after the
  // decisive result beat has settled.
  if (gs.isDuoMode) {
    const result = document.getElementById('duo-result-modal');
    const panel = result?.querySelector('.duo-result-panel');
    if (!result || !panel) {
      setTimeout(processAchievementToasts, 400);
      return;
    }
    const openedAt = Number(result.dataset.achievementReadyAt || 0);
    if (!openedAt) {
      result.dataset.achievementReadyAt = String(Date.now() + 1_100);
      setTimeout(processAchievementToasts, 1_100);
      return;
    }
    if (Date.now() < openedAt) {
      setTimeout(processAchievementToasts, Math.max(50, openedAt - Date.now()));
      return;
    }
  }
  gs.achievementToastActive = true;
  const a = gs.achievementToastQueue.shift()!;

  import('../react/toast/achievementToastBridge')
    .then(({ bridgeEnqueueToast }) => {
      bridgeEnqueueToast(a.icon, a.name);
    })
    .catch(() => {});

  // Auto-clear active flag after toast duration (3s) + gap (0.4s)
  setTimeout(() => {
    gs.achievementToastActive = false;
    if (gs.achievementToastQueue.length) setTimeout(processAchievementToasts, 400);
  }, 3400);
}

// ── Stats computation ─────────────────────────────────────────────────

export function computeStats() {
  const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
  const speedRecords = readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {});
  const levels = getAllLevels();
  const mainLevels = levels.filter((l) => !l.hidden);

  let totalCleared = 0,
    totalTime = 0,
    totalStars = 0,
    threeStarCount = 0;
  let fastestTime = Infinity;
  let fastestLevel: (typeof levels)[number] | null = null;

  for (const [id, rec] of Object.entries(records)) {
    const parsed = toClassicLevelRecord(rec);
    if (!parsed) continue;
    const time = parsed.time;
    const stars = parsed.stars;
    totalCleared++;
    totalTime += time;
    totalStars += stars;
    if (stars === 3) threeStarCount++;
    if (time < fastestTime) {
      fastestTime = time;
      fastestLevel = levels.find((l) => l.id === Number(id)) ?? null;
    }
  }

  // Group by tier name to avoid splitting a tier across star-levels
  const tierOrder: string[] = [];
  const tierMap = new Map<string, typeof mainLevels>();
  mainLevels.forEach((level) => {
    const name = level.difficultyName || `Stars ${level.stars}`;
    if (!tierMap.has(name)) {
      tierMap.set(name, []);
      tierOrder.push(name);
    }
    tierMap.get(name)!.push(level);
  });
  const tierStats = tierOrder.map((name) => {
    const tierLevels = tierMap.get(name) || [];
    const tierCleared = tierLevels.filter((l) => records[l.id]).length;
    return { name, total: tierLevels.length, cleared: tierCleared };
  });

  // Practice mode stats
  const practiceRecords = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const practiceCleared = Object.keys(practiceRecords).length;
  const practiceTechs = new Set<string>();
  for (const rec of Object.values(practiceRecords)) {
    const parsed = toClassicLevelRecord(rec);
    if (parsed?.techKey) practiceTechs.add(parsed.techKey);
  }
  // Count fully completed techniques (25/25)
  const techClearCount = new Map<string, number>();
  for (const rec of Object.values(practiceRecords)) {
    const parsed = toClassicLevelRecord(rec);
    if (parsed?.techKey) {
      techClearCount.set(parsed.techKey, (techClearCount.get(parsed.techKey) || 0) + 1);
    }
  }
  const practiceFullTechs = [...techClearCount.entries()].filter(([, count]) => count >= 25).length;

  return {
    totalCleared,
    totalLevels: mainLevels.length,
    threeStarCount,
    totalStars,
    maxStars: mainLevels.length * 3,
    totalTime,
    avgTime: totalCleared > 0 ? Math.round(totalTime / totalCleared) : 0,
    fastestTime: fastestTime === Infinity ? 0 : fastestTime,
    fastestLevel,
    speedrunCleared: Object.keys(speedRecords).length,
    tierStats,
    records,
    speedRecords,
    practiceCleared,
    practiceTotalLevels: 1025,
    practiceTechsStarted: practiceTechs.size,
    practiceFullTechs,
  };
}

type TeachModuleData = {
  technique?: unknown;
  practice?: unknown;
  name?: unknown;
};

type LearningTechniqueProgress = {
  id: string;
  totalModules: number;
  readModules: number;
  practicedModules: number;
  masteryPct: number;
  technique: string;
  name: string;
  read: number;
  practiced: number;
  clears: number;
  total: number;
  pct: number;
};

type LearningRiskSeverity = 'high' | 'medium';

type LearningRiskAlert = LearningTechniqueProgress & {
  title: string;
  detail: string;
  severity: LearningRiskSeverity;
  reason: string;
  action: string;
};

function isTeachModuleData(value: unknown): value is TeachModuleData {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function getTeachModuleEntries(): Array<[string, TeachModuleData]> {
  const teachData = getTeachData();
  const entries: Array<[string, TeachModuleData]> = [];
  for (const [key, mod] of Object.entries(teachData)) {
    if (isTeachModuleData(mod)) entries.push([key, mod]);
  }
  return entries;
}

function normalizeTechniqueKey(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeTechniqueName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function buildLearningTechniqueProgress(): {
  techniqueProgress: LearningTechniqueProgress[];
  topTechniques: LearningTechniqueProgress[];
  riskAlerts: LearningRiskAlert[];
} {
  const teachRead = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  const practiceDone = readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {});
  const practiceRecords = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const teachModules = getTeachModuleEntries();

  const progressMap = new Map<string, LearningTechniqueProgress>();
  for (const [key, mod] of teachModules) {
    const technique = normalizeTechniqueKey(mod.technique, `module-${key}`);
    const name = normalizeTechniqueName(mod.name, `Module ${key}`);
    const current = progressMap.get(technique) ?? {
      id: technique,
      totalModules: 0,
      readModules: 0,
      practicedModules: 0,
      masteryPct: 0,
      technique,
      name,
      read: 0,
      practiced: 0,
      clears: 0,
      total: 0,
      pct: 0,
    };
    if (current.name.startsWith('Module ') && name) current.name = name;
    current.total += 1;
    current.totalModules += 1;
    if (isTruthyFlag(teachRead[key])) current.read += 1;
    if (isTruthyFlag(teachRead[key])) current.readModules += 1;
    if (Array.isArray(mod.practice) && mod.practice.length > 0 && isTruthyFlag(practiceDone[key]))
      current.practiced += 1;
    if (Array.isArray(mod.practice) && mod.practice.length > 0 && isTruthyFlag(practiceDone[key]))
      current.practicedModules += 1;
    progressMap.set(technique, current);
  }

  const techniqueClears = new Map<string, number>();
  for (const rec of Object.values(practiceRecords)) {
    const parsed = toClassicLevelRecord(rec);
    if (!parsed?.techKey) continue;
    const technique = normalizeTechniqueKey(parsed.techKey, '');
    if (!technique) continue;
    techniqueClears.set(technique, (techniqueClears.get(technique) || 0) + 1);
  }

  const techniqueProgress = [...progressMap.values()]
    .map((item) => {
      const clears = techniqueClears.get(item.technique) || 0;
      const readRatio = item.total > 0 ? item.read / item.total : 0;
      const practicedRatio = item.total > 0 ? item.practiced / item.total : 0;
      const clearsRatio = item.total > 0 ? Math.min(clears, item.total) / item.total : 0;
      const masteryPct = Math.round(((readRatio + practicedRatio + clearsRatio) / 3) * 100);
      return {
        ...item,
        id: item.technique,
        clears,
        pct: masteryPct,
        masteryPct,
        totalModules: item.total,
        readModules: item.read,
        practicedModules: item.practiced,
      };
    })
    .sort((a, b) => a.technique.localeCompare(b.technique) || a.name.localeCompare(b.name));

  const topTechniques = [...techniqueProgress]
    .sort(
      (a, b) =>
        b.pct - a.pct ||
        b.clears - a.clears ||
        b.practiced - a.practiced ||
        b.read - a.read ||
        a.technique.localeCompare(b.technique),
    )
    .slice(0, 5);

  const riskAlerts = [...techniqueProgress]
    .map<LearningRiskAlert | null>((item) => {
      const clearsRatio = item.total > 0 ? Math.min(item.clears, item.total) / item.total : 0;

      if (item.read > 0 && item.practiced === 0) {
        return {
          ...item,
          title: item.name,
          detail: '已讀但尚未完成練習',
          severity: 'high',
          reason: '已讀但尚未完成練習',
          action: `完成 ${item.name} 的練習`,
        };
      }

      if (item.practiced > 0 && clearsRatio < 0.25) {
        return {
          ...item,
          title: item.name,
          detail: '練習已做但清關數過低',
          severity: 'medium',
          reason: '練習已做但清關數過低',
          action: `補強 ${item.name} 的實戰清關`,
        };
      }

      return null;
    })
    .filter((item): item is LearningRiskAlert => !!item)
    .sort((a, b) => {
      const severityRank = (severity: LearningRiskSeverity) => (severity === 'high' ? 2 : 1);
      return (
        severityRank(b.severity) - severityRank(a.severity) ||
        a.pct - b.pct ||
        a.clears - b.clears ||
        a.technique.localeCompare(b.technique)
      );
    })
    .slice(0, 5);

  return { techniqueProgress, topTechniques, riskAlerts };
}

export function computeLearningStats() {
  const teachRead = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  const practiceDone = readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {});
  const teachModules = getTeachModuleEntries();
  const teachTotal = teachModules.length;

  const practiceModuleKeys = new Set(
    teachModules.filter(([, mod]) => Array.isArray(mod.practice) && mod.practice.length > 0).map(([key]) => key),
  );

  const teachReadCount = teachModules.reduce((count, [key]) => count + (isTruthyFlag(teachRead[key]) ? 1 : 0), 0);
  const practiceDoneCount = [...practiceModuleKeys].reduce(
    (count, key) => count + (isTruthyFlag(practiceDone[key]) ? 1 : 0),
    0,
  );
  const practiceTotalTechniques = practiceModuleKeys.size;
  const unreadTeach = Math.max(0, teachTotal - teachReadCount);
  const unmasteredTech = Math.max(0, practiceTotalTechniques - practiceDoneCount);
  const practiceModules = teachModules.filter(([, mod]) => Array.isArray(mod.practice) && mod.practice.length > 0);
  const masteredTechniqueCount = practiceDoneCount;
  const totalTechniqueCount = practiceTotalTechniques;
  const masteryPct =
    teachTotal > 0 || practiceTotalTechniques > 0
      ? Math.round(
          (((teachTotal > 0 ? teachReadCount / teachTotal : 0) +
            (practiceTotalTechniques > 0 ? practiceDoneCount / practiceTotalTechniques : 0)) /
            ((teachTotal > 0 ? 1 : 0) + (practiceTotalTechniques > 0 ? 1 : 0) || 1)) *
            100,
        )
      : 0;
  const learningV2 = buildLearningTechniqueProgress();
  const loopMetrics = readLearningLoopMetrics();
  const replayCompletionRatePct =
    loopMetrics.recommendationClicks > 0
      ? Math.round((loopMetrics.replayLaunchCompletions / loopMetrics.recommendationClicks) * 100)
      : 0;
  const nextDayReturnRatePct =
    loopMetrics.recommendationClicks > 0
      ? Math.round((loopMetrics.nextDayReturns / loopMetrics.recommendationClicks) * 100)
      : 0;

  const teachModuleMap = new Map(teachModules.map(([id, mod]) => [id, mod] as const));
  const topConvertingModules = Object.entries(loopMetrics.moduleFunnels)
    .map(([moduleId, funnel]) => {
      const mod = teachModuleMap.get(moduleId);
      const name = typeof mod?.name === 'string' && mod.name.trim() ? mod.name.trim() : `Module ${moduleId}`;
      const technique =
        typeof mod?.technique === 'string' && mod.technique.trim() ? mod.technique.trim() : funnel.techniqueKey || '';
      const clicks = Math.max(0, funnel.clicks);
      const completions = Math.max(0, funnel.completions);
      const rate = clicks > 0 ? Math.round((completions / clicks) * 100) : 0;
      return { moduleId, name, technique, clicks, completions, completionRatePct: Math.max(0, Math.min(100, rate)) };
    })
    .filter((item) => item.clicks > 0 || item.completions > 0)
    .sort(
      (a, b) =>
        b.completionRatePct - a.completionRatePct ||
        b.completions - a.completions ||
        b.clicks - a.clicks ||
        Number(a.moduleId) - Number(b.moduleId),
    )
    .slice(0, 5);

  const nextTeachModules = teachModules
    .filter(([key]) => !isTruthyFlag(teachRead[key]))
    .slice(0, 4)
    .map(([key, mod]) => ({
      id: key,
      name: typeof mod.name === 'string' && mod.name.trim() ? mod.name : `Module ${key}`,
      technique: typeof mod.technique === 'string' ? mod.technique : '',
      read: false,
      practiced: isTruthyFlag(practiceDone[key]),
    }));

  const nextPracticeModules = practiceModules
    .filter(([key]) => isTruthyFlag(teachRead[key]) && !isTruthyFlag(practiceDone[key]))
    .slice(0, 4)
    .map(([key, mod]) => ({
      id: key,
      name: typeof mod.name === 'string' && mod.name.trim() ? mod.name : `Module ${key}`,
      technique: typeof mod.technique === 'string' ? mod.technique : '',
      read: true,
      practiced: false,
    }));

  return {
    teachReadCount,
    teachTotal,
    practiceDoneCount,
    practiceTotalTechniques,
    practiceTotal: practiceTotalTechniques,
    masteredTechniqueCount,
    totalTechniqueCount,
    masteryPct,
    techniqueProgress: learningV2.techniqueProgress,
    topTechniques: learningV2.topTechniques,
    riskAlerts: learningV2.riskAlerts,
    nextTeachModules,
    nextPracticeModules,
    unreadTeach,
    unmasteredTech,
    learningLoop: {
      recommendationClicks: loopMetrics.recommendationClicks,
      replayLaunchCompletions: loopMetrics.replayLaunchCompletions,
      nextDayReturns: loopMetrics.nextDayReturns,
      replayCompletionRatePct,
      nextDayReturnRatePct,
      lastRecommendationDate: loopMetrics.lastRecommendationDate,
      lastRecommendationModuleId: loopMetrics.lastRecommendationModuleId,
      topConvertingModules,
    },
  };
}

// ── Achievement checking ──────────────────────────────────────────────

export function checkAllAchievements(): void {
  const stats = computeStats();
  const { totalCleared, threeStarCount, records, speedRecords, tierStats, practiceCleared, practiceFullTechs } = stats;
  const combinedCleared = totalCleared + practiceCleared;

  // ── Journey milestones ──
  if (combinedCleared >= 1) unlockAchievement('first_clear');
  if (combinedCleared >= 50) unlockAchievement('clear_50');
  const levels = getAllLevels();
  const mainLevels = levels.filter((l) => !l.hidden);
  if (mainLevels.length > 0 && mainLevels.every((l) => records[l.id])) unlockAchievement('clear_all');
  if (tierStats.some((t) => t.total > 0 && t.cleared >= t.total)) unlockAchievement('tier_any');

  // ── Precision ──
  if (threeStarCount >= 1) unlockAchievement('perfect_one');
  const cleanStreak = readJson<number>(SK.CLEAN_STREAK, 0);
  if (cleanStreak >= 5) unlockAchievement('streak_5_clean');

  // ── Speed ──
  for (const rec of Object.values(records)) {
    const parsed = toClassicLevelRecord(rec);
    if (!parsed) continue;
    const t = parsed.time;
    if (t <= 120) unlockAchievement('speed_2min');
    if (t <= 60) unlockAchievement('speed_1min');
  }

  // ── Scoring ──
  const sCount = readJson<number>(SK.S_GRADE_COUNT, 0);
  const sStreak = readJson<number>(SK.S_GRADE_STREAK, 0);
  if (sCount >= 1) unlockAchievement('grade_s');
  if (sCount >= 10) unlockAchievement('grade_s_10');
  if (sStreak >= 3) unlockAchievement('streak_3_s');
  // grade_a is checked when score is recorded (see recordReplayGrade)

  // ── Technique mastery ──
  const usedTechs = readJson<string[]>(SK.TECHNIQUES_USED, []);
  const techSet = new Set(usedTechs);
  if (techSet.has('locked_candidates')) unlockAchievement('tech_locked');
  if (techSet.has('x_wing') || techSet.has('swordfish') || techSet.has('jellyfish')) unlockAchievement('tech_fish');
  if (techSet.has('xy_wing') || techSet.has('xyz_wing') || techSet.has('w_wing')) unlockAchievement('tech_wing');
  if (
    techSet.has('aic') ||
    techSet.has('aic_mid_chain') ||
    techSet.has('aic_long_chain') ||
    techSet.has('forcing_chain_net')
  )
    unlockAchievement('tech_chain');
  if (techSet.has('als_xz') || techSet.has('als_chain') || techSet.has('als_xy')) unlockAchievement('tech_als');

  // ── Candidate elimination ──
  const totalElim = readJson<number>(SK.TOTAL_ELIMINATIONS, 0);
  if (totalElim >= 100) unlockAchievement('elim_100');
  if (totalElim >= 1000) unlockAchievement('elim_1000');
  if (totalElim >= 5000) unlockAchievement('elim_5000');

  // ── Learning ──
  const teachRead = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  if (Object.keys(teachRead).length >= 10) unlockAchievement('teach_read_10');
  if (Object.keys(teachRead).length >= 40) unlockAchievement('teach_read_all');
  if (practiceCleared >= 10) unlockAchievement('practice_10');
  if (practiceFullTechs >= 1) unlockAchievement('practice_master_1');
  if (practiceFullTechs >= 10) unlockAchievement('practice_master_10');
  if (practiceFullTechs >= 41) unlockAchievement('practice_master_all');

  // ── Mode variety ──
  if (Object.keys(speedRecords).length > 0) unlockAchievement('speedrun_first');
  const replayCount = readJson<number>(SK.REPLAY_WATCH_COUNT, 0);
  if (replayCount >= 10) unlockAchievement('replay_10');

  // ── Mode achievements (from Wild bestiary) ──
  const wildRaw = readJson<Record<string, unknown>>(SK.WILD_PROFILE, {});
  const bestiary = (wildRaw.bestiary ?? {}) as Record<string, Record<string, unknown>>;
  const bEntries = Object.values(bestiary);
  let hasBlind = false,
    hasIronman = false;
  let blindTechCount = 0,
    anyAllModes = false;
  const requiredModes = ['standard', 'blind', 'ironman'];
  for (const be of bEntries) {
    if (!be?.kills) continue;
    const mc = Array.isArray(be.modesCleared) ? (be.modesCleared as string[]) : [];
    if (mc.includes('blind')) {
      hasBlind = true;
      blindTechCount++;
    }
    if (mc.includes('ironman')) hasIronman = true;
    if (requiredModes.every((m) => mc.includes(m))) anyAllModes = true;
  }
  if (hasBlind) unlockAchievement('mode_blind_first');
  if (hasIronman) unlockAchievement('mode_ironman_first');
  if (anyAllModes) unlockAchievement('mode_all_one_tech');
  if (blindTechCount >= 10) unlockAchievement('mode_blind_10');

  processAchievementToasts();
}

/** Call after a game ends to update streak/score counters */
export function recordGameResult(errors: number, grade: string | null, techniquesUsed: string[]): void {
  // Clean streak
  const prevStreak = readJson<number>(SK.CLEAN_STREAK, 0);
  writeJson(SK.CLEAN_STREAK, errors === 0 ? prevStreak + 1 : 0);

  // S/A grade tracking
  if (grade === 'S') {
    const count = readJson<number>(SK.S_GRADE_COUNT, 0) + 1;
    writeJson(SK.S_GRADE_COUNT, count);
    const streak = readJson<number>(SK.S_GRADE_STREAK, 0) + 1;
    writeJson(SK.S_GRADE_STREAK, streak);
  } else {
    writeJson(SK.S_GRADE_STREAK, 0);
  }
  if (grade === 'A' || grade === 'S') unlockAchievement('grade_a');

  // No-guess detection
  if (grade && techniquesUsed.length > 0) {
    // If every fill was detected by a technique, it's zero-guess
    unlockAchievement('no_guess');
  }

  // Technique variety
  const uniqueInGame = new Set(techniquesUsed);
  if (uniqueInGame.size >= 5) unlockAchievement('tech_variety');

  // Accumulate techniques used globally
  const global = readJson<string[]>(SK.TECHNIQUES_USED, []);
  const globalSet = new Set(global);
  for (const t of techniquesUsed) globalSet.add(t);
  writeJson(SK.TECHNIQUES_USED, [...globalSet]);
}

/** Call when an elimination action is recorded */
export function recordElimination(): void {
  const count = readJson<number>(SK.TOTAL_ELIMINATIONS, 0) + 1;
  writeJson(SK.TOTAL_ELIMINATIONS, count);
}

/** Call when replay is watched */
export function recordReplayWatch(): void {
  const count = readJson<number>(SK.REPLAY_WATCH_COUNT, 0) + 1;
  writeJson(SK.REPLAY_WATCH_COUNT, count);
}

// ── Stats modal UI (React-managed via StatsModal.tsx) ─────────────────

export function openStatsModal(): void {
  import('../react/stats/statsBridge').then(({ bridgeOpenStats }) => bridgeOpenStats()).catch(() => {});
}

export function closeStatsModal(): void {
  import('../react/stats/statsBridge').then(({ bridgeCloseStats }) => bridgeCloseStats()).catch(() => {});
}
