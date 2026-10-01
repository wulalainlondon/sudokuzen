import generated from './tracks.generated.json';

export type MusicMode = 'normal' | 'wild' | 'duo';
export type MusicUnlock = { kind: 'free' } | { kind: 'matches' | 'wins' | 'worldLevel'; count: number };
export interface MusicTrack {
  id: string;
  title: string;
  description: string;
  bpm: number;
  file: string;
  duration: number;
  frames: number;
  loopOverlap: number;
  unlock: MusicUnlock;
}
export const MUSIC_DEFAULTS: Record<MusicMode, string> = {
  normal: 'nine-lights',
  wild: 'between-moves',
  duo: 'first-moves',
};
const details: Record<string, { description: string; unlock: MusicUnlock }> = {
  'nine-lights': { description: '柔和鋼琴 · 安靜專注', unlock: { kind: 'free' } },
  'between-moves': { description: '木琴與撥弦 · 探索推敲', unlock: { kind: 'free' } },
  'star-mist': { description: '古箏與竹笛 · 空靈慢行', unlock: { kind: 'worldLevel', count: 5 } },
  'first-moves': { description: '撥弦與單簧管 · 機敏交鋒', unlock: { kind: 'free' } },
  'hidden-lines': { description: '鋼琴與低弦 · 沉靜懸念', unlock: { kind: 'matches', count: 3 } },
  'turning-board': { description: '吉他與豎琴 · 明亮逆轉', unlock: { kind: 'wins', count: 1 } },
  'star-meeting': { description: '顫音琴與暖爵士 · 輕鬆切磋', unlock: { kind: 'matches', count: 5 } },
  'step-pressure': { description: '木琴與切分碎拍 · 步步緊逼', unlock: { kind: 'matches', count: 10 } },
  'sigil-duel': { description: '古箏、竹笛與手鼓 · 術式交鋒', unlock: { kind: 'matches', count: 20 } },
  'nine-combo': { description: '遊戲音色與顫音琴 · 連擊感', unlock: { kind: 'matches', count: 30 } },
  'pipa-battle': { description: '琵琶風、低弦與戰鼓 · 破陣輪指', unlock: { kind: 'matches', count: 50 } },
  'shamisen-battle': { description: '三味線風與太鼓 · 疾風交鋒', unlock: { kind: 'matches', count: 80 } },
};
export const MUSIC_TRACKS: MusicTrack[] = generated.map((track) => ({ ...track, ...details[track.id] }));
export function musicTrack(id: string): MusicTrack | undefined {
  return MUSIC_TRACKS.find((track) => track.id === id);
}
