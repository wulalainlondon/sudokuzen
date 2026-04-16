// Duo tier & mode definitions, independent puzzle pool (duo-T*.json shards)

import type { LevelData } from '../../game/state';
import { loadDuoShard } from '../../data/dataRegistry';

// ── Tier definitions ─────────────────────────────────────────────────

export interface DuoTier {
  id: string;
  label: string;
  /** Duo shard keys: 'T01', 'T02', etc. — loaded from duo-T*.json */
  shardKeys: string[];
  description: string;
}

export const DUO_TIERS: DuoTier[] = [
  { id: 'tier0', label: 'Tier 0', shardKeys: ['T00'], description: 'Naked / Hidden Single（入門）' },
  { id: 'tierI', label: 'Tier I', shardKeys: ['T01'], description: 'Naked / Hidden Single' },
  { id: 'tierII', label: 'Tier II', shardKeys: ['T02'], description: 'Locked Candidates, Pairs' },
  { id: 'tierIII', label: 'Tier III', shardKeys: ['T03', 'T04'], description: 'Triples, X-Wing, UR' },
  { id: 'tierIV', label: 'Tier IV', shardKeys: ['T05', 'T06'], description: 'Fish, Wing, Coloring' },
  {
    id: 'tierV',
    label: 'Tier V',
    shardKeys: ['T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
    description: 'AIC, ALS, Forcing, Exocet',
  },
];

export const DUO_TIER_MAP = new Map(DUO_TIERS.map((t) => [t.id, t]));

// ── Mode definitions ─────────────────────────────────────────────────

export interface DuoMode {
  id: string;
  label: string;
  rules: string;
  maxErrors: number;
  allowNotes: boolean;
  blindReview: boolean;
  isChessClock?: boolean;      // true = 象棋鐘模式，遊戲邏輯完全不同
  lockedToTierId?: string;     // 若有值，Lobby 強制鎖定到此 tier
  beta?: boolean;              // true = 顯示 BETA 標籤
}

export const DUO_MODES: DuoMode[] = [
  {
    id: 'standard',
    label: '標準',
    rules: '3 命，即時驗證，可筆記',
    maxErrors: 3,
    allowNotes: true,
    blindReview: false,
  },
  {
    id: 'noNotes',
    label: '無念',
    rules: '3 命，即時驗證，禁筆記',
    maxErrors: 3,
    allowNotes: false,
    blindReview: false,
  },
  {
    id: 'ironWall',
    label: '鐵壁',
    rules: '1 命，即時驗證，可筆記',
    maxErrors: 1,
    allowNotes: true,
    blindReview: false,
  },
  { id: 'blindReview', label: '盲審', rules: '全填才檢查，可筆記', maxErrors: 81, allowNotes: true, blindReview: true },
  {
    id: 'chessClock',
    label: '奪秒',
    rules: '輪流填格，各自計時，累積時間少者獲勝',
    maxErrors: 999,
    allowNotes: true,
    blindReview: false,
    isChessClock: true,
    lockedToTierId: 'tier0',
    beta: true,
  },
];

export const DUO_MODE_MAP = new Map(DUO_MODES.map((m) => [m.id, m]));

export type DuoTierId = (typeof DUO_TIERS)[number]['id'];
export type DuoModeId = (typeof DUO_MODES)[number]['id'];

// ── Puzzle pool cache ────────────────────────────────────────────────

const _tierPuzzleCache = new Map<string, LevelData[]>();

export async function loadDuoTierPuzzles(tierId: string): Promise<LevelData[]> {
  if (_tierPuzzleCache.has(tierId)) return _tierPuzzleCache.get(tierId)!;

  const tier = DUO_TIER_MAP.get(tierId);
  if (!tier) return [];

  const results = await Promise.all(tier.shardKeys.map((k) => loadDuoShard(k)));
  const pool = results.flat();
  if (pool.length) _tierPuzzleCache.set(tierId, pool);
  return pool;
}

// ── Deterministic puzzle pick ────────────────────────────────────────

export async function pickDuoPuzzle(tierId: string, seed: number): Promise<LevelData | null> {
  const pool = await loadDuoTierPuzzles(tierId);
  if (!pool.length) return null;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx];
}
