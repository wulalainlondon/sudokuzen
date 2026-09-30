import { ACTIVE_EDITION } from './appEdition';
import { SK, readJson } from '../storage/keys';
import { toClassicLevelRecord } from '../shared/records/levelRecords';

/** Read old and new bests without duplicating replay payloads in localStorage. */
export function readContinuingRecords(key: string): Record<string, unknown> {
  const map = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const current = map(readJson(key, {}));
  if (ACTIVE_EDITION !== 'pwa' || key !== SK.DUO_PUZZLE_RECORDS) return current;
  const legacy = map(readJson('sudoku_duo_puzzle_records_v1', {}));
  const records = { ...legacy, ...current };
  for (const [id, value] of Object.entries(legacy)) {
    const old = toClassicLevelRecord(value);
    const next = toClassicLevelRecord(current[id]);
    if (
      old &&
      (!next ||
        old.stars > next.stars ||
        (old.stars === next.stars &&
          (old.time < next.time ||
            (old.time === next.time && !!old.replayHistory?.length && !next.replayHistory?.length))))
    ) {
      records[id] = value;
    }
  }
  return records;
}
