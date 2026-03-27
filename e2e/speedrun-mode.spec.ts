import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Speedrun mode
 * Toggle → fill all → submit validation → error rollback → re-submit win
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e?.gs, { timeout: 10_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

test.describe('speedrun-mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
  });

  test('toggle speedrun mode on and off', async ({ page }) => {
    // Initially off
    const initialMode = await page.evaluate(() => (window as any).__e2e.gs.isSpeedrunMode);
    expect(initialMode).toBe(false);

    // Toggle on
    await page.evaluate(() => (window as any).toggleSpeedrunMode());
    const afterOn = await page.evaluate(() => (window as any).__e2e.gs.isSpeedrunMode);
    expect(afterOn).toBe(true);

    // Button should have active class
    await expect(page.locator('#speedrun-toggle-btn')).toHaveClass(/active/);

    // Toggle off
    await page.evaluate(() => (window as any).toggleSpeedrunMode());
    const afterOff = await page.evaluate(() => (window as any).__e2e.gs.isSpeedrunMode);
    expect(afterOff).toBe(false);
  });

  test('speedrun: correct fill does not validate immediately', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = true;
      e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Fill one cell — should not trigger win check (board not full)
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);
      e2e.selectCell(emptyIdx);
      e2e.handleInput(solution[emptyIdx]);
    });

    // No win celebration yet
    const winVisible = await page.locator('#win-celebration').isVisible();
    expect(winVisible).toBe(false);

    // No error even if we filled a wrong digit later
    const errors = await page.evaluate(() => (window as any).__e2e.gs.errors);
    expect(errors).toBe(0);
  });

  test('speedrun: all correct → immediate win', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = true;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) { e2e.selectCell(i); e2e.handleInput(solution[i]); }
      }
    });

    await expect(page.locator('#win-celebration')).toBeVisible({ timeout: 5000 });

    // Submission count should be 0 (first try correct)
    const record = await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('sudoku_speed_records') || '{}');
      const levelId = (window as any).__e2e.gs.currentLevel?.id;
      return records[levelId] ?? records[String(levelId)] ?? null;
    });
    expect(record).not.toBeNull();
    expect(record.submissions).toBe(1);
  });

  test('speedrun: wrong cell resets last fill on submission', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = true;
      e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Fill all cells correctly except last one — put wrong digit in last
    const result = await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const empties: number[] = [];
      for (let i = 0; i < 81; i++) { if (puzzle[i] === 0) empties.push(i); }

      // Fill all but last correctly
      for (let j = 0; j < empties.length - 1; j++) {
        e2e.selectCell(empties[j]);
        e2e.handleInput(solution[empties[j]]);
      }

      // Fill last with wrong digit
      const lastIdx = empties[empties.length - 1];
      const wrong = solution[lastIdx] === 9 ? 1 : solution[lastIdx] + 1;
      e2e.selectCell(lastIdx);
      e2e.handleInput(wrong);

      return {
        lastIdx,
        submissionCount: e2e.gs.submissionCount,
      };
    });

    await page.waitForTimeout(600);

    // Submission count should be 1 (failed validation)
    expect(result.submissionCount).toBe(1);

    // Last cell should be reset to 0
    const lastValue = await page.evaluate(
      (idx) => (window as any).__e2e.gs.cellsData[idx].value,
      result.lastIdx,
    );
    expect(lastValue).toBe(0);

    // No win celebration
    const winVisible = await page.locator('#win-celebration').isVisible();
    expect(winVisible).toBe(false);
  });
});
