// Duo tier & mode definitions, puzzle loading via world shards

import type { LevelData } from '../../game/state';
import { getWorldTierLevels } from '../../data/dataRegistry';

// ── Tier definitions ─────────────────────────────────────────────────

export interface DuoTier {
  id: string;
  label: string;
  worldTiers: string[];
  description: string;
}

export const DUO_TIERS: DuoTier[] = [
  { id: 'tierI',   label: 'Tier I',   worldTiers: ['T01'],                         description: 'Naked / Hidden Single' },
  { id: 'tierII',  label: 'Tier II',  worldTiers: ['T02'],                         description: 'Locked Candidates, Pairs' },
  { id: 'tierIII', label: 'Tier III', worldTiers: ['T03', 'T04'],                  description: 'Triples, X-Wing, UR' },
  { id: 'tierIV',  label: 'Tier IV',  worldTiers: ['T05', 'T06'],                  description: 'Fish, Wing, Coloring' },
  { id: 'tierV',   label: 'Tier V',   worldTiers: ['T07', 'T08', 'T09', 'T10', 'T11', 'T12'], description: 'AIC, ALS, Forcing, Exocet' },
];

export const DUO_TIER_MAP = new Map(DUO_TIERS.map(t => [t.id, t]));

// ── Mode definitions ─────────────────────────────────────────────────

export interface DuoMode {
  id: string;
  label: string;
  rules: string;
  maxErrors: number;
  allowNotes: boolean;
  blindReview: boolean;
}

export const DUO_MODES: DuoMode[] = [
  { id: 'standard',    label: '標準',   rules: '3 命，即時驗證，可筆記', maxErrors: 3, allowNotes: true,  blindReview: false },
  { id: 'noNotes',     label: '無念',   rules: '3 命，即時驗證，禁筆記', maxErrors: 3, allowNotes: false, blindReview: false },
  { id: 'ironWall',    label: '鐵壁',   rules: '1 命，即時驗證，可筆記', maxErrors: 1, allowNotes: true,  blindReview: false },
  { id: 'blindReview', label: '盲審',   rules: '全填才檢查，可筆記',     maxErrors: 81, allowNotes: true,  blindReview: true },
];

export const DUO_MODE_MAP = new Map(DUO_MODES.map(m => [m.id, m]));

export type DuoTierId = typeof DUO_TIERS[number]['id'];
export type DuoModeId = typeof DUO_MODES[number]['id'];

// ── Puzzle pool cache ────────────────────────────────────────────────

const _tierPuzzleCache = new Map<string, LevelData[]>();

export async function loadDuoTierPuzzles(tierId: string): Promise<LevelData[]> {
  if (_tierPuzzleCache.has(tierId)) return _tierPuzzleCache.get(tierId)!;

  const tier = DUO_TIER_MAP.get(tierId);
  if (!tier) return [];

  const results = await Promise.all(tier.worldTiers.map(wt => getWorldTierLevels(wt)));
  const pool = results.flat();
  _tierPuzzleCache.set(tierId, pool);
  return pool;
}

// ── Deterministic puzzle pick ────────────────────────────────────────

export async function pickDuoPuzzle(tierId: string, seed: number): Promise<LevelData | null> {
  const pool = await loadDuoTierPuzzles(tierId);
  if (!pool.length) return null;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx];
}
