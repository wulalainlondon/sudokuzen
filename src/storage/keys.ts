// Phase 3 — Centralised localStorage key registry
// Every key the app reads/writes lives here. No more magic strings scattered across modules.

export const SK = {
  PLAYER_ID: 'sudoku_player_id',
  PLAYER_ALIAS: 'sudoku_player_alias',
  SPEEDRUN: 'sudoku_speedrun',
  THEME: 'sudoku_theme',
  LAST_LEVEL: 'sudoku_last_level',
  RECORDS: 'sudoku_records',
  SPEED_RECORDS: 'sudoku_speed_records',
  ACHIEVEMENTS: 'sudoku_achievements',
  TEACH_READ: 'sudoku_teach_read',
  PRACTICE_DONE: 'sudoku_practice_done',
  DUO_RECORDS: 'sudoku_duo_records',
  APP_VERSION: 'sudoku_app_version',
  STORAGE_VERSION: 'sudoku_storage_version',
  TOTAL_ELIMINATIONS: 'sudoku_total_eliminations',
  CLEAN_STREAK: 'sudoku_clean_streak',
  S_GRADE_COUNT: 'sudoku_s_grade_count',
  S_GRADE_STREAK: 'sudoku_s_grade_streak',
  REPLAY_WATCH_COUNT: 'sudoku_replay_watch_count',
  TECHNIQUES_USED: 'sudoku_techniques_used',
  SKILL_MODE: 'sudoku_skill_mode',
  WILD_PROFILE: 'sudoku_wild_profile',
  PRACTICE_RECORDS: 'sudoku_practice_records',
  PLAYER_TITLE: 'sudoku_player_title',
  WILD_SAVE: 'sudoku_wild_save',

  /** Returns the save-game key for a given level id. */
  save(levelId: number, speedrun: boolean): string {
    const prefix = speedrun ? 'sudoku_speed_save_' : 'sudoku_save_';
    return `${prefix}${levelId}`;
  },
} as const;

// ── Typed JSON helpers ──────────────────────────────────────────────

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
