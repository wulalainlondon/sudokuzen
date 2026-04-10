import { test, expect, type Page } from '@playwright/test';

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e, { timeout: 10_000 });
}

test.describe('hud-technique-hint', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
  });

  test('shows highest required technique for a normal level', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown).__e2e.initGame(1, true);
    });
    const hint = page.locator('#level-tech-hint');
    await expect(hint).toBeVisible();
    await expect(hint).not.toContainText('--');
  });

  test('shows understandable fallback when technique metadata is missing', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const base = e2e.gs.currentLevel ?? {
        id: 1,
        stars: 1,
        difficultyName: 'Beginner',
        displayName: '1',
        puzzle: Array(81).fill(0),
        solution: Array(81).fill(1),
      };
      e2e.initGame(-99999, true, false, null, {
        ...base,
        id: -99999,
        displayName: 'Fallback Test',
        maxTechnique: '',
        techTier: '',
      });
    });
    const hint = page.locator('#level-tech-hint');
    await expect(hint).toBeVisible();
    await expect(hint).not.toContainText('--');
  });
});

