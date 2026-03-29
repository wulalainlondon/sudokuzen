// Stats, achievements, and stats modal — extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { getAllLevels } from '../data/dataRegistry';
import { mergeCloudAchievements, syncAchievementsToCloud } from '../firebase/client';

// ── Achievement definitions ───────────────────────────────────────────

// Each achievement teaches a behavior or marks a genuine milestone.
// No padding, no filler — every unlock should feel meaningful.

const ACHIEVEMENTS = [
  // ── Journey milestones (4) ──────────────────────────────────────
  { id: 'first_clear', name: '初試啼聲', desc: '完成第一關', icon: '🌱' },
  { id: 'clear_50', name: '爐火純青', desc: '累計通關 50 關', icon: '💪' },
  { id: 'clear_all', name: '全制霸', desc: '通關全部關卡', icon: '👑' },
  { id: 'tier_any', name: '悟道者', desc: '全通任一境界', icon: '🪷' },

  // ── Precision (3) — teaches "don't guess, be accurate" ──────────
  { id: 'perfect_one', name: '完美無瑕', desc: '任一關零失誤三星', icon: '⭐' },
  { id: 'no_guess', name: '純粹邏輯', desc: '零猜測完成一局（偵測器辨識所有步驟）', icon: '🧠' },
  { id: 'streak_5_clean', name: '穩如磐石', desc: '連續 5 局零失誤', icon: '🪨' },

  // ── Scoring (4) — teaches "technique mastery earns points" ──────
  { id: 'grade_a', name: '初露鋒芒', desc: '回放評分達到 A 級', icon: '🅰️' },
  { id: 'grade_s', name: '登峰造極', desc: '回放評分達到 S 級', icon: '🏅' },
  { id: 'grade_s_10', name: '常駐巔峰', desc: '累計 10 次 S 級評分', icon: '💎' },
  { id: 'streak_3_s', name: '三連霸', desc: '連續 3 局 S 級評分', icon: '🔱' },

  // ── Technique mastery (6) — teaches "learn the next technique" ──
  { id: 'tech_locked', name: '初見・封鎖', desc: '首次使用鎖定候選消去', icon: '🔒' },
  { id: 'tech_fish', name: '初見・魚型', desc: '首次使用 X-Wing 或 Swordfish', icon: '🐟' },
  { id: 'tech_wing', name: '初見・翼型', desc: '首次使用 XY-Wing / W-Wing', icon: '🦋' },
  { id: 'tech_chain', name: '初見・鏈型', desc: '首次使用 AIC 或強制鏈', icon: '🔗' },
  { id: 'tech_als', name: '初見・ALS', desc: '首次使用 ALS-XZ 或 ALS Chain', icon: '🧬' },
  { id: 'tech_variety', name: '博學多聞', desc: '單局使用 5 種以上不同技巧', icon: '📚' },

  // ── Candidate elimination (3) — teaches "the game is about eliminating" ──
  { id: 'elim_100', name: '候選獵人', desc: '累計消除 100 個候選', icon: '✂️' },
  { id: 'elim_1000', name: '消去大師', desc: '累計消除 1,000 個候選', icon: '🗡️' },
  { id: 'elim_5000', name: '候選終結者', desc: '累計消除 5,000 個候選', icon: '⚔️' },

  // ── Learning (3) — teaches "study, don't just play" ─────────────
  { id: 'teach_read_10', name: '書蟲', desc: '研讀 10 本秘笈', icon: '📖' },
  { id: 'teach_read_all', name: '藏經閣主', desc: '研讀全部秘笈', icon: '🏛️' },
  { id: 'practice_10', name: '勤修苦練', desc: '完成 10 個練習題', icon: '🎯' },

  // ── Speed (2) — teaches "fluency comes from practice" ───────────
  { id: 'speed_2min', name: '閃電手', desc: '2 分鐘內通關', icon: '⚡' },
  { id: 'speed_1min', name: '光速通關', desc: '1 分鐘內通關', icon: '💨' },

  // ── Mode variety (3) — teaches "try different ways to play" ─────
  { id: 'speedrun_first', name: '競速初體驗', desc: '競速模式通關', icon: '🏎️' },
  { id: 'ghost_win', name: '鬼影殺手', desc: '幽靈模式下擊敗自己', icon: '👻' },
  { id: 'replay_10', name: '覆盤學者', desc: '觀看 10 次回放', icon: '🎬' },
];
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
  const toast = document.getElementById('achievement-toast');
  if (!toast) {
    gs.achievementToastActive = false;
    return;
  }
  document.getElementById('achievement-toast-icon')!.textContent = a.icon;
  document.getElementById('achievement-toast-name')!.textContent = a.name;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    gs.achievementToastActive = false;
    if (gs.achievementToastQueue.length) setTimeout(processAchievementToasts, 400);
  }, 3000);
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
  };
}

