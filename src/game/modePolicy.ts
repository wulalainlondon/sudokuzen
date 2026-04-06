import type { LevelData } from './state';
import { gs } from './state';
import { SK } from '../storage/keys';

export type PlayMode = 'normal' | 'speedrun' | 'practice' | 'duo' | 'wild';

export interface ModePolicy {
  mode: PlayMode;
  allowNotes: boolean;
  useSubmissionValidation: boolean;
  useCountupTimer: boolean;
  useCountdownTimer: boolean;
  blockByMaxErrors: boolean;
  showUndo: boolean;
}

export function isWildLevel(level: LevelData | null | undefined): boolean {
  return !!(level && level.id < 0 && level.source === 'wild');
}

export function resolvePlayMode(level: LevelData | null | undefined = gs.currentLevel): PlayMode {
  if (gs.isDuoMode) return 'duo';
  if (level?.mode === 'practice') return 'practice';
  if (isWildLevel(level)) return 'wild';
  if (gs.isSpeedrunMode) return 'speedrun';
  return 'normal';
}

export function getModePolicy(level: LevelData | null | undefined = gs.currentLevel): ModePolicy {
  const mode = resolvePlayMode(level);
  const isWildTimed = mode === 'wild' && gs.wildChallengeMode === 'timed';
  const isDuo = mode === 'duo';
  const isSpeedrun = mode === 'speedrun';

  return {
    mode,
    allowNotes: !gs.wildNotesDisabled,
    useSubmissionValidation: isSpeedrun,
    useCountupTimer: !isWildTimed,
    useCountdownTimer: isWildTimed,
    blockByMaxErrors: !isDuo,
    showUndo: mode === 'practice',
  };
}

export function canInputByErrorGate(): boolean {
  const policy = getModePolicy();
  if (!policy.blockByMaxErrors) return true;
  return gs.errors < gs.maxErrors;
}

export function getSaveKeyForCurrentMode(levelId: number): string {
  const mode = resolvePlayMode();
  const speedrunLike = mode === 'speedrun';
  return SK.save(levelId, speedrunLike);
}

export function getRecordsStorageKeyForLevelList(isPractice: boolean): string {
  if (isPractice) return SK.PRACTICE_RECORDS;
  const mode = resolvePlayMode();
  return mode === 'speedrun' ? SK.SPEED_RECORDS : SK.RECORDS;
}
