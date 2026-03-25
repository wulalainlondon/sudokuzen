export type LevelLite = { id: number; stars: number };

export function pickDailyIndex(seed: number, size: number): number {
  if (size <= 0) return 0;
  return seed % size;
}

export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
