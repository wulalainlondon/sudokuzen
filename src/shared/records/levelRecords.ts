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

const VALID_REPLAY_TYPES = new Set(['fill', 'mistake', 'eliminate', 'quick_note', 'erase', 'note']);

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sanitizeNotes(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const digits = raw
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
    .map((n) => Math.floor(n));
  return digits.length ? digits : [];
}

function sanitizeReplayAction(raw: unknown): Record<string, unknown> | null {
  const obj = asObject(raw);
  if (!obj) return null;

  const t = Number(obj.t);
  const type = String(obj.type ?? '');
  const detail = String(obj.detail ?? '');
  const idxRaw = obj.idx;
  const valRaw = obj.val;
  const notesRaw = obj.notes;

  if (!Number.isFinite(t) || !VALID_REPLAY_TYPES.has(type) || detail.length === 0) return null;
  const idx =
    idxRaw === null || idxRaw === undefined
      ? null
      : Number.isFinite(Number(idxRaw))
        ? Math.floor(Number(idxRaw))
        : null;
  const val =
    valRaw === null || valRaw === undefined
      ? null
      : Number.isFinite(Number(valRaw))
        ? Math.floor(Number(valRaw))
        : null;
  const notes = notesRaw === null || notesRaw === undefined ? null : sanitizeNotes(notesRaw);
  if (notesRaw !== null && notesRaw !== undefined && notes === null) return null;

  return {
    t: Math.max(0, Math.floor(t)),
    type,
    detail,
    idx,
    val,
    notes,
  };
}

export function sanitizeReplayHistory(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of raw) {
    const normalized = sanitizeReplayAction(item);
    if (normalized) out.push(normalized);
  }
  return out;
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
  const replayHistory = sanitizeReplayHistory(obj.replayHistory);
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
  const replayHistory = sanitizeReplayHistory(obj.replayHistory);
  return { time, submissions, replayHistory };
}

export function getReplayHistory(value: unknown): unknown[] {
  const obj = asObject(value);
  return sanitizeReplayHistory(obj?.replayHistory);
}
