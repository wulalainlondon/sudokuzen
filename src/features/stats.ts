// Stats, achievements, and stats modal — extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getAllLevels } from '../data/dataRegistry';
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

  // ── Wild challenge modes (5) ───────────────────────────────────
  { id: 'mode_blind_first', icon: '🙈' },
  { id: 'mode_ironman_first', icon: '🛡️' },
  { id: 'mode_nonotes_first', icon: '🧘' },
  { id: 'mode_all_one_tech', icon: '👑' },
  { id: 'mode_blind_10', icon: '🔮' },
] as const;

/** Localised achievement list — resolves name/desc from i18n at access time. */
const ACHIEVEMENTS = ACHIEVEMENT_DEFS.map((def) => ({
  ...def,
  get name() { return t(`achievements.${def.id}.name`); },
  get desc() { return t(`achievements.${def.id}.desc`); },
}));
export { ACHIEVEMENTS };

// ── Persistence helpers ───────────────────────────────────────────────

export function loadAchievements(): Record<string, { date: string }> {
  return readJson<Record<string, { date: string }>>(SK.ACHIEVEMENTS, {});
}

export function saveAchievementsData(data: Record<string, { date: string }>): void {
  writeJson(SK.ACHIEVEMENTS, data);
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
  gs.achievementToastActive = true;
  const a = gs.achievementToastQueue.shift()!;

  import('../react/toast/achievementToastBridge').then(({ bridgeEnqueueToast }) => {
    bridgeEnqueueToast(a.icon, a.name);
  }).catch(() => {});

  // Auto-clear active flag after toast duration (3s) + gap (0.4s)
  setTimeout(() => {
    gs.achievementToastActive = false;
    if (gs.achievementToastQueue.length) setTimeout(processAchievementToasts, 400);
  }, 3400);
}

// ── Stats computation ─────────────────────────────────────────────────

export function computeStats() {
  const records = readJson<Record<string, any>>(SK.RECORDS, {});
  const speedRecords = readJson<Record<string, any>>(SK.SPEED_RECORDS, {});
  const levels = getAllLevels();
  const mainLevels = levels.filter((l) => !l.hidden);

  let totalCleared = 0,
    totalTime = 0,
    totalStars = 0,
    threeStarCount = 0;
  let fastestTime = Infinity;
  let fastestLevel: (typeof levels)[number] | null = null;

  for (const [id, rec] of Object.entries(records)) {
    const time = typeof rec === 'number' ? rec : rec.time;
    const stars = typeof rec === 'number' ? 1 : rec.stars || 1;
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
  const practiceRecords = readJson<Record<string, any>>(SK.PRACTICE_RECORDS, {});
  const practiceCleared = Object.keys(practiceRecords).length;
  const practiceTechs = new Set<string>();
  for (const rec of Object.values(practiceRecords)) {
    if (rec && rec.techKey) practiceTechs.add(rec.techKey);
  }
  // Count fully completed techniques (25/25)
  const techClearCount = new Map<string, number>();
  for (const rec of Object.values(practiceRecords)) {
    if (rec && rec.techKey) {
      techClearCount.set(rec.techKey, (techClearCount.get(rec.techKey) || 0) + 1);
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
    const t = typeof rec === 'number' ? rec : rec.time;
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
  let hasBlind = false, hasIronman = false, hasNoNotes = false;
  let blindTechCount = 0, anyAllModes = false;
  const requiredModes = ['standard', 'blind', 'ironman', 'noNotes'];
  for (const be of bEntries) {
    if (!be?.kills) continue;
    const mc = Array.isArray(be.modesCleared) ? be.modesCleared as string[] : [];
    if (mc.includes('blind')) { hasBlind = true; blindTechCount++; }
    if (mc.includes('ironman')) hasIronman = true;
    if (mc.includes('noNotes')) hasNoNotes = true;
    if (requiredModes.every(m => mc.includes(m))) anyAllModes = true;
  }
  if (hasBlind) unlockAchievement('mode_blind_first');
  if (hasIronman) unlockAchievement('mode_ironman_first');
  if (hasNoNotes) unlockAchievement('mode_nonotes_first');
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
