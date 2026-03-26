// Stats, achievements, and stats modal — extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { getAllLevels } from '../data/dataRegistry';

// ── Achievement definitions ───────────────────────────────────────────

const ACHIEVEMENTS = [
  { id: 'first_clear', name: '初試啼聲', desc: '完成第一關', icon: '🌱' },
  { id: 'perfect_one', name: '完美無瑕', desc: '任一關取得三星', icon: '⭐' },
  { id: 'perfect_10', name: '十全十美', desc: '累計 10 關三星', icon: '🌟' },
  { id: 'perfect_50', name: '星光璀璨', desc: '累計 50 關三星', icon: '✨' },
  { id: 'clear_10', name: '嶄露頭角', desc: '累計通關 10 關', icon: '🔥' },
  { id: 'clear_50', name: '爐火純青', desc: '累計通關 50 關', icon: '💪' },
  { id: 'clear_100', name: '百戰不殆', desc: '累計通關 100 關', icon: '🏆' },
  { id: 'clear_all', name: '全制霸', desc: '通關全部關卡', icon: '👑' },
  { id: 'speed_2min', name: '閃電手', desc: '2 分鐘內通關', icon: '⚡' },
  { id: 'speed_1min', name: '光速通關', desc: '1 分鐘內通關', icon: '💨' },
  { id: 'tier_any', name: '悟道者', desc: '全通任一難度分類', icon: '🪷' },
  { id: 'tier_初心', name: '初心圓滿', desc: '全通「初心」', icon: '🧘' },
  { id: 'tier_鍛骨', name: '鍛骨初成', desc: '全通「鍛骨」', icon: '🦴' },
  { id: 'tier_虛空', name: '虛空凝意', desc: '全通「虛空」', icon: '🌌' },
  { id: 'tier_無我', name: '無我通明', desc: '全通「無我」', icon: '🫧' },
  { id: 'tier_破陣', name: '破陣先鋒', desc: '全通「破陣」', icon: '✂️' },
  { id: 'tier_空鏡', name: '空鏡無塵', desc: '全通「空鏡」', icon: '🪞' },
  { id: 'tier_星潮', name: '星潮湧動', desc: '全通「星潮」', icon: '🌠' },
  { id: 'tier_玄鏈', name: '鏈術宗師', desc: '全通「玄鏈」', icon: '🔗' },
  { id: 'tier_本源', name: '本源歸真', desc: '全通「本源」', icon: '🌀' },
  { id: 'tier_寂滅', name: '寂滅突破', desc: '全通「寂滅」', icon: '🕳️' },
  { id: 'tier_化神', name: '化神顯聖', desc: '全通「化神」', icon: '🔥' },
  { id: 'tier_返虛', name: '返虛守一', desc: '全通「返虛」', icon: '🌫️' },
  { id: 'tier_合道', name: '合道同源', desc: '全通「合道」', icon: '☯️' },
  { id: 'tier_渡劫', name: '渡劫無懼', desc: '全通「渡劫」', icon: '⛈️' },
  { id: 'tier_真仙', name: '真仙問世', desc: '全通「真仙」', icon: '🪽' },
  { id: 'tier_二昇', name: '二昇破關', desc: '全通「二昇」', icon: '🪜' },
  { id: 'tier_玄仙', name: '玄仙立極', desc: '全通「玄仙」', icon: '✨' },
  { id: 'tier_太乙', name: '太乙歸元', desc: '全通「太乙」', icon: '🌞' },
  { id: 'tier_大羅', name: '大羅無量', desc: '全通「大羅」', icon: '🜂' },
  { id: 'tier_混元', name: '混元一炁', desc: '全通「混元」', icon: '🌊' },
  { id: 'tier_天尊', name: '天尊鎮界', desc: '全通「天尊」', icon: '👑' },
  { id: 'tier_三昇', name: '三昇凌霄', desc: '全通「三昇」', icon: '🚀' },
  { id: 'tier_神王', name: '神王臨世', desc: '全通「神王」', icon: '⚔️' },
  { id: 'tier_帝宙', name: '帝宙齊天', desc: '全通「帝宙」', icon: '🦅' },
  { id: 'tier_神人', name: '神人無雙', desc: '全通「神人」', icon: '🌟' },
  { id: 'speedrun_first', name: '競速初體驗', desc: '競速模式通關', icon: '🏎️' },
  { id: 'ghost_win', name: '鬼影殺手', desc: '幽靈模式下通關', icon: '👻' },
];
export { ACHIEVEMENTS };

export const tierAchievementMap: Record<string, string> = {
  初心: 'tier_初心',
  鍛骨: 'tier_鍛骨',
  虛空: 'tier_虛空',
  無我: 'tier_無我',
  破陣: 'tier_破陣',
  空鏡: 'tier_空鏡',
  星潮: 'tier_星潮',
  玄鏈: 'tier_玄鏈',
  本源: 'tier_本源',
  寂滅: 'tier_寂滅',
  化神: 'tier_化神',
  返虛: 'tier_返虛',
  合道: 'tier_合道',
  渡劫: 'tier_渡劫',
  真仙: 'tier_真仙',
  二昇: 'tier_二昇',
  玄仙: 'tier_玄仙',
  太乙: 'tier_太乙',
  大羅: 'tier_大羅',
  混元: 'tier_混元',
  天尊: 'tier_天尊',
  三昇: 'tier_三昇',
  神王: 'tier_神王',
  帝宙: 'tier_帝宙',
  神人: 'tier_神人',
};

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
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) gs.achievementToastQueue.push(a);
  return true;
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

  if (totalCleared >= 1) unlockAchievement('first_clear');
  if (threeStarCount >= 1) unlockAchievement('perfect_one');
  if (threeStarCount >= 10) unlockAchievement('perfect_10');
  if (threeStarCount >= 50) unlockAchievement('perfect_50');
  if (totalCleared >= 10) unlockAchievement('clear_10');
  if (totalCleared >= 50) unlockAchievement('clear_50');
  if (totalCleared >= 100) unlockAchievement('clear_100');

  const levels = getAllLevels();
  const mainLevels = levels.filter((l) => !l.hidden);
  if (mainLevels.length > 0 && mainLevels.every((l) => records[l.id])) unlockAchievement('clear_all');

  for (const rec of Object.values(records)) {
    const t = typeof rec === 'number' ? rec : rec.time;
    if (t <= 120) unlockAchievement('speed_2min');
    if (t <= 60) unlockAchievement('speed_1min');
  }

  if (tierStats.some((t) => t.total > 0 && t.cleared >= t.total)) unlockAchievement('tier_any');

  // Per-tier full clear achievements
  tierStats.forEach((t) => {
    if (t.total > 0 && t.cleared >= t.total && tierAchievementMap[t.name]) {
      unlockAchievement(tierAchievementMap[t.name]);
    }
  });

  if (Object.keys(speedRecords).length > 0) unlockAchievement('speedrun_first');

  processAchievementToasts();
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
