import type { StorageMigration } from '../../entities/storage';

const VERSION_KEY = 'sudoku_storage_version';

function getVersion(): number {
  const raw = localStorage.getItem(VERSION_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function setVersion(version: number): void {
  localStorage.setItem(VERSION_KEY, String(version));
}

export function runStorageMigrations(migrations: StorageMigration[]): number {
  let currentVersion = getVersion();
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    if (!migration.canApply(currentVersion)) continue;
    migration.apply();
    currentVersion = migration.version;
    setVersion(currentVersion);
  }

  return currentVersion;
}

export function createTeachSelectionMigration(): StorageMigration {
  return {
    version: 1,
    canApply: (currentVersion) => currentVersion < 1,
    apply: () => {
      const legacy = localStorage.getItem('sudoku_teach_read');
      if (!legacy) return;
      localStorage.setItem('sudoku_teach_read_v2', legacy);
    },
  };
}
