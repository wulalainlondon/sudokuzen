// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createLegacySaveSanitizationMigration,
  createTeachSelectionMigration,
  runStorageMigrations,
} from '../src/shared/storage/migrations';

describe('storage migrations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('copies teach read state into v2 key and stores version', () => {
    localStorage.setItem('sudoku_teach_read', JSON.stringify({ 1: true }));
    const version = runStorageMigrations([createTeachSelectionMigration(), createLegacySaveSanitizationMigration()]);

    expect(version).toBe(2);
    expect(localStorage.getItem('sudoku_storage_version')).toBe('2');
    expect(localStorage.getItem('sudoku_teach_read_v2')).toBe(JSON.stringify({ 1: true }));
  });

  it('sanitizes legacy save payload and normalizes mode flags', () => {
    const key = 'sudoku_save_12';
    localStorage.setItem(
      key,
      JSON.stringify({
        levelId: '12',
        cellsData: Array.from({ length: 81 }, (_, i) => ({
          value: i === 10 ? '4' : 0,
          fixed: i % 2 ? 1 : 0,
          notes: i === 10 ? [1, 2, 11, '3'] : [9, '7', -1],
          isError: true,
        })),
        seconds: '31.9',
        errors: '-3',
        submissionCount: '5',
        actionHistory: [{ kind: 'input' }],
        isGhostMode: 'true',
        ghostHistory: ['bad-shape'],
      }),
    );
    localStorage.setItem('sudoku_speedrun', 'YES');
    localStorage.setItem('sudoku_skill_mode', '0');

    runStorageMigrations([createTeachSelectionMigration(), createLegacySaveSanitizationMigration()]);

    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    expect(saved.levelId).toBe(12);
    expect(saved.cellsData).toHaveLength(81);
    expect(saved.cellsData[10].value).toBe(4);
    expect(saved.cellsData[10].notes).toEqual([]);
    expect(saved.cellsData[11].notes).toEqual([7, 9]);
    expect(saved.cellsData[10].isError).toBe(false);
    expect(saved.seconds).toBe(31);
    expect(saved.errors).toBe(0);
    expect(saved.submissionCount).toBe(5);
    expect(saved.isGhostMode).toBe(false);
    expect(saved.ghostHistory).toBeNull();
    expect(localStorage.getItem('sudoku_speedrun')).toBe('true');
    expect(localStorage.getItem('sudoku_skill_mode')).toBe('false');
  });

  it('removes corrupt or invalid legacy saves', () => {
    localStorage.setItem('sudoku_save_1', '{bad json');
    localStorage.setItem('sudoku_speed_save_2', JSON.stringify({ foo: 'bar' }));

    runStorageMigrations([createTeachSelectionMigration(), createLegacySaveSanitizationMigration()]);

    expect(localStorage.getItem('sudoku_save_1')).toBeNull();
    expect(localStorage.getItem('sudoku_speed_save_2')).toBeNull();
    expect(localStorage.getItem('sudoku_storage_version')).toBe('2');
  });
});
