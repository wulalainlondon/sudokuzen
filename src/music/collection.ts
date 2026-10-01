import { ACTIVE_EDITION } from '../platform/appEdition';
import { SK, readJson, writeJson } from '../storage/keys';
import { MUSIC_DEFAULTS, MUSIC_TRACKS, musicTrack, type MusicMode, type MusicTrack } from './catalog';

export interface MusicProgress {
  matches: number;
  wins: number;
  worldLevel: number;
}
export interface MusicCollection {
  favorites: string[];
  selected: Record<MusicMode, string>;
  updatedAt: number;
}
const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)) : 0;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const counts = (value: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(record(value)).map(([key, n]) => [key, count(n)]));

/** Read retained history without copying or rewriting any result counters. */
export function getMusicProgress(): MusicProgress {
  const current = record(readJson(SK.DUO_PROFILE, {}));
  const currentPlays = counts(current.playCount);
  const importedPlays = counts(current.legacyPlayCount);
  const legacy = ACTIVE_EDITION === 'pwa' ? record(readJson('sudoku_duo_profile_v2', {})) : {};
  const legacyPlays = counts(legacy.playCount);
  let matches = Object.values(currentPlays).reduce((sum, n) => sum + n, 0);
  for (const key of new Set([...Object.keys(importedPlays), ...Object.keys(legacyPlays)])) {
    matches += Math.max(importedPlays[key] || 0, legacyPlays[key] || 0);
  }
  const wins = count(current.wins) + count(legacy.wins);
  matches = Math.max(
    matches,
    wins + count(current.losses) + count(current.draws) + count(legacy.losses) + count(legacy.draws),
  );
  return { matches, wins, worldLevel: count(record(readJson(SK.WILD_PROFILE, {})).iqLevel) };
}
export function isMusicUnlocked(track: MusicTrack, progress = getMusicProgress()): boolean {
  return track.unlock.kind === 'free' || progress[track.unlock.kind] >= track.unlock.count;
}
export function normalizeMusicCollection(value: unknown): MusicCollection {
  const raw = record(value);
  const selected = record(raw.selected);
  return {
    favorites: Array.isArray(raw.favorites)
      ? [...new Set(raw.favorites.filter((id): id is string => typeof id === 'string' && !!musicTrack(id)))]
      : [],
    selected: Object.fromEntries(
      (Object.keys(MUSIC_DEFAULTS) as MusicMode[]).map((mode) => [
        mode,
        typeof selected[mode] === 'string' && musicTrack(selected[mode] as string)
          ? selected[mode]
          : MUSIC_DEFAULTS[mode],
      ]),
    ) as Record<MusicMode, string>,
    updatedAt: count(raw.updatedAt),
  };
}
export function getMusicCollection(): MusicCollection {
  return normalizeMusicCollection(readJson(SK.MUSIC_COLLECTION, {}));
}
export function mergeMusicCollections(local: unknown, remote: unknown): MusicCollection {
  const a = normalizeMusicCollection(local);
  const b = normalizeMusicCollection(remote);
  return b.updatedAt > a.updatedAt ? b : a;
}
function save(collection: MusicCollection): void {
  writeJson(SK.MUSIC_COLLECTION, { ...collection, updatedAt: Date.now() });
  window.dispatchEvent(new Event('sudoku:music-changed'));
}
export function selectedMusic(mode: MusicMode, progress = getMusicProgress()): MusicTrack {
  const track = musicTrack(getMusicCollection().selected[mode]);
  return track && isMusicUnlocked(track, progress) ? track : musicTrack(MUSIC_DEFAULTS[mode])!;
}
export function selectMusic(mode: MusicMode, id: string): boolean {
  const track = musicTrack(id);
  if (!track || !isMusicUnlocked(track)) return false;
  const collection = getMusicCollection();
  collection.selected[mode] = id;
  save(collection);
  return true;
}
export function toggleMusicFavorite(id: string): boolean {
  const track = musicTrack(id);
  if (!track || !isMusicUnlocked(track)) return false;
  const collection = getMusicCollection();
  collection.favorites = collection.favorites.includes(id)
    ? collection.favorites.filter((favorite) => favorite !== id)
    : [...collection.favorites, id];
  save(collection);
  return true;
}
export function musicUnlockText(track: MusicTrack, progress = getMusicProgress()): string {
  const rule = track.unlock;
  if (rule.kind === 'free') return '初始樂曲';
  if (rule.kind === 'worldLevel') return `世界 IQ ${rule.count} 解鎖 · 目前 IQ ${progress.worldLevel || 1}`;
  if (rule.kind === 'wins') return `首次對戰勝利解鎖 · ${Math.min(progress.wins, rule.count)} / ${rule.count}`;
  return `完成對戰 ${rule.count} 場解鎖 · ${Math.min(progress.matches, rule.count)} / ${rule.count}`;
}
export function unlockedMusicCount(progress = getMusicProgress()): number {
  return MUSIC_TRACKS.filter((track) => isMusicUnlocked(track, progress)).length;
}
