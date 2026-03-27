// Data access layer — single entry point for all data globals.
// Data files are loaded via <script> tags (levels.js, mid_pool.js)
// or lazily fetched as JSON shards (teach data).
// Only this module touches globals; consumers import typed accessors.

import type { LevelData } from '../game/state';

// Ambient declarations for script-tag globals
declare const levels: LevelData[];
declare const midPool: LevelData[];
declare const TEACH_DATA: Record<string, unknown>;

let _merged: LevelData[] | null = null;

/** Raw main level array (920 levels). */
export function getLevels(): LevelData[] {
  return typeof levels !== 'undefined' ? levels : [];
}

/** Raw mid-pool array (practice puzzles). */
export function getMidPool(): LevelData[] {
  return typeof midPool !== 'undefined' ? midPool : [];
}

/** Teaching data keyed by stars/book number (synchronous — full blob). */
export function getTeachData(): Record<string, any> {
  return typeof TEACH_DATA !== 'undefined' ? TEACH_DATA : {};
}

// ── Teach lazy-load (Phase 3) ────────────────────────────────────

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

let _manifest: TeachManifest | null = null;
let _manifestPromise: Promise<TeachManifest | null> | null = null;
const _shardCache = new Map<string, any>();

function resolveTeachPath(file: string): string {
  try {
    // import.meta.env.BASE_URL is set by Vite at build time (e.g. '/sudokuzen/' for GitHub Pages)
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new URL(`teach/${file}`, base).href;
  } catch {
    return `teach/${file}`;
  }
}

/** Fetch teach manifest (cached). */
export async function getTeachManifest(): Promise<TeachManifest | null> {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(resolveTeachPath('manifest.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json() as Promise<TeachManifest>;
    })
    .then((m) => {
      _manifest = m;
      return m;
    })
    .catch(() => null);
  return _manifestPromise;
}

/** Fetch a single teach module by stars key (lazy, cached). */
export async function getTeachShard(stars: string | number): Promise<any | null> {
  const key = String(stars);
  if (_shardCache.has(key)) return _shardCache.get(key);

  // Verify manifest version to avoid stale shard/main mismatch
  const manifest = await getTeachManifest();
  if (!manifest || !manifest.modules[key]) return null;

  try {
    const url = resolveTeachPath(`${key}.json`) + `?v=${manifest.version}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`shard ${key}: ${r.status}`);
    const data = await r.json();
    _shardCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Pre-fetch manifest on app startup so sync checks work.
 * Call once from main.ts or legacyRuntime init.
 */
export function warmTeachManifest(): void {
  getTeachManifest();
}

/** Check if teach data exists for a given stars key (sync). */
export function hasTeachModule(stars: string | number): boolean {
  const key = String(stars);
  // Check shard cache
  if (_shardCache.has(key)) return true;
  // Check manifest (sync — available after warmTeachManifest resolves)
  if (_manifest?.modules[key]) return true;
  // Fall back to full blob (legacy compat)
  const td = getTeachData();
  return !!td[key];
}

/**
 * Merged level array: main levels + mid-pool (marked hidden).
 * Computed once, cached thereafter.
 */
export function getAllLevels(): LevelData[] {
  if (_merged) return _merged;
  const main = getLevels();
  const mid = getMidPool().map((l) => ({ ...l, hidden: true }) as LevelData);
  const existingIds = new Set(main.map((l) => l.id));
  mid.forEach((l) => {
    if (!existingIds.has(l.id)) main.push(l);
  });
  _merged = main;
  return _merged;
}
