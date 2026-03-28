import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Single-player full run
 * Start → fill → win → result screen → records persisted
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e?.gs, { timeout: 10_000 });
}

/** Clear game data but preserve app version to prevent reload. */
async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

test.describe('single-player-full-run', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
  });

  test('complete level 1 from start to win celebration', async ({ page }) => {
    await page.evaluate(() => (window as any).__e2e.initGame(1, true));
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Solve all cells
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });

    // Verify all cells match solution
    const isComplete = await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      return e2e.gs.cellsData.every(
        (c: any, i: number) => c.value === e2e.gs.currentLevel.solution[i],
      );
    });
    expect(isComplete).toBe(true);

    // Win celebration visible (checkWin may trigger async UI)
    await page.waitForTimeout(500);
    const winVisible = await page.locator('#win-celebration').isVisible();
    expect(winVisible).toBe(true);

    // Records saved
    const record = await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = (window as any).__e2e.gs.currentLevel?.id;
      return records[levelId] ?? records[String(levelId)] ?? null;
    });
    expect(record).not.toBeNull();
    expect(record.stars).toBe(3);
    expect(record.replayHistory.length).toBeGreaterThan(0);
  });

  test('legacy string solution format still settles correctly', async ({ page }) => {
    await page.evaluate(() => (window as any).__e2e.initGame(1, true));
    await page.locator('.game-container').waitFor({ state: 'visible' });

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.currentLevel.solution = e2e.gs.currentLevel.solution.map((n: number) => String(n));
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(Number(solution[i]));
        }
      }
    });

    await expect(page.locator('#win-celebration')).toBeVisible({ timeout: 5000 });
  });

  test('3 wrong inputs trigger game over', async ({ page }) => {
    await page.evaluate(() => (window as any).__e2e.initGame(1, true));
    await page.locator('.game-container').waitFor({ state: 'visible' });

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);
      const wrong = solution[emptyIdx] === 9 ? 1 : solution[emptyIdx] + 1;
      for (let i = 0; i < 3; i++) {
        e2e.selectCell(emptyIdx);
        e2e.handleInput(wrong);
      }
    });

    await page.waitForTimeout(600);
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 3000 });

    const errors = await page.evaluate(() => (window as any).__e2e.gs.errors);
    expect(errors).toBe(3);
  });

  test('action history records fills, mistakes, and notes', async ({ page }) => {
    await page.evaluate(() => (window as any).__e2e.initGame(1, true));
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Note + mistake
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);
      const correct = solution[emptyIdx];
      const wrong = correct === 9 ? 1 : correct + 1;

      e2e.gs.isNotesMode = true;
      e2e.selectCell(emptyIdx);
      e2e.handleInput(correct);

      e2e.gs.isNotesMode = false;
      e2e.selectCell(emptyIdx);
      e2e.handleInput(wrong);
    });
    await page.waitForTimeout(600);

    // Correct fill
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);
      e2e.selectCell(emptyIdx);
      e2e.handleInput(solution[emptyIdx]);
    });

    const types = await page.evaluate(() =>
      (window as any).__e2e.gs.actionHistory.map((a: any) => a.type),
    );
    expect(types).toContain('note');
    expect(types).toContain('mistake');
    expect(types).toContain('fill');
  });

  test('save and restore mid-game progress', async ({ page }) => {
    await page.evaluate(() => (window as any).__e2e.initGame(1, true));
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Ensure speedrun off, fill first empty cell, save
    const info = await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = false;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);
      e2e.selectCell(emptyIdx);
      e2e.handleInput(solution[emptyIdx]);
      e2e.saveGameStatus();
      // Return the save key for verification
      const saveKey = 'sudoku_save_' + e2e.gs.currentLevel.id;
      return { emptyIdx, correctDigit: solution[emptyIdx], saveKey };
    });

    const hasSave = await page.evaluate((key) => !!localStorage.getItem(key), info.saveKey);
    expect(hasSave).toBe(true);

    // Verify save data integrity before restoring
    const saveValid = await page.evaluate(({ idx, saveKey }) => {
      const raw = localStorage.getItem(saveKey);
      if (!raw) return { error: 'no save', cellsLength: 0, cellValue: -1 };
      const parsed = JSON.parse(raw);
      return {
        levelId: parsed.levelId,
        cellValue: parsed.cellsData?.[idx]?.value ?? -1,
        cellsLength: parsed.cellsData?.length ?? 0,
      };
    }, { idx: info.emptyIdx, saveKey: info.saveKey });
    expect(saveValid.cellsLength, 'save has 81 cells').toBe(81);
    expect(saveValid.cellValue, 'save cell value matches').toBe(info.correctDigit);

    // Simulate restart: re-init from save (no reload needed)
    const restoreResult = await page.evaluate((idx) => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = false;
      e2e.initGame(1, false);
      return {
        restoredValue: e2e.gs.cellsData[idx].value,
        cellFixed: e2e.gs.cellsData[idx].fixed,
        errors: e2e.gs.errors,
        seconds: e2e.gs.seconds,
      };
    }, info.emptyIdx);
    expect(restoreResult.restoredValue, 'restored value matches').toBe(info.correctDigit);
  });
});
