import { ACTIVE_EDITION, TARGET_EDITION, type AppEdition } from './appEdition';
import { SK } from '../storage/keys';

const MIGRATION_KEY = 'sudoku_edition_migration_v1';
export const LEGACY_HISTORY_KEY = 'sudoku_legacy_history_v1';

export interface EditionMigration {
  version: 1;
  edition: AppEdition;
  sourcePlayerId: string | null;
  sourceProject: string;
  cloudImported: boolean;
  localPrepared: boolean;
}

export function readEditionMigration(): EditionMigration | null {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_KEY) || 'null') as EditionMigration | null;
  } catch {
    return null;
  }
}

export function prepareEditionMigration(): void {
  if (ACTIVE_EDITION === 'legacy' || typeof localStorage === 'undefined') return;
  const existing = readEditionMigration();
  if (existing?.edition === TARGET_EDITION && existing.localPrepared) return;
  if (existing && existing.edition !== TARGET_EDITION) throw new Error('Local profile belongs to a different edition');
  const parse = (key: string): Record<string, unknown> => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  // Keep all original keys, including replay payloads. New competitive counters
  // have edition-specific keys, so retaining history does not duplicate large
  // payloads or consume another copy of the device's localStorage quota.
  if (!localStorage.getItem(LEGACY_HISTORY_KEY)) {
    const archive = {
      version: 1,
      importedAt: Date.now(),
      sourceEdition: 'legacy',
      usesLegacyKeys: true,
    };
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(archive));
  }
  const oldProfile = parse('sudoku_duo_profile_v2');
  if (!localStorage.getItem(SK.DUO_PROFILE))
    localStorage.setItem(
      SK.DUO_PROFILE,
      JSON.stringify({
        playCount: {},
        wins: 0,
        losses: 0,
        draws: 0,
        currentStreak: 0,
        bestStreak: 0,
        rivals: {},
        legacyPlayCount: oldProfile.playCount ?? {},
      }),
    );
  localStorage.setItem(
    MIGRATION_KEY,
    JSON.stringify({
      version: 1,
      edition: TARGET_EDITION,
      sourcePlayerId: localStorage.getItem('sudoku_player_id'),
      sourceProject: 'sudokuzen-f2aa3',
      cloudImported: false,
      localPrepared: true,
    } satisfies EditionMigration),
  );
}

export function markLegacyCloudImported(): void {
  const migration = readEditionMigration();
  if (migration) localStorage.setItem(MIGRATION_KEY, JSON.stringify({ ...migration, cloudImported: true }));
}

export function getLegacyHistory(): Record<string, unknown> {
  try {
    const descriptor = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || '{}') as Record<string, unknown>;
    return {
      ...descriptor,
      duoProfile: JSON.parse(localStorage.getItem('sudoku_duo_profile_v2') || '{}'),
      duoRecords: JSON.parse(localStorage.getItem('sudoku_duo_records') || '{}'),
      duoPuzzleRecords: JSON.parse(localStorage.getItem('sudoku_duo_puzzle_records_v1') || '{}'),
    };
  } catch {
    return {};
  }
}
