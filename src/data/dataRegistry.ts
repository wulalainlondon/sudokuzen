// Data access layer — lazy-loading JSON shards.
// All level data is fetched on demand from public/data/*.json shards.
// Manifest (public/data/manifest.json) describes available shards.
// Only this module handles fetching; consumers import typed async accessors.

import type { LevelData, GameMode } from '../game/state';

// ── Types ──────────────────────────────────────────────────────────

interface ShardMeta {
  file: string;
  count: number;
  size: number;
}

interface DataManifest {
  version: string;
  totalLevels: number;
  shards: Record<string, ShardMeta>;
}

// Compact shard format (short keys to save bandwidth)
interface CompactLevel {
  id: number;
  s: number;       // stars
  dn: string;      // difficultyName
  dp: string;      // displayName
  p: number[];     // puzzle
  sl: number[];    // solution
  mt: string;      // maxTechnique
  tt: string;      // techTier
  ds: number;      // difficultyScore
  ls: boolean;     // logicSolvable
  sr: number;      // singleRatio
  src: string;     // source
}

// ── Internal state ─────────────────────────────────────────────────

let _manifest: DataManifest | null = null;
let _manifestPromise: Promise<DataManifest | null> | null = null;
const _shardCache = new Map<string, LevelData[]>();

// Legacy globals (backward compat — will be removed)
declare const levels: LevelData[] | undefined;
declare const midPool: LevelData[] | undefined;

// ── Helpers ────────────────────────────────────────────────────────

function resolveDataPath(file: string): string {
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new URL(`data/${file}`, base).href;
  } catch {
    return `data/${file}`;
  }
}

function expandLevel(c: CompactLevel, mode: GameMode): LevelData {
  return {
    id: c.id,
    stars: c.s,
    difficultyName: c.dn,
    displayName: c.dp,
    puzzle: c.p,
    solution: c.sl,
    maxTechnique: c.mt || undefined,
    techTier: c.tt || undefined,
    difficultyScore: c.ds,
    logicSolvable: c.ls,
    singleRatio: c.sr,
    mode,
    source: c.src || undefined,
  };
}

// ── Manifest ───────────────────────────────────────────────────────

/** Fetch data manifest (cached). Call warmManifest() at app startup. */
export async function getDataManifest(): Promise<DataManifest | null> {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(resolveDataPath('manifest.json'))
    .then(r => {
      if (!r.ok) throw new Error(`data manifest ${r.status}`);
      return r.json() as Promise<DataManifest>;
    })
    .then(m => { _manifest = m; return m; })
    .catch(() => null);
  return _manifestPromise;
}

/** Pre-fetch manifest on app startup. */
export function warmManifest(): void {
  getDataManifest();
}

// ── Shard loading ──────────────────────────────────────────────────

