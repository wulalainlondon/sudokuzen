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
  UNIT_ANALYSIS: 'sudoku_unit_analysis',
  STRONG_LINK_PANEL: 'sudoku_strong_link_panel',
  CHAIN_TRACE_PANEL: 'sudoku_chain_trace_panel',
  CHAIN_MAP_PANEL: 'sudoku_chain_map_panel',
  CTM_ENABLED: 'sudoku_ctm_enabled',
  CONSTRAINT_MAP_ENABLED: 'ctm_constraint_map',
  CONTINUOUS_FILL_VISIBLE: 'sudoku_continuous_fill_visible',
  ERASE_VISIBLE: 'sudoku_erase_visible',
  DUO_METRICS: 'sudoku_duo_metrics_v1',
  DUO_ACTIVE_ROOM_ID: 'sudoku_duo_active_room_id',
  PRACTICE_PHASE_TEACH_SEEN: 'sudoku_practice_phase_teach_seen_v1',
  LEARNING_LOOP_METRICS: 'sudoku_learning_loop_metrics_v1',
  SFX_ENABLED: 'sudoku_sfx_enabled',
  SFX_VOLUME: 'sudoku_sfx_volume',
  BGM_ENABLED: 'sudoku_bgm_enabled',
  BGM_VOLUME: 'sudoku_bgm_volume',

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[writeJson] localStorage quota exceeded for key "${key}"`, e);
  }
}
