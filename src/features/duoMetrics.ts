// Duo metrics — Firebase ops tracking for debugging & analytics
// Extracted from duo.ts

const DUO_METRICS_KEY = 'sudoku_duo_metrics_v1';

export type DuoMetricKey =
  | 'lobbyFetches'
  | 'lobbyFetchHits'
  | 'lobbyFetchThrottled'
  | 'roomReadOps'
  | 'roomWriteOps'
  | 'snapshotEvents'
  | 'reconnects'
  | 'heartbeatWrites'
  | 'staleGuestReleases'
  | 'staleRoomCleanups';
export type DuoMetrics = Record<DuoMetricKey, number> & { lastUpdatedAtMs: number };

function loadDuoMetrics(): DuoMetrics {
  try {
    const raw = localStorage.getItem(DUO_METRICS_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<DuoMetrics>;
    return {
      lobbyFetches: Number(parsed.lobbyFetches || 0),
      lobbyFetchHits: Number(parsed.lobbyFetchHits || 0),
      lobbyFetchThrottled: Number(parsed.lobbyFetchThrottled || 0),
      roomReadOps: Number(parsed.roomReadOps || 0),
      roomWriteOps: Number(parsed.roomWriteOps || 0),
      snapshotEvents: Number(parsed.snapshotEvents || 0),
      reconnects: Number(parsed.reconnects || 0),
      heartbeatWrites: Number(parsed.heartbeatWrites || 0),
      staleGuestReleases: Number(parsed.staleGuestReleases || 0),
      staleRoomCleanups: Number(parsed.staleRoomCleanups || 0),
      lastUpdatedAtMs: Number(parsed.lastUpdatedAtMs || 0),
    };
  } catch {
    return {
      lobbyFetches: 0,
      lobbyFetchHits: 0,
      lobbyFetchThrottled: 0,
      roomReadOps: 0,
      roomWriteOps: 0,
      snapshotEvents: 0,
      reconnects: 0,
      heartbeatWrites: 0,
      staleGuestReleases: 0,
      staleRoomCleanups: 0,
      lastUpdatedAtMs: 0,
    };
  }
}

let _duoMetrics = loadDuoMetrics();

function saveDuoMetrics(): void {
  _duoMetrics.lastUpdatedAtMs = Date.now();
  localStorage.setItem(DUO_METRICS_KEY, JSON.stringify(_duoMetrics));
}

export function bumpDuoMetric(key: DuoMetricKey, amount = 1): void {
  _duoMetrics[key] = Number(_duoMetrics[key] || 0) + amount;
  saveDuoMetrics();
}

export function getDuoMetrics(): DuoMetrics {
  return { ..._duoMetrics };
}

export function resetDuoMetrics(): void {
  _duoMetrics = loadDuoMetrics();
  (Object.keys(_duoMetrics) as Array<keyof DuoMetrics>).forEach((k) => {
    (_duoMetrics[k] as number) = 0;
  });
  saveDuoMetrics();
}