/** Fetch a single data shard by name (lazy, cached). */
async function loadShard(name: string, mode: GameMode): Promise<LevelData[]> {
  if (_shardCache.has(name)) return _shardCache.get(name)!;

  const manifest = await getDataManifest();
  if (!manifest || !manifest.shards[name]) return [];

  try {
    const meta = manifest.shards[name];
    const url = resolveDataPath(meta.file) + `?v=${manifest.version}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`shard ${name}: ${r.status}`);
    const compact: CompactLevel[] = await r.json();
    const expanded = compact.map(c => expandLevel(c, mode));
    _shardCache.set(name, expanded);
    return expanded;
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────

/** Get normal mode levels (async, cached). */
export async function getNormalLevels(): Promise<LevelData[]> {
  return loadShard('normal', 'normal');
}

/** Get practice mode levels (async, cached). */
export async function getPracticeLevels(): Promise<LevelData[]> {
  return loadShard('practice', 'practice');
}

/** Get world mode levels for a specific tier (async, cached). */
export async function getWorldTierLevels(tier: string): Promise<LevelData[]> {
  return loadShard(`world-${tier}`, 'world');
}

/** Get duo mode levels for a specific tier (async, cached). Independent pool. */
export async function loadDuoShard(tier: string): Promise<LevelData[]> {
  return loadShard(`duo-${tier}`, 'world');
}

/** Get ALL world mode levels (fetches all world shards). */
export async function getAllWorldLevels(): Promise<LevelData[]> {
  const manifest = await getDataManifest();
  if (!manifest) return [];

  const worldShards = Object.keys(manifest.shards).filter(k => k.startsWith('world-'));
  const results = await Promise.all(worldShards.map(name => loadShard(name, 'world')));
  return results.flat();
}

/**
 * Get all levels across all modes (async).
 * Replaces the old synchronous getAllLevels().
 */
export async function getAllLevelsAsync(): Promise<LevelData[]> {
  const [normal, practice, world] = await Promise.all([
    getNormalLevels(),
    getPracticeLevels(),
    getAllWorldLevels(),
  ]);
  return [...normal, ...practice, ...world];
}

// ── Legacy sync compat (for gradual migration) ────────────────────

let _legacyMerged: LevelData[] | null = null;

/**
 * Synchronous getAllLevels() — legacy compat.
 * Returns levels from script-tag globals (normal mode only).
 * ⚠️ Deprecated: migrate to getNormalLevels() / getAllLevelsAsync().
 */
export function getAllLevels(): LevelData[] {
  // Always prefer shard cache when available.
  // This avoids locking into an empty legacy fallback snapshot.
  if (_shardCache.has('normal')) {
    const normal = _shardCache.get('normal')!;
    _legacyMerged = normal;
    return normal;
  }
  if (_legacyMerged) return _legacyMerged;
  // Fall back to script-tag globals
  const main = typeof levels !== 'undefined' ? levels : [];
  const mid = typeof midPool !== 'undefined'
    ? midPool.map(l => ({ ...l, hidden: true }) as LevelData)
    : [];
  const existingIds = new Set(main.map(l => l.id));
  mid.forEach(l => { if (!existingIds.has(l.id)) main.push(l); });
  _legacyMerged = main;
  return _legacyMerged;
}

/**
 * Pre-load a mode's data into the shard cache.
 * Call after manifest is warm for instant sync access.
 */
export async function preloadMode(mode: GameMode): Promise<void> {
  if (mode === 'normal') await getNormalLevels();
  else if (mode === 'practice') await getPracticeLevels();
  else if (mode === 'world') await getAllWorldLevels();
}

// ── Teach data (unchanged) ─────────────────────────────────────────

declare const TEACH_DATA: Record<string, unknown>;

export function getTeachData(): Record<string, any> {
  return typeof TEACH_DATA !== 'undefined' ? TEACH_DATA : {};
}

export interface TeachModuleMeta {
  technique: string;
  name: string;
  subtitle: string;
  hasPractice: boolean;
  size: number;
}

export interface TeachManifest {
  version: string;
  totalModules: number;
  modules: Record<string, TeachModuleMeta>;
}

let _teachManifest: TeachManifest | null = null;
let _teachManifestPromise: Promise<TeachManifest | null> | null = null;
const _teachShardCache = new Map<string, any>();

function resolveTeachPath(file: string): string {
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new URL(`teach/${file}`, base).href;
  } catch {
    return `teach/${file}`;
  }
}

export async function getTeachManifest(): Promise<TeachManifest | null> {
  if (_teachManifest) return _teachManifest;
  if (_teachManifestPromise) return _teachManifestPromise;
  _teachManifestPromise = fetch(resolveTeachPath('manifest.json'))
    .then(r => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json() as Promise<TeachManifest>; })
    .then(m => { _teachManifest = m; return m; })
    .catch(() => null);
  return _teachManifestPromise;
}

export async function getTeachShard(stars: string | number): Promise<any | null> {
  const key = String(stars);
  if (_teachShardCache.has(key)) return _teachShardCache.get(key);
  const manifest = await getTeachManifest();
  if (!manifest || !manifest.modules[key]) return null;
  try {
    const url = resolveTeachPath(`${key}.json`) + `?v=${manifest.version}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`shard ${key}: ${r.status}`);
    const data = await r.json();
    _teachShardCache.set(key, data);
    return data;
  } catch { return null; }
}

export function warmTeachManifest(): void {
  getTeachManifest();
}

export function hasTeachModule(stars: string | number): boolean {
  const key = String(stars);
  if (_teachShardCache.has(key)) return true;
  if (_teachManifest?.modules[key]) return true;
  const td = getTeachData();
  return !!td[key];
}
