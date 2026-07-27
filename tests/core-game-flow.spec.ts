// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SK, readJson } from '../src/storage/keys';
import { gs } from '../src/game/state';
import { saveGameStatus, loadGameStatus, clearGameStatus, saveProgress } from '../src/game/core';
import { toClassicLevelRecord, toSpeedLevelRecord } from '../src/shared/records/levelRecords';

// Minimal level data for testing
function makeLevelData(id = 1) {
  return {
    id,
    stars: 1,
    difficultyName: 'Easy',
    displayName: 'Level 1',
    puzzle: Array(81).fill(0),
    solution: Array(81)
      .fill(0)
      .map((_, i) => (i % 9) + 1),
    mode: 'normal' as const,
  };
}

describe('saveGameStatus / loadGameStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    gs.isSpeedrunMode = false;
    gs.isDuoMode = false;
    gs.currentLevel = makeLevelData(42);
    gs.cellsData = gs.currentLevel.puzzle.map((val: number) => ({
      value: val,
      fixed: val !== 0,
      notes: [],
      isError: false,
    }));
    gs.seconds = 100;
    gs.errors = 1;
    gs.submissionCount = 0;
    gs.actionHistory = [];
    gs.isGhostMode = false;
    gs.ghostHistory = [];
  });

  it('writes to localStorage with correct key', () => {
    saveGameStatus();
    const key = SK.save(42, false);
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw!);
    expect(data.levelId).toBe(42);
    expect(data.seconds).toBe(100);
    expect(data.errors).toBe(1);
  });

  it('reads back what was saved', () => {
    saveGameStatus();
    const loaded = loadGameStatus(42);
    expect(loaded).not.toBeNull();
    expect(loaded!.levelId).toBe(42);
    expect(loaded!.seconds).toBe(100);
  });

  it('returns null for non-existent saves', () => {
    const loaded = loadGameStatus(9999);
    expect(loaded).toBeNull();
  });

  it('handles corrupted JSON gracefully (returns null)', () => {
    const key = SK.save(42, false);
    localStorage.setItem(key, '{invalid json!!!');
    const loaded = loadGameStatus(42);
    expect(loaded).toBeNull();
  });

  it('does not save for wild mode levels (id < 0)', () => {
    gs.currentLevel = { ...makeLevelData(-1), source: 'wild' };
    saveGameStatus();
    const key = SK.save(-1, false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('saves last level to SK.LAST_LEVEL', () => {
    saveGameStatus();
    expect(localStorage.getItem(SK.LAST_LEVEL)).toBe('42');
  });

  it('does not pollute the single-player save while playing Duo', () => {
    gs.isDuoMode = true;
    saveGameStatus();
    expect(localStorage.getItem(SK.save(42, false))).toBeNull();
    expect(localStorage.getItem(SK.LAST_LEVEL)).toBeNull();
  });
});

describe('clearGameStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    gs.isSpeedrunMode = false;
    gs.isDuoMode = false;
    gs.currentLevel = makeLevelData(42);
    gs.seconds = 100;
    gs.errors = 0;
    gs.submissionCount = 0;
    gs.actionHistory = [];
    gs.cellsData = [];
    gs.isGhostMode = false;
    gs.ghostHistory = [];
  });

  it('removes the save key', () => {
    saveGameStatus();
    const key = SK.save(42, false);
    expect(localStorage.getItem(key)).toBeTruthy();

    clearGameStatus(42);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe('saveProgress', () => {
  beforeEach(() => {
    localStorage.clear();
    gs.isSpeedrunMode = false;
    gs.currentLevel = makeLevelData(10);
    gs.seconds = 200;
    gs.errors = 0;
    gs.submissionCount = 0;
    gs.actionHistory = [];
  });

  it('0 errors = 3 stars in normal mode', () => {
    gs.errors = 0;
    const stars = saveProgress();
    expect(stars).toBe(3);
    const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(toClassicLevelRecord(records[10])?.stars).toBe(3);
  });

  it('1 error = 2 stars', () => {
    gs.errors = 1;
    const stars = saveProgress();
    expect(stars).toBe(2);
    const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(toClassicLevelRecord(records[10])?.stars).toBe(2);
  });

  it('2 errors = 1 star', () => {
    gs.errors = 2;
    const stars = saveProgress();
    expect(stars).toBe(1);
  });

  it('writes to SK.SPEED_RECORDS when speedrun mode', () => {
    gs.isSpeedrunMode = true;
    gs.submissionCount = 0;
    const subs = saveProgress();
    expect(subs).toBe(1); // submissionCount + 1
    const speedRecords = readJson<Record<string, unknown>>(SK.SPEED_RECORDS, {});
    expect(speedRecords[10]).toBeDefined();
    expect(toSpeedLevelRecord(speedRecords[10])?.time).toBe(200);
  });

  it('only updates if new record is better (higher stars)', () => {
    // First save: 1 error = 2 stars
    gs.errors = 1;
    saveProgress();

    // Second save: 0 errors = 3 stars — should update
    gs.errors = 0;
    gs.seconds = 300;
    saveProgress();
    const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(toClassicLevelRecord(records[10])?.stars).toBe(3);
  });

  it('only updates if same stars + faster time', () => {
    // First save: 0 errors, 300 seconds
    gs.errors = 0;
    gs.seconds = 300;
    saveProgress();

    // Second save: same stars, slower time — should NOT update
    gs.seconds = 400;
    saveProgress();
    let records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(toClassicLevelRecord(records[10])?.time).toBe(300);

    // Third save: same stars, faster time — should update
    gs.seconds = 150;
    saveProgress();
    records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    expect(toClassicLevelRecord(records[10])?.time).toBe(150);
  });

  it('sanitizes replay history before persisting records', () => {
    gs.actionHistory = [
      { t: 12, type: 'fill', detail: 'valid', idx: 3, val: 7, notes: [1, 2] },
      { t: 13, type: 'unknown', detail: 'bad type', idx: null, val: null, notes: null },
      { t: 14, type: 'note', detail: 'valid note', idx: null, val: null, notes: [4, 5] },
      { t: 15, type: 'fill', detail: '', idx: 4, val: 8, notes: null },
    ] as unknown as typeof gs.actionHistory;

    saveProgress();

    const records = readJson<Record<string, unknown>>(SK.RECORDS, {});
    const saved = toClassicLevelRecord(records[10]);
    expect(saved?.replayHistory).toEqual([
      { t: 12, type: 'fill', detail: 'valid', idx: 3, val: 7, notes: [1, 2] },
      { t: 14, type: 'note', detail: 'valid note', idx: null, val: null, notes: [4, 5] },
    ]);
  });
});
