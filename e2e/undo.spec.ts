import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Undo system
 *
 * The undo stack is populated in two modes:
 *   - Speedrun mode  (useSubmissionValidation = true)
 *   - Wild blind mode
 *
 * The undo button (#undo-btn) is shown when mode = 'practice'.
 *
 * Tests cover: value revert, notes revert, multi-step undo,
 * button visibility, and no-op on empty stack.
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 10_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

/** Start level 1 in speedrun mode (populates undo stack on each fill). */
async function startSpeedrunLevel(page: Page) {
  await page.evaluate(() => {
    const e2e = (window as unknown).__e2e;
    e2e.gs.isSpeedrunMode = true;
    e2e.initGame(1, true);
  });
  await page.locator('.game-container').waitFor({ state: 'visible' });
}

test.describe('undo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
  });

  test('fill in speedrun mode pushes to undo stack and reverts on undo', async ({ page }) => {
    await startSpeedrunLevel(page);

    const info = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const idx = puzzle.findIndex((v: number) => v === 0);
      e2e.selectCell(idx);
      e2e.handleInput(solution[idx]);
      return { idx, digit: solution[idx], stackLen: e2e.gs.undoStack.length };
    });

    expect(info.stackLen).toBeGreaterThanOrEqual(1);

    const after = await page.evaluate((idx) => {
      const e2e = (window as unknown).__e2e;
      (window as unknown).undoAction();
      return { value: e2e.gs.cellsData[idx].value, stackLen: e2e.gs.undoStack.length };
    }, info.idx);

    expect(after.value).toBe(0);
    expect(after.stackLen).toBe(info.stackLen - 1);
  });

  test('multiple fills → multiple undos step through history in order', async ({ page }) => {
    await startSpeedrunLevel(page);

    const fills = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const indices: number[] = [];
      for (let i = 0; i < 81 && indices.length < 3; i++) {
        if (puzzle[i] === 0) indices.push(i);
      }
      for (const idx of indices) {
        e2e.selectCell(idx);
        e2e.handleInput(solution[idx]);
      }
      return { indices, stackLen: e2e.gs.undoStack.length };
    });

    expect(fills.stackLen).toBeGreaterThanOrEqual(3);

    // Undo all three — values should revert LIFO
    const reverted = await page.evaluate((indices) => {
      const e2e = (window as unknown).__e2e;
      (window as unknown).undoAction();
      (window as unknown).undoAction();
      (window as unknown).undoAction();
      return indices.map((idx: number) => e2e.gs.cellsData[idx].value);
    }, fills.indices);

    expect(reverted.every((v: number) => v === 0)).toBe(true);
  });

  test('undo on empty stack is a no-op', async ({ page }) => {
    await startSpeedrunLevel(page);

    const before = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle } = e2e.gs.currentLevel;
      const snapshot = puzzle.slice();
      // Call undo with no prior fills → should do nothing
      (window as unknown).undoAction();
      return {
        stackLen: e2e.gs.undoStack.length,
        firstCellValue: e2e.gs.cellsData[0].value,
        puzzleMatch: e2e.gs.cellsData.every((c: { value: number }, i: number) => c.value === snapshot[i]),
      };
    });

    expect(before.stackLen).toBe(0);
    expect(before.puzzleMatch).toBe(true);
  });

  test('undo clears error flag when undoing a wrong fill (speedrun)', async ({ page }) => {
    await startSpeedrunLevel(page);

    // In speedrun mode the cell is filled as-typed (wrong values still enter the board).
    // Find an empty cell, input the WRONG digit, undo, verify error cleared.
    const result = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const idx = puzzle.findIndex((v: number) => v === 0);
      const correct = solution[idx] as number;
      // Find any digit that differs from correct and is not already completed (< 9 on board)
      const counts = new Array(10).fill(0);
      e2e.gs.cellsData.forEach((c: { value: number }) => { if (c.value >= 1) counts[c.value]++; });
      const wrong = [1,2,3,4,5,6,7,8,9].find((n: number) => n !== correct && counts[n] < 9);
      if (!wrong) return { skip: true };
      e2e.selectCell(idx);
      e2e.handleInput(wrong);
      const valueAfterFill = e2e.gs.cellsData[idx].value;
      const stackLen = e2e.gs.undoStack.length;
      (window as unknown).undoAction();
      return {
        skip: false,
        valueAfterFill,
        stackLen,
        valueAfterUndo: e2e.gs.cellsData[idx].value,
        isErrorAfterUndo: e2e.gs.cellsData[idx].isError,
      };
    });

    if (result.skip) return; // no injectable wrong digit available
    // In speedrun mode wrong values ARE entered onto the board
    expect(result.valueAfterFill).not.toBe(0);
    expect(result.stackLen).toBeGreaterThanOrEqual(1);
    expect(result.valueAfterUndo).toBe(0);
    expect(result.isErrorAfterUndo).toBe(false);
  });

  test('#undo-btn is visible in practice mode and hidden in normal mode', async ({ page }) => {
    // Normal mode: undo button should be hidden
    await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      e2e.gs.isSpeedrunMode = false;
      e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });
    await expect(page.locator('#undo-btn')).toHaveClass(/hidden/);

    // Practice mode (override level with mode: 'practice'): undo button should be visible
    await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const practiceLevel = {
        ...e2e.gs.currentLevel,
        id: -99901,
        mode: 'practice',
        maxTechnique: 'naked_single',
      };
      e2e.gs.isSpeedrunMode = false;
      e2e.initGame(practiceLevel.id, true, false, null, practiceLevel);
    });
    await expect(page.locator('#undo-btn')).not.toHaveClass(/hidden/);
  });
});
