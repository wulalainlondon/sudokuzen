export interface ClassicLevelRecord {
  time: number;
  stars: number;
  replayHistory?: unknown[];
  techKey?: string;
}

export interface SpeedLevelRecord {
  time: number;
  submissions: number;
  replayHistory?: unknown[];
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function toClassicLevelRecord(value: unknown): ClassicLevelRecord | null {
  if (typeof value === 'number') {
    const time = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return { time, stars: 1, replayHistory: [] };
  }
  const obj = asObject(value);
  if (!obj) return null;
  const rawTime = Number(obj.time);
  const rawStars = Number(obj.stars);
  const time = Number.isFinite(rawTime) ? Math.max(0, Math.floor(rawTime)) : 0;
  const stars = Number.isFinite(rawStars) ? Math.min(3, Math.max(1, Math.floor(rawStars))) : 1;
  const replayHistory = Array.isArray(obj.replayHistory) ? obj.replayHistory : [];
  const techKey = typeof obj.techKey === 'string' ? obj.techKey : undefined;
  return { time, stars, replayHistory, techKey };
}

export function toSpeedLevelRecord(value: unknown): SpeedLevelRecord | null {
  const obj = asObject(value);
  if (!obj) return null;
  const rawTime = Number(obj.time);
  const rawSubs = Number(obj.submissions);
  const time = Number.isFinite(rawTime) ? Math.max(0, Math.floor(rawTime)) : 0;
  const submissions = Number.isFinite(rawSubs) ? Math.max(1, Math.floor(rawSubs)) : 1;
  const replayHistory = Array.isArray(obj.replayHistory) ? obj.replayHistory : [];
  return { time, submissions, replayHistory };
}

export function getReplayHistory(value: unknown): unknown[] {
  const obj = asObject(value);
  return obj && Array.isArray(obj.replayHistory) ? obj.replayHistory : [];
}
