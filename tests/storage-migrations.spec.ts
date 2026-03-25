// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { createTeachSelectionMigration, runStorageMigrations } from '../src/shared/storage/migrations';

describe('storage migrations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('copies teach read state into v2 key and stores version', () => {
    localStorage.setItem('sudoku_teach_read', JSON.stringify({ 1: true }));
    const version = runStorageMigrations([createTeachSelectionMigration()]);

    expect(version).toBe(1);
    expect(localStorage.getItem('sudoku_storage_version')).toBe('1');
    expect(localStorage.getItem('sudoku_teach_read_v2')).toBe(JSON.stringify({ 1: true }));
  });
});
