// Static metadata for all 40 techniques — single source of truth for the ecology engine.

export type Rarity = 'common' | 'rare' | 'legendary' | 'mythic';

export interface TechniqueMeta {
  key: string;           // matches generated/*.json filename (without extension)
  name: string;          // Chinese display name
  subtitle: string;      // English name
  weight: number;        // difficulty weight (higher = rarer spawn)
  rarity: Rarity;
  cooldown: number;      // puzzles before re-encounter after escape
  expBase: number;       // base EXP for successful completion
  levelGate: number;     // min IQ level to unlock spawning
  autoCastGate: number;  // IQ level at which this technique auto-resolves (0 = never auto)
  tier: 0 | 1 | 2 | 3 | 4;  // spawn-weight tier for ecology engine
}

export const TECHNIQUE_TABLE: TechniqueMeta[] = [
  // ── Phase 1: 基礎心法 (Lv.1+) ──
  { key: 'naked_single',      name: '明眼',   subtitle: 'Naked Single',       weight: 1,  rarity: 'common',    cooldown: 0,  expBase: 5,   levelGate: 1,  autoCastGate: 5,  tier: 0 },
  { key: 'hidden_single',     name: '暗眼',   subtitle: 'Hidden Single',      weight: 1,  rarity: 'common',    cooldown: 0,  expBase: 5,   levelGate: 1,  autoCastGate: 8,  tier: 0 },
  { key: 'locked_candidates', name: '封鎖',   subtitle: 'Locked Candidates',  weight: 2,  rarity: 'common',    cooldown: 3,  expBase: 10,  levelGate: 1,  autoCastGate: 11, tier: 1 },
  { key: 'naked_pair',        name: '雙契',   subtitle: 'Naked Pair',         weight: 3,  rarity: 'common',    cooldown: 3,  expBase: 15,  levelGate: 11, autoCastGate: 21, tier: 1 },
  { key: 'hidden_pair',       name: '藏雙',   subtitle: 'Hidden Pair',        weight: 4,  rarity: 'common',    cooldown: 3,  expBase: 18,  levelGate: 11, autoCastGate: 21, tier: 1 },
  { key: 'naked_triple',      name: '編織',   subtitle: 'Naked Triple',       weight: 5,  rarity: 'common',    cooldown: 3,  expBase: 20,  levelGate: 11, autoCastGate: 21, tier: 1 },
  { key: 'hidden_triple',     name: '隱流',   subtitle: 'Hidden Triple',      weight: 6,  rarity: 'common',    cooldown: 3,  expBase: 22,  levelGate: 11, autoCastGate: 21, tier: 1 },

  // ── Phase 2: 中階劍法 (Lv.21+) ──
  { key: 'unique_rectangle',  name: '禁矩',   subtitle: 'Unique Rectangle',   weight: 7,  rarity: 'rare',      cooldown: 10, expBase: 35,  levelGate: 21, autoCastGate: 31, tier: 2 },
  { key: 'skyscraper',        name: '天望',   subtitle: 'Skyscraper',         weight: 7,  rarity: 'rare',      cooldown: 10, expBase: 35,  levelGate: 21, autoCastGate: 31, tier: 2 },
  { key: 'two_string_kite',   name: '雙弦',   subtitle: 'Two-String Kite',    weight: 11, rarity: 'rare',      cooldown: 10, expBase: 38,  levelGate: 21, autoCastGate: 31, tier: 2 },
  { key: 'empty_rectangle',   name: '虛空',   subtitle: 'Empty Rectangle',    weight: 12, rarity: 'rare',      cooldown: 10, expBase: 40,  levelGate: 21, autoCastGate: 31, tier: 2 },
  { key: 'x_wing',            name: '鋒刃',   subtitle: 'X-Wing',             weight: 8,  rarity: 'rare',      cooldown: 10, expBase: 50,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'finned_x_wing',     name: '裂鋒',   subtitle: 'Finned X-Wing',      weight: 9,  rarity: 'rare',      cooldown: 10, expBase: 55,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'xy_wing',           name: '翼擊',   subtitle: 'XY-Wing',            weight: 10, rarity: 'rare',      cooldown: 10, expBase: 45,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'xyz_wing',          name: '三翼',   subtitle: 'XYZ-Wing',           weight: 11, rarity: 'rare',      cooldown: 10, expBase: 48,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'w_wing',            name: '弦月',   subtitle: 'W-Wing',             weight: 11, rarity: 'rare',      cooldown: 10, expBase: 48,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'remote_pairs',      name: '遠偶',   subtitle: 'Remote Pairs',       weight: 12, rarity: 'rare',      cooldown: 10, expBase: 45,  levelGate: 31, autoCastGate: 41, tier: 2 },
  { key: 'bug_plus_one',      name: '孤蟲',   subtitle: 'BUG+1',              weight: 12, rarity: 'rare',      cooldown: 10, expBase: 45,  levelGate: 31, autoCastGate: 41, tier: 2 },

  // ── Phase 2b: 高階 (Lv.41+) ──
  { key: 'x_cycle_simple_coloring', name: '輪迴', subtitle: 'X-Cycle / Coloring', weight: 12, rarity: 'legendary', cooldown: 20, expBase: 60, levelGate: 41, autoCastGate: 61, tier: 3 },
  { key: 'swordfish',         name: '三叉',   subtitle: 'Swordfish',          weight: 12, rarity: 'legendary', cooldown: 20, expBase: 65,  levelGate: 41, autoCastGate: 61, tier: 3 },
  { key: 'finned_swordfish',  name: '裂叉',   subtitle: 'Finned Swordfish',   weight: 13, rarity: 'legendary', cooldown: 20, expBase: 70,  levelGate: 41, autoCastGate: 61, tier: 3 },
  { key: 'jellyfish',         name: '海獸',   subtitle: 'Jellyfish',          weight: 14, rarity: 'legendary', cooldown: 20, expBase: 80,  levelGate: 51, autoCastGate: 61, tier: 3 },
  { key: 'finned_jellyfish',  name: '裂獸',   subtitle: 'Finned Jellyfish',   weight: 16, rarity: 'legendary', cooldown: 20, expBase: 85,  levelGate: 51, autoCastGate: 61, tier: 3 },

  // ── Phase 3: 鏈術 (Lv.61+) ──
  { key: 'aic',                      name: '玄鏈',     subtitle: 'AIC',                  weight: 15, rarity: 'legendary', cooldown: 20, expBase: 90,  levelGate: 61, autoCastGate: 71, tier: 3 },
  { key: 'aic_mid_chain',            name: '玄鏈·中段', subtitle: 'AIC Mid-Chain',         weight: 16, rarity: 'legendary', cooldown: 20, expBase: 95,  levelGate: 61, autoCastGate: 71, tier: 3 },
  { key: 'aic_long_chain',           name: '玄鏈·長龍', subtitle: 'AIC Long-Chain',        weight: 18, rarity: 'mythic',    cooldown: 20, expBase: 110, levelGate: 61, autoCastGate: 71, tier: 3 },
  { key: 'grouped_aic_nice_loop',    name: '環鏈',     subtitle: 'Grouped AIC / Nice Loop', weight: 17, rarity: 'mythic', cooldown: 20, expBase: 100, levelGate: 61, autoCastGate: 71, tier: 3 },
  { key: 'discontinuous_nice_loop',  name: '斷環',     subtitle: 'Discontinuous Nice Loop', weight: 18, rarity: 'mythic', cooldown: 20, expBase: 105, levelGate: 61, autoCastGate: 71, tier: 3 },
  { key: 'xy_chain',                 name: '翼鏈',     subtitle: 'XY-Chain',              weight: 16, rarity: 'legendary', cooldown: 20, expBase: 90,  levelGate: 61, autoCastGate: 71, tier: 3 },

  // ── Phase 3b: 殘集與逼宮 (Lv.71+) ──
  { key: 'als_xz',                name: '殘集·交', subtitle: 'ALS-XZ',              weight: 19, rarity: 'mythic', cooldown: 20, expBase: 120, levelGate: 71, autoCastGate: 0, tier: 4 },
  { key: 'als_xy',                name: '殘集·合', subtitle: 'ALS-XY',              weight: 20, rarity: 'mythic', cooldown: 20, expBase: 130, levelGate: 71, autoCastGate: 0, tier: 4 },
  { key: 'als_w_wing',            name: '殘集·弦', subtitle: 'ALS-W-Wing',           weight: 20, rarity: 'mythic', cooldown: 20, expBase: 130, levelGate: 71, autoCastGate: 0, tier: 4 },
  { key: 'als_chain',             name: '殘集·鏈', subtitle: 'ALS-Chain',            weight: 20, rarity: 'mythic', cooldown: 20, expBase: 140, levelGate: 71, autoCastGate: 0, tier: 4 },
  { key: 'forcing_chain_net',     name: '逼宮',   subtitle: 'Forcing Chain Net',     weight: 21, rarity: 'mythic', cooldown: 20, expBase: 150, levelGate: 71, autoCastGate: 0, tier: 4 },
  { key: 'cell_forcing_chain',    name: '格逼',   subtitle: 'Cell Forcing Chain',    weight: 21, rarity: 'mythic', cooldown: 20, expBase: 150, levelGate: 71, autoCastGate: 0, tier: 3 },
  { key: 'region_forcing_chain',  name: '域逼',   subtitle: 'Region Forcing Chain',  weight: 21, rarity: 'mythic', cooldown: 20, expBase: 150, levelGate: 71, autoCastGate: 0, tier: 3 },

  // ── Phase 4: 終極 (Lv.80+) ──
  { key: 'sue_de_coq',            name: '虛合',   subtitle: 'Sue de Coq',           weight: 23, rarity: 'mythic', cooldown: 20, expBase: 170, levelGate: 80, autoCastGate: 0, tier: 4 },
  { key: 'template',              name: '刻印',   subtitle: 'Template',             weight: 22, rarity: 'mythic', cooldown: 20, expBase: 160, levelGate: 80, autoCastGate: 0, tier: 4 },
  { key: 'death_blossom',         name: '死綻',   subtitle: 'Death Blossom',        weight: 25, rarity: 'mythic', cooldown: 20, expBase: 200, levelGate: 80, autoCastGate: 0, tier: 4 },
  { key: 'exocet_death_blossom',  name: '天劫',   subtitle: 'Exocet',               weight: 26, rarity: 'mythic', cooldown: 20, expBase: 220, levelGate: 80, autoCastGate: 0, tier: 4 },
];

// Lookup by key
const _byKey = new Map<string, TechniqueMeta>();
for (const t of TECHNIQUE_TABLE) _byKey.set(t.key, t);

export function getTechniqueMeta(key: string): TechniqueMeta | undefined {
  return _byKey.get(key);
}

/** Get all technique keys that should auto-resolve at the given IQ level. */
export function getAutoCastKeys(iqLevel: number): Set<string> {
  const keys = new Set<string>();
  for (const t of TECHNIQUE_TABLE) {
    if (t.autoCastGate > 0 && iqLevel >= t.autoCastGate) {
      keys.add(t.key);
    }
  }
  return keys;
}

export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  legendary: 3,
  mythic: 5,
};
