// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  conflictCells,
  loadRecoverySession,
  saveRecoverySession,
  solveRecoveryBoard,
  type RecoverySession,
} from '../src/features/recovery/recoveryBoard';
import { SK } from '../src/storage/keys';

const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
  .split('')
  .map(Number);
const answer = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  .split('')
  .map(Number);

describe('screenshot recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', window.localStorage);
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recovers the unique original solution without changing screenshot digits', () => {
    expect(solveRecoveryBoard(puzzle)).toEqual({ status: 'unique', solution: answer });
    expect(puzzle[2]).toBe(0);
  });

  it('rejects conflicting, malformed and ambiguous clues', () => {
    const repeated = [...puzzle];
    repeated[2] = 5;
    expect([...conflictCells(repeated)]).toEqual(expect.arrayContaining([0, 2]));
    expect(solveRecoveryBoard(repeated).status).toBe('invalid');
    const unsolvable = [...puzzle];
    unsolvable[2] = 1;
    expect(conflictCells(unsolvable).size).toBe(0);
    expect(solveRecoveryBoard(unsolvable).status).toBe('invalid');
    expect(solveRecoveryBoard([NaN]).status).toBe('invalid');
    expect(solveRecoveryBoard(Array(81).fill(0)).status).toBe('multiple');
  });

  it('preserves editable progress, original clues and notes in a separate local save', () => {
    localStorage.setItem(SK.RECORDS, '{"1":{"time":50}}');
    const session: RecoverySession = {
      version: 1,
      seconds: 37,
      solution: answer,
      cells: puzzle.map((value, i) => ({
        value: i === 2 ? 4 : value,
        fixed: value !== 0,
        notes: i === 3 ? [2, 6] : [],
      })),
    };
    expect(saveRecoverySession(session)).toBe(true);
    expect(loadRecoverySession()).toEqual(session);
    expect(loadRecoverySession()?.cells[2].fixed).toBe(false);
    expect(localStorage.getItem(SK.RECORDS)).toBe('{"1":{"time":50}}');
  });

  it('rejects corrupt saves and reports storage failures', () => {
    localStorage.setItem(SK.RECOVERY_SESSION, '{bad');
    expect(loadRecoverySession()).toBeNull();
    localStorage.setItem(
      SK.RECOVERY_SESSION,
      JSON.stringify({
        version: 1,
        cells: Array(81).fill({ value: 5, fixed: true, notes: [] }),
        solution: Array(81).fill(5),
        seconds: 0,
      }),
    );
    expect(loadRecoverySession()).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(saveRecoverySession({ version: 1, cells: [], solution: [], seconds: 0 })).toBe(false);
  });
});
