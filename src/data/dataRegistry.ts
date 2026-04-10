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
  s: number; // stars
  dn: string; // difficultyName
  dp: string; // displayName
  p: number[]; // puzzle
  sl: number[]; // solution
  mt: string; // maxTechnique
  tt: string; // techTier
  ds: number; // difficultyScore
  ls: boolean; // logicSolvable
  sr: number; // singleRatio
  src: string; // source
  // Duo-exclusive metadata
  gv?: number; // givens count
  cd?: number; // total candidates at start
  ac?: number; // avg candidates per empty cell
}

// ── Internal state ─────────────────────────────────────────────────

let _manifest: DataManifest | null = null;
let _manifestPromise: Promise<DataManifest | null> | null = null;
const _shardCache = new Map<string, LevelData[]>();

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
    givens: c.gv,
    candidates: c.cd,
    avgCandidatesPerCell: c.ac,
  };
}

// ── Manifest ───────────────────────────────────────────────────────

/** Fetch data manifest (cached). Call warmManifest() at app startup. */
export async function getDataManifest(): Promise<DataManifest | null> {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(resolveDataPath('manifest.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`data manifest ${r.status}`);
      return r.json() as Promise<DataManifest>;
    })
    .then((m) => {
      _manifest = m;
      return m;
    })
    .catch(() => {
      _manifestPromise = null;
      return null;
    });
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
    const expanded = compact.map((c) => expandLevel(c, mode));
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

  const worldShards = Object.keys(manifest.shards).filter((k) => k.startsWith('world-'));
  const results = await Promise.all(worldShards.map((name) => loadShard(name, 'world')));
  return results.flat();
}

/**
 * Get all levels across all modes (async).
 * Replaces the old synchronous getAllLevels().
 */
export async function getAllLevelsAsync(): Promise<LevelData[]> {
  const [normal, practice, world] = await Promise.all([getNormalLevels(), getPracticeLevels(), getAllWorldLevels()]);
  return [...normal, ...practice, ...world];
}

// ── Sync snapshot (cache-backed) ───────────────────────────────────

/**
 * Synchronous normal-level snapshot from shard cache.
 * Returns [] until `preloadMode('normal')` / `getNormalLevels()` resolves.
 */
export function getAllLevels(): LevelData[] {
  return _shardCache.get('normal') || [];
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

export function getTeachData(): Record<string, unknown> {
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
const _teachShardCache = new Map<string, unknown>();
const FETCH_TIMEOUT_MS = 6000;

function resolveTeachPath(file: string): string {
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new URL(`teach/${file}`, base).href;
  } catch {
    return `teach/${file}`;
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTeachManifest(): Promise<TeachManifest | null> {
  if (_teachManifest) return _teachManifest;
  if (_teachManifestPromise) return _teachManifestPromise;
  _teachManifestPromise = fetchJsonWithTimeout<TeachManifest>(resolveTeachPath('manifest.json'))
    .then((m) => {
      _teachManifest = m;
      return m;
    })
    .catch(() => {
      // Allow retry on next call after transient failures (offline, timeout, etc.).
      _teachManifestPromise = null;
      return null;
    });
  return _teachManifestPromise;
}

export async function getTeachShard(stars: string | number): Promise<unknown | null> {
  const key = String(stars);
  if (_teachShardCache.has(key)) return _teachShardCache.get(key);
  const manifest = await getTeachManifest();
  if (!manifest || !manifest.modules[key]) return null;
  try {
    const url = resolveTeachPath(`${key}.json`) + `?v=${manifest.version}`;
    const data = await fetchJsonWithTimeout<unknown>(url);
    _teachShardCache.set(key, data);
    return data;
  } catch {
    return null;
  }
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
