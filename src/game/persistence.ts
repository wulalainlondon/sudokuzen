// Game save/load/clear — extracted from core.ts

import { gs, type ActionRecord } from './state';
import { SK, readJson, writeJson } from '../storage/keys';
import { getSaveKeyForCurrentMode, getRecordsStorageKeyForLevelList, getModePolicy } from './modePolicy';
import { toClassicLevelRecord, toSpeedLevelRecord } from '../shared/records/levelRecords';

export interface SavedGameState {
  levelId: number;
  cellsData: import('./state').CellData[];
  seconds: number;
  errors: number;
  submissionCount: number;
  actionHistory: ActionRecord[];
  isGhostMode: boolean;
  ghostHistory: ActionRecord[] | null;
}

export function saveGameStatus(): void {
  if (!gs.currentLevel) return;
  // Wild mode puzzles save to dedicated wild save key (pause/resume)
  if (gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild') {
    import('../features/wild/wildController').then(m => m.saveCurrentEncounter()).catch(() => {});
    return;
  }
  const saveKey = getSaveKeyForCurrentMode(gs.currentLevel.id);
  const data = {
    levelId: gs.currentLevel.id,
    cellsData: gs.cellsData,
    seconds: gs.seconds,
    errors: gs.errors,
    submissionCount: gs.submissionCount,
    actionHistory: gs.actionHistory,
    isGhostMode: gs.isGhostMode,
    ghostHistory: gs.isGhostMode ? gs.ghostHistory : null,
  };
  try {
    localStorage.setItem(saveKey, JSON.stringify(data));
    localStorage.setItem(SK.LAST_LEVEL, String(gs.currentLevel.id));
  } catch (e) {
    console.warn('saveGameStatus: localStorage quota exceeded, skipping save', e);
  }
}

export function loadGameStatus(levelId: number): SavedGameState | null {
  const saved = localStorage.getItem(getSaveKeyForCurrentMode(levelId));
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function clearGameStatus(levelId: number): void {
  const saveKey = getSaveKeyForCurrentMode(levelId);
  localStorage.removeItem(saveKey);
}

export function saveProgress(): number {
  const recordsKey = getRecordsStorageKeyForLevelList(false);
  if (getModePolicy().useSubmissionValidation) {
    const records = readJson<Record<string, unknown>>(recordsKey, {});
    const existing = records[gs.currentLevel!.id];
    const existingRec = toSpeedLevelRecord(existing);
    const currentSubs = gs.submissionCount + 1;
    const shouldUpdate =
      !existing ||
      currentSubs < (existingRec?.submissions ?? Infinity) ||
      (currentSubs === (existingRec?.submissions ?? Infinity) && gs.seconds < (existingRec?.time ?? Infinity));
    if (shouldUpdate) {
      records[gs.currentLevel!.id] = { time: gs.seconds, submissions: currentSubs, replayHistory: gs.actionHistory };
      writeJson(recordsKey, records);
    }
    return currentSubs;
  } else {
    const records = readJson<Record<string, unknown>>(recordsKey, {});
    const existing = records[gs.currentLevel!.id];
    const existingRec = toClassicLevelRecord(existing);
    const earnedStars = Math.max(1, 3 - gs.errors);
    const shouldUpdate =
      !existing ||
      earnedStars > (existingRec?.stars ?? 1) ||
      (earnedStars === (existingRec?.stars ?? 1) && gs.seconds < (existingRec?.time ?? Infinity));
    if (shouldUpdate) {
      records[gs.currentLevel!.id] = { time: gs.seconds, stars: earnedStars, replayHistory: gs.actionHistory };
      writeJson(recordsKey, records);
    }
    return earnedStars;
  }
}
