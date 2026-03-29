import { test, expect, type Page } from '@playwright/test';

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

test.describe('skills-cast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.isSpeedrunMode = false;
      e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });
  });

  test('long-press enters skill mode and cast eliminates locked-candidates targets', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const cells = e2e.gs.cellsData;
      // Reset all notes to keep this case deterministic.
      for (let i = 0; i < 81; i++) {
        if (cells[i].value === 0) cells[i].notes = [];
      }

      // Force involved cells to be editable empties (independent of level layout).
      for (const idx of [0, 1, 2, 5, 7]) {
        cells[idx].value = 0;
        cells[idx].fixed = false;
        cells[idx].isError = false;
        cells[idx].notes = [];
      }

      // Build a valid Locked Candidates (pointing) pattern in box 1, row 1.
      // Sources: r1c1(0), r1c2(1), plus r1c3(2) keeps digit 9 locked to row 1 in this box.
      cells[0].notes = [9];
      cells[1].notes = [9];
      cells[2].notes = [9];
      // Elimination targets in same row but different boxes.
      cells[5].notes = [9, 3];
      cells[7].notes = [9, 1];

      e2e.selectCell(0);
    });

    const sourceB = page.locator('#grid > .cell:nth-child(2)');
    await sourceB.dispatchEvent('pointerdown', { button: 0 });
    await page.waitForTimeout(360);
    await sourceB.dispatchEvent('pointerup', { button: 0 });

    const skillPanel = page.locator('#skill-panel');
    await expect(skillPanel).toBeVisible();
    await expect(page.locator('#skill-cast-btn')).toBeEnabled();
    await expect(page.locator('#skill-status')).toContainText('可施放');

    await page.locator('#skill-cast-btn').click();

    await expect(page.locator('#skill-panel')).toHaveClass(/hidden/, { timeout: 4_000 });

    const result = await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const notes5 = e2e.gs.cellsData[5].notes.slice();
      const notes7 = e2e.gs.cellsData[7].notes.slice();
      const skillElims = e2e.gs.actionHistory.filter((a: any) => a.type === 'skill_eliminate');
      return {
        notes5,
        notes7,
        skillElimCount: skillElims.length,
        containsTarget5: skillElims.some((a: any) => a.idx === 5 && a.val === 9),
        containsTarget7: skillElims.some((a: any) => a.idx === 7 && a.val === 9),
      };
    });

    expect(result.notes5).toEqual([3]);
    expect(result.notes7).toEqual([1]);
    expect(result.skillElimCount).toBeGreaterThanOrEqual(2);
    expect(result.containsTarget5).toBe(true);
    expect(result.containsTarget7).toBe(true);
  });

  test('invalid pattern keeps cast disabled and does not eliminate candidates', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const cells = e2e.gs.cellsData;

      for (let i = 0; i < 81; i++) {
        if (cells[i].value === 0) cells[i].notes = [];
      }

      for (const idx of [0, 1, 5, 7, 10]) {
        cells[idx].value = 0;
        cells[idx].fixed = false;
        cells[idx].isError = false;
        cells[idx].notes = [];
      }

      // Looks like row-locked pair at r1c1/r1c2, but leaks in same box at r2c2.
      // This should be rejected after the locked-candidates fix.
      cells[0].notes = [9];
      cells[1].notes = [9];
      cells[10].notes = [9]; // leak in box 1, different row
      cells[5].notes = [9, 3];
      cells[7].notes = [9, 1];

      e2e.selectCell(0);
    });

    const sourceB = page.locator('#grid > .cell:nth-child(2)');
    await sourceB.dispatchEvent('pointerdown', { button: 0 });
    await page.waitForTimeout(360);
    await sourceB.dispatchEvent('pointerup', { button: 0 });

    await expect(page.locator('#skill-panel')).toBeVisible();
    await expect(page.locator('#skill-cast-btn')).toBeDisabled();
    await expect(page.locator('#skill-subtitle')).toContainText('未構成');

    const result = await page.evaluate(async () => {
      const before5 = (window as any).__e2e.gs.cellsData[5].notes.slice();
      const before7 = (window as any).__e2e.gs.cellsData[7].notes.slice();
      const beforeActions = (window as any).__e2e.gs.actionHistory.filter((a: any) => a.type === 'skill_eliminate').length;

      if (typeof (window as any).castSkill === 'function') {
        await (window as any).castSkill();
      }

      const after5 = (window as any).__e2e.gs.cellsData[5].notes.slice();
      const after7 = (window as any).__e2e.gs.cellsData[7].notes.slice();
      const afterActions = (window as any).__e2e.gs.actionHistory.filter((a: any) => a.type === 'skill_eliminate').length;
      return { before5, before7, after5, after7, beforeActions, afterActions };
    });

    expect(result.after5).toEqual(result.before5);
    expect(result.after7).toEqual(result.before7);
    expect(result.afterActions).toBe(result.beforeActions);
  });
});
