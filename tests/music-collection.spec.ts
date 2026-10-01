// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_APP_EDITION', 'pwa');
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());
const put = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
describe('music collection and retained history', () => {
  it('counts retained PWA matches once without changing any old records', async () => {
    put('sudoku_duo_profile_v2', { wins: 7, losses: 2, draws: 1, playCount: { a: 12 } });
    put('sudoku_duo_profile_v2_pwa', { wins: 2, playCount: { a: 2 }, legacyPlayCount: { a: 12 } });
    const before = { ...localStorage };
    const c = await import('../src/music/collection');
    for (let i = 0; i < 4; i++) expect(c.getMusicProgress()).toEqual({ matches: 14, wins: 9, worldLevel: 0 });
    expect({ ...localStorage }).toEqual(before);
    vi.resetModules();
    expect((await import('../src/music/collection')).getMusicProgress().matches).toBe(14);
  });
  it('keeps iOS results separate while honoring its previously imported match baseline', async () => {
    vi.stubEnv('VITE_APP_EDITION', 'ios');
    put('sudoku_duo_profile_v2', { wins: 99, playCount: { a: 99 } });
    put('sudoku_duo_profile_v2_ios', { wins: 2, playCount: { a: 3 }, legacyPlayCount: { a: 8 } });
    const c = await import('../src/music/collection');
    expect(c.getMusicProgress()).toEqual({ matches: 11, wins: 2, worldLevel: 0 });
    expect(c.selectMusic('wild', 'between-moves')).toBe(true);
    expect(localStorage.getItem('sudoku_music_collection_v1_ios')).not.toBeNull();
    expect(localStorage.getItem('sudoku_music_collection_v1_pwa')).toBeNull();
  });
  it('enforces every unlock boundary including world IQ and the first victory', async () => {
    const c = await import('../src/music/collection');
    const { MUSIC_TRACKS } = await import('../src/music/catalog');
    expect(c.unlockedMusicCount({ matches: 0, wins: 0, worldLevel: 1 })).toBe(3);
    for (const track of MUSIC_TRACKS) {
      if (track.unlock.kind === 'free') continue;
      const p = { matches: 0, wins: 0, worldLevel: 0 };
      p[track.unlock.kind] = track.unlock.count - 1;
      expect(c.isMusicUnlocked(track, p)).toBe(false);
      p[track.unlock.kind]++;
      expect(c.isMusicUnlocked(track, p)).toBe(true);
    }
    expect(c.unlockedMusicCount({ matches: 80, wins: 1, worldLevel: 5 })).toBe(12);
  });
  it('saves independent mode choices and favorites, rejects locked tracks, and falls back safely', async () => {
    const c = await import('../src/music/collection');
    expect(c.selectMusic('normal', 'pipa-battle')).toBe(false);
    expect(c.toggleMusicFavorite('pipa-battle')).toBe(false);
    put('sudoku_duo_profile_v2', { playCount: { a: 80 } });
    expect(c.selectMusic('duo', 'shamisen-battle')).toBe(true);
    expect(c.toggleMusicFavorite('shamisen-battle')).toBe(true);
    expect(c.getMusicCollection().favorites).toEqual(['shamisen-battle']);
    expect(c.selectedMusic('normal').id).toBe('nine-lights');
    expect(c.selectedMusic('duo').id).toBe('shamisen-battle');
    localStorage.removeItem('sudoku_duo_profile_v2');
    expect(c.selectedMusic('duo').id).toBe('first-moves');
    expect(c.getMusicCollection().selected.duo).toBe('shamisen-battle');
  });
  it('restores the newest cloud choices including removing a favorite', async () => {
    const c = await import('../src/music/collection');
    const old = { favorites: ['nine-lights'], updatedAt: 10 };
    const recent = { favorites: [], selected: { duo: 'between-moves' }, updatedAt: 20 };
    expect(c.mergeMusicCollections(old, recent)).toMatchObject(recent);
    expect(c.mergeMusicCollections(recent, old)).toMatchObject(recent);
    expect(
      c.normalizeMusicCollection({ favorites: ['bad', 'nine-lights', 'nine-lights'], selected: { normal: 'bad' } }),
    ).toMatchObject({ favorites: ['nine-lights'], selected: { normal: 'nine-lights' } });
  });
});
