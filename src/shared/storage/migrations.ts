import type { StorageMigration } from '../../entities/storage';

const VERSION_KEY = 'sudoku_storage_version';
const SAVE_KEY_PATTERN = /^sudoku_(speed_)?save_(\d+)$/;

function clampDigit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const d = Math.round(n);
  if (d < 0 || d > 9) return 0;
  return d;
}

function normalizeNotes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const x of raw) {
    const d = clampDigit(x);
    if (d >= 1 && d <= 9) set.add(d);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function normalizeBoolString(raw: string | null): string | null {
  if (raw === null) return null;
  const norm = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(norm)) return 'true';
  if (['false', '0', 'no', 'off'].includes(norm)) return 'false';
  return null;
}

function normalizeSavePayload(raw: any, levelIdFromKey: number): any | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.cellsData)) return null;

  const cellsData = raw.cellsData.slice(0, 81).map((cell: any) => {
    const value = clampDigit(cell?.value);
    return {
      value,
      fixed: Boolean(cell?.fixed),
      notes: value === 0 ? normalizeNotes(cell?.notes) : [],
      isError: false,
    };
  });
  if (cellsData.length !== 81) return null;

  const sec = Number(raw.seconds);
  const err = Number(raw.errors);
  const sub = Number(raw.submissionCount);
  const levelId = Number(raw.levelId);

  return {
    levelId: Number.isFinite(levelId) ? Math.max(1, Math.floor(levelId)) : levelIdFromKey,
    cellsData,
    seconds: Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0,
    errors: Number.isFinite(err) ? Math.max(0, Math.floor(err)) : 0,
    submissionCount: Number.isFinite(sub) ? Math.max(0, Math.floor(sub)) : 0,
    actionHistory: Array.isArray(raw.actionHistory) ? raw.actionHistory : [],
    isGhostMode: raw.isGhostMode === true,
    ghostHistory: raw.isGhostMode === true && Array.isArray(raw.ghostHistory) ? raw.ghostHistory : null,
  };
}

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

export function createLegacySaveSanitizationMigration(): StorageMigration {
  return {
    version: 2,
    canApply: (currentVersion) => currentVersion < 2,
    apply: () => {
      const keys = Object.keys(localStorage);

      for (const key of keys) {
        const match = key.match(SAVE_KEY_PATTERN);
        if (!match) continue;
        const levelId = Number(match[2]);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const normalized = normalizeSavePayload(parsed, Number.isFinite(levelId) ? levelId : 1);
          if (!normalized) {
            localStorage.removeItem(key);
            continue;
          }
          localStorage.setItem(key, JSON.stringify(normalized));
        } catch {
          localStorage.removeItem(key);
        }
      }

      for (const boolKey of ['sudoku_speedrun', 'sudoku_skill_mode']) {
        const raw = localStorage.getItem(boolKey);
        const normalized = normalizeBoolString(raw);
        if (normalized !== null) localStorage.setItem(boolKey, normalized);
      }
    },
  };
}