// ── Achievement checking ──────────────────────────────────────────────

export function checkAllAchievements(): void {
  const stats = computeStats();
  const { totalCleared, threeStarCount, records, speedRecords, tierStats } = stats;

  // ── Journey milestones ──
  if (totalCleared >= 1) unlockAchievement('first_clear');
  if (totalCleared >= 50) unlockAchievement('clear_50');
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
  const practDone = readJson<Record<string, boolean>>(SK.PRACTICE_DONE, {});
  if (Object.keys(teachRead).length >= 10) unlockAchievement('teach_read_10');
  if (Object.keys(teachRead).length >= 40) unlockAchievement('teach_read_all');
  if (Object.keys(practDone).length >= 10) unlockAchievement('practice_10');

  // ── Mode variety ──
  if (Object.keys(speedRecords).length > 0) unlockAchievement('speedrun_first');
  const replayCount = readJson<number>(SK.REPLAY_WATCH_COUNT, 0);
  if (replayCount >= 10) unlockAchievement('replay_10');

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

// ── Stats modal UI ────────────────────────────────────────────────────

export function switchStatsTab(tab: string): void {
  const isOverview = tab === 'overview';
  document.getElementById('stats-tab-overview')!.classList.toggle('active', isOverview);
  document.getElementById('stats-tab-achievement')!.classList.toggle('active', !isOverview);
  (document.getElementById('stats-content-overview') as HTMLElement).style.display = isOverview ? 'block' : 'none';
  (document.getElementById('stats-content-achievement') as HTMLElement).style.display = isOverview ? 'none' : 'block';
}

export function renderStatsModal(): void {
  const stats = computeStats();
  const achievements = loadAchievements();

  // Overview
  const completionPct = stats.totalLevels > 0 ? Math.round((stats.totalCleared / stats.totalLevels) * 100) : 0;
  const fastLabel = stats.fastestLevel ? stats.fastestLevel.displayName : '';
  document.getElementById('stats-overview')!.innerHTML = `
    <div class="stat-item">
        <div class="stat-value">${stats.totalCleared}<span style="font-size:0.7rem;color:var(--text-light)">/${stats.totalLevels}</span></div>
        <div class="stat-label">通關數 (${completionPct}%)</div>
    </div>
    <div class="stat-item">
        <div class="stat-value">${stats.threeStarCount}</div>
        <div class="stat-label">三星通關</div>
    </div>
    <div class="stat-item">
        <div class="stat-value">${stats.totalCleared > 0 ? formatSeconds(stats.avgTime) : '--'}</div>
        <div class="stat-label">平均用時</div>
    </div>
    <div class="stat-item">
        <div class="stat-value">${stats.fastestTime > 0 ? formatSeconds(stats.fastestTime) : '--'}</div>
        <div class="stat-label">${fastLabel ? '最速 ' + fastLabel : '最速通關'}</div>
    </div>
    <div class="stat-item">
        <div class="stat-value">${stats.totalStars}<span style="font-size:0.7rem;color:var(--text-light)">/${stats.maxStars}</span></div>
        <div class="stat-label">總星數</div>
    </div>
    <div class="stat-item">
        <div class="stat-value">${formatSeconds(stats.totalTime)}</div>
        <div class="stat-label">最佳用時總計</div>
    </div>
  `;

  // Tier progress
  document.getElementById('stats-tier-progress')!.innerHTML = stats.tierStats
    .map((t) => {
      const pct = t.total > 0 ? Math.round((t.cleared / t.total) * 100) : 0;
      return `<div class="tier-progress">
        <span class="tier-name">${t.name}</span>
        <div class="tier-bar"><div class="tier-bar-fill" style="width:${pct}%"></div></div>
        <span class="tier-count">${t.cleared}/${t.total}</span>
    </div>`;
    })
    .join('');

  // Achievements
  const unlockedCount = ACHIEVEMENTS.filter((a) => achievements[a.id]).length;
  document.getElementById('achievement-counter')!.innerHTML =
    `已解鎖 <span>${unlockedCount}</span> / ${ACHIEVEMENTS.length}`;

  document.getElementById('achievement-grid')!.innerHTML = ACHIEVEMENTS.map((a) => {
    const u = achievements[a.id];
    return `<div class="achievement-card ${u ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
        ${u ? `<div class="achievement-date">${u.date}</div>` : ''}
    </div>`;
  }).join('');
}

export function openStatsModal(): void {
  switchStatsTab('overview');
  renderStatsModal();
  // Retroactively check achievements from existing records
  checkAllAchievements();
  document.getElementById('stats-modal')!.style.display = 'flex';
}

export function closeStatsModal(): void {
  document.getElementById('stats-modal')!.style.display = 'none';
}
