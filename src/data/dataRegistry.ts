// Phase 1 — Clean data access layer
// Data files are loaded via <script> tags in index.html (levels.js, mid_pool.js, techniques.js).
// This module provides typed accessors so consumers never touch globals directly.
// When we later convert data files to ES modules, only this file changes.

import type { LevelData } from '../game/state';

/* global declarations matching the <script>-loaded variables */
declare const levels: LevelData[];
declare const midPool: LevelData[];
declare const TEACH_DATA: Record<string, any>;

let _merged: LevelData[] | null = null;

/** Raw main level array (920 levels). */
export function getLevels(): LevelData[] {
  return typeof levels !== 'undefined' ? levels : [];
}

/** Raw mid-pool array (practice puzzles). */
export function getMidPool(): LevelData[] {
  return typeof midPool !== 'undefined' ? midPool : [];
}

/** Teaching data keyed by stars/book number. */
export function getTeachData(): Record<string, any> {
  return typeof TEACH_DATA !== 'undefined' ? TEACH_DATA : {};
}

/**
 * Merged level array: main levels + mid-pool (marked hidden).
 * Computed once, cached thereafter.
 */
export function getAllLevels(): LevelData[] {
  if (_merged) return _merged;
  const main = getLevels();
  const mid = getMidPool().map(l => ({ ...l, hidden: true }) as LevelData);
  const existingIds = new Set(main.map(l => l.id));
  mid.forEach(l => {
    if (!existingIds.has(l.id)) main.push(l);
  });
  _merged = main;
  return _merged;
}
