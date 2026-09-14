// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gs, type MoveRecord } from '../src/game/state';
import { handleInput, erase, saveGameStatus } from '../src/game/core';
import { renderGrid, selectCell } from '../src/game/board';
import { bindDuoPersistence } from '../src/game/duoPersistenceBridge';
import { loadDuoRoundSnapshot, saveDuoRoundSnapshot } from '../src/features/duo/duoRoundPersistence';
import * as audio from '../src/game/audio';

describe('atomic Duo input persistence', () => {
  let writes: ReturnType<typeof vi.spyOn>;
  let moves: MoveRecord[];
  const snapshotWrites = () => writes.mock.calls.filter(([key]) => key === 'sudoku_duo_round_v1').length;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    for (const fn of [
      'playCellSelectSound',
      'playFillSound',
      'playNoteToggleSound',
      'playEraseSound',
      'playErrorFeedback',
    ] as const)
      vi.spyOn(audio, fn).mockImplementation(() => {});
    document.body.innerHTML = '<div id="grid"></div>';
    gs.gridEl = document.getElementById('grid');
    gs.currentLevel = {
      id: -1,
      source: 'duo',
      stars: 1,
      difficultyName: 'Easy',
      displayName: 'Duo',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
    };
    gs.cellsData = gs.currentLevel.puzzle.map(() => ({ value: 0, notes: [1, 3], fixed: false, isError: false }));
    gs.isDuoMode = true;
    gs.isChessClockMode = false;
    gs.isNotesMode = false;
    gs.wildNotesDisabled = false;
    gs.duoCooldownUntil = 0;
    gs.errors = 0;
    gs.maxErrors = 3;
    gs.actionHistory = [];
    gs.continuousFillDigit = null;
    moves = [];
    bindDuoPersistence({
      recordMove: (cell, val, ok) => moves.push({ t: 0, cell, val, ok }),
      saveRound: () =>
        saveDuoRoundSnapshot({
          roomId: 'input-test',
          role: 'host',
          puzzleSeed: 1,
          startedAtMs: 1,
          seconds: gs.seconds,
          errors: gs.errors,
          cells: gs.cellsData,
          moves,
        }),
    });
    renderGrid();
    selectCell(0);
    writes = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    gs.isDuoMode = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('synchronously saves one complete snapshot including the latest correct move', () => {
    handleInput(1);
    const saved = loadDuoRoundSnapshot('input-test', 'host', 1)!;
    expect(snapshotWrites()).toBe(1);
    expect(saved.cells[0]).toEqual({ value: 1, notes: [] });
    expect(saved.moves).toEqual([{ t: 0, cell: 0, val: 1, ok: true }]);
    // No extra click sound just because input refreshed the selected cell.
    expect(audio.playCellSelectSound).toHaveBeenCalledTimes(1);
  });

  it('saves candidates, mistakes and erasures without storing temporary wrong digits', async () => {
    gs.isNotesMode = true;
    handleInput(5);
    expect(loadDuoRoundSnapshot('input-test', 'host', 1)?.cells[0].notes).toEqual([1, 3, 5]);
    gs.isNotesMode = false;
    handleInput(2);
    const wrong = loadDuoRoundSnapshot('input-test', 'host', 1)!;
    expect(wrong.errors).toBe(1);
    expect(wrong.cells[0]).toEqual({ value: 0, notes: [1, 3, 5] });
    expect(wrong.moves.at(-1)).toMatchObject({ val: 2, ok: false });
    expect(gs.gridEl?.children[0].textContent).toBe('2');
    handleInput(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(gs.cellsData[0].value).toBe(1);
    expect(loadDuoRoundSnapshot('input-test', 'host', 1)?.cells[0].value).toBe(1);
    erase();
    expect(loadDuoRoundSnapshot('input-test', 'host', 1)?.moves.at(-1)).toMatchObject({ val: 0 });
    expect(loadDuoRoundSnapshot('input-test', 'host', 1)?.cells[0].value).toBe(0);
    expect(snapshotWrites()).toBe(4);
  });

  it('can flush immediately when the page is being hidden without importing another module', () => {
    gs.isNotesMode = true;
    handleInput(5);
    saveGameStatus();
    expect(loadDuoRoundSnapshot('input-test', 'host', 1)?.cells[0].notes).toContain(5);
    expect(snapshotWrites()).toBe(2);
  });
});
