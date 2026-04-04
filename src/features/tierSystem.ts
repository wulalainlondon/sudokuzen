// Tier/realm unlock logic and progression system

import { gs, type LevelData } from '../game/state';
import { getAllLevels } from '../data/dataRegistry';
import { SK, readJson } from '../storage/keys';
import { t } from '../i18n/t';

// ── Constants ───────────────────────────────────────────────────────

export const REALM_ORDER = [
  '初心',
  '鍛骨',
  '虛空',
  '本源',
  '寂滅',
  '無我',
  '破陣',
  '空鏡',
  '星潮',
  '玄鏈',
  '天望',
  '鋒刃',
  '化神',
  '返虛',
  '合道',
  '渡劫',
  '真仙',
  '二昇',
  '玄仙',
  '太乙',
  '大羅',
  '混元',
  '天尊',
  '三昇',
  '神王',
  '帝宙',
  '神人',
];

const REALM_TEACH_KEY: Record<string, number> = {
  初心: 1,
  鍛骨: 2,
  虛空: 3,
  無我: 4,
  破陣: 5,
  空鏡: 6,
  星潮: 7,
  玄鏈: 8,
  天望: 9,
  鋒刃: 10,
  化神: 11,
  返虛: 12,
  合道: 13,
  渡劫: 14,
  真仙: 15,
  二昇: 16,
  玄仙: 17,
  太乙: 18,
  大羅: 19,
  混元: 20,
  天尊: 21,
  三昇: 22,
  神王: 23,
  帝宙: 24,
  神人: 25,
};

// ── Tier helpers ────────────────────────────────────────────────────

export function getDifficultyTiers(): string[] {
  const levels = getAllLevels();
  const present = new Set(levels.filter((l) => !l.hidden).map((l) => l.difficultyName || t('levelGrid.unnamedRealm')));
  const ordered = REALM_ORDER.filter((name) => present.has(name));
  const extras = [...present].filter((name) => !REALM_ORDER.includes(name));
  return ordered.concat(extras);
}

export function getTierRepresentativeStar(tierName: string): number | null {
  if (Object.prototype.hasOwnProperty.call(REALM_TEACH_KEY, tierName)) return REALM_TEACH_KEY[tierName];
  const levels = getAllLevels();
  const lv = levels.find((l) => !l.hidden && l.difficultyName === tierName);
  return lv ? lv.stars : null;
}

export function getRealmUnlockState(): {
  tiers: string[];
  stats: { name: string; cleared: number; total: number; isCleared: boolean }[];
  unlockedTiers: Set<string>;
} {
  const levels = getAllLevels();
  const tiers = getDifficultyTiers();
  const records = readJson<Record<string, any>>(SK.RECORDS, {});
  const stats = tiers.map((name) => {
    const tierLevels = levels.filter((l) => l.difficultyName === name && !l.hidden);
    const cleared = tierLevels.filter((l) => records[l.id]).length;
    const total = tierLevels.length;
    const UNLOCK_THRESHOLD = 3;
    return { name, cleared, total, isCleared: total > 0 && cleared >= Math.min(UNLOCK_THRESHOLD, total) };
  });

  let highestConsecutiveCleared = -1;
  for (let i = 0; i < stats.length; i++) {
    if (stats[i].isCleared) highestConsecutiveCleared = i;
    else break;
  }
  const currentIndex = Math.min(highestConsecutiveCleared + 1, Math.max(0, stats.length - 1));
  const unlockedMaxIndex = Math.min(currentIndex + 1, Math.max(0, stats.length - 1));
  const unlockedTiers = new Set(stats.slice(0, unlockedMaxIndex + 1).map((s) => s.name));
  return { tiers, stats, unlockedTiers };
}

export function getTierUnlockMessage(tierName: string, unlockState?: ReturnType<typeof getRealmUnlockState>): string {
  const state = unlockState || getRealmUnlockState();
  if (state.unlockedTiers.has(tierName)) return '';
  const idx = state.tiers.indexOf(tierName);
  if (idx <= 0) return t('stage.unlockGeneric');
  const prev = state.stats[idx - 1];
  const needed = Math.min(3, prev.total);
  return t('stage.unlockRequired', { prev: prev.name, cleared: String(prev.cleared), needed: String(needed) });
}

export function canAccessLevel(level: LevelData | null | undefined, unlockState?: ReturnType<typeof getRealmUnlockState>): boolean {
  if (!level || level.hidden) return false;
  const state = unlockState || getRealmUnlockState();
  return state.unlockedTiers.has(level.difficultyName);
}

export function getFilteredLevels(): LevelData[] {
  return getAllLevels().filter((l) => l.difficultyName === gs.currentTab);
}
