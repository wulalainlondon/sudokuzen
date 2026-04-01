// Wild mode state — types + persistence.

import { SK, readJson, writeJson } from '../../storage/keys';
import { t } from '../../i18n/t';
import type { Rarity } from './techniqueMeta';

// ── Challenge Modes ──────────────────────────────────────────────────

export type ChallengeMode = 'standard' | 'ironman' | 'blind' | 'timed' | 'noNotes' | 'gauntlet';

export interface ChallengeModeConfig {
  mode: ChallengeMode;
  displayName: string;
  subtitle: string;
  description: string;
  expMultiplier: number;
  maxErrors: number; // 1 for ironman (first error = game over), 3 for standard, 81 for blind
  timerCountdown?: number; // base seconds for timed mode
  notesDisabled?: boolean;
  consecutiveCount?: number;
}

export const CHALLENGE_CONFIGS: Record<ChallengeMode, ChallengeModeConfig> = {
  standard: {
    mode: 'standard',
    displayName: t('challenge.standardName'),
    subtitle: 'Standard',
    description: t('challenge.standardDesc'),
    expMultiplier: 1.0,
    maxErrors: 3,
  },
  ironman: {
    mode: 'ironman',
    displayName: t('challenge.ironmanName'),
    subtitle: 'Iron Man',
    description: t('challenge.ironmanDesc'),
    expMultiplier: 1.5,
    maxErrors: 1,
  },
  blind: {
    mode: 'blind',
    displayName: t('challenge.blindName'),
    subtitle: 'Blind Judge',
    description: t('challenge.blindDesc'),
    expMultiplier: 1.3,
    maxErrors: 81,
  },
  timed: {
    mode: 'timed',
    displayName: t('challenge.timedName'),
    subtitle: 'Time Attack',
    description: t('challenge.timedDesc'),
    expMultiplier: 1.2,
    maxErrors: 3,
    timerCountdown: 300,
  },
  noNotes: {
    mode: 'noNotes',
    displayName: t('challenge.noNotesName'),
    subtitle: 'No Notes',
    description: t('challenge.noNotesDesc'),
    expMultiplier: 1.8,
    maxErrors: 3,
    notesDisabled: true,
  },
  gauntlet: {
    mode: 'gauntlet',
    displayName: t('challenge.gauntletName'),
    subtitle: 'Gauntlet',
    description: t('challenge.gauntletDesc'),
    expMultiplier: 3.0,
    maxErrors: 3,
    consecutiveCount: 5,
  },
};

// ── Session (修行輪) ────────────────────────────────────────────────

export interface WildSession {
  round: number; // 1-10, 0 = not in session
  wins: number; // wins this session
  totalExp: number; // accumulated EXP this session
  techniques: string[]; // technique keys encountered this session
}

export interface BestiaryEntry {
  discovered: string; // ISO date of first encounter
  encounters: number;
  kills: number; // successful completions
  escapes: number;
  bestTime: number | null;
  modesCleared: string[];  // challenge modes cleared for this technique, e.g. ['standard', 'blind']
}

export interface WildProfile {
  iqLevel: number;
  totalExp: number;
  puzzlesCompleted: number;
  totalEncounters: number;
  cooldowns: Record<string, number>; // technique key → puzzles remaining
  bestiary: Record<string, BestiaryEntry>;
  battlefieldMode: 'knight' | 'monk' | 'ascetic';
  autoCastEnabled: boolean; // true = mastered techniques auto-resolve; false = all manual
  currentSession: WildSession | null;
  fragments: Record<string, number>;   // technique key → fragment count collected
  studiedSkills: string[];             // technique keys that have been studied (teach read)
}

export interface WildEncounter {
  technique: string;
  rarity: Rarity;
  difficultyWeight: number;
  puzzle: number[];
  solution: number[];
  startedAt: number;
  challengeMode: ChallengeMode;
  mentorTime: number;  // 弈塵's estimated clear time in seconds (0 = T4, he can't solve)
}

const DEFAULT_PROFILE: WildProfile = {
  iqLevel: 1,
  totalExp: 0,
  puzzlesCompleted: 0,
  totalEncounters: 0,
  cooldowns: {},
  bestiary: {},
  battlefieldMode: 'knight',
  autoCastEnabled: true,
  currentSession: null,
  fragments: {},
  studiedSkills: [],
};

export function loadWildProfile(): WildProfile {
  const raw = readJson<Partial<WildProfile>>(SK.WILD_PROFILE, {});
  return { ...DEFAULT_PROFILE, ...raw };
}

export function saveWildProfile(profile: WildProfile): void {
  writeJson(SK.WILD_PROFILE, profile);
}

// ── Wild Save (pause/resume) ────────────────────────────────────────

export interface WildSaveData {
  encounter: WildEncounter;
  levelData: {
    id: number;
    displayName: string;
    puzzle: number[];
    solution: number[];
    maxTechnique: string;
  };
  cellsData: import('../../game/state').CellData[];
  seconds: number;
  errors: number;
  challengeMode: ChallengeMode;
  actionHistory: unknown[];
  savedAt: number; // timestamp
}

export function saveWildEncounter(data: WildSaveData): void {
  writeJson(SK.WILD_SAVE, data);
}

export function loadWildSave(): WildSaveData | null {
  const raw = readJson<WildSaveData | null>(SK.WILD_SAVE, null);
  if (!raw || !raw.encounter || !raw.levelData) return null;
  return raw;
}

export function clearWildSave(): void {
  localStorage.removeItem(SK.WILD_SAVE);
}
