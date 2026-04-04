import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Level navigation
 * Stage map → tier → level card → pre-level modal → start game
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

test.describe('level-navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    // Ensure level screen is showing
    await page.evaluate(() => (window as any).showLevelScreen());
    await page.locator('#level-screen').waitFor({ state: 'visible' });
  });

  test('stage map renders realm nodes', async ({ page }) => {
    const nodes = page.locator('#stage-map .stage-node');
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First tier should be unlocked (not have .locked class)
    const firstNode = nodes.first();
    await expect(firstNode).not.toHaveClass(/locked/);

    // Each node should have a name
    const firstName = await firstNode.locator('.stage-name').textContent();
    expect(firstName?.length).toBeGreaterThan(0);
  });

  test('clicking tier opens level grid', async ({ page }) => {
    // Click first unlocked tier
    const firstNode = page.locator('#stage-map .stage-node:not(.locked)').first();
    const tierName = await firstNode.locator('.stage-name').textContent();
    await firstNode.click();

    // Tier view should be visible
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 3000 });

    // Tier title should match
    const title = await page.locator('#tier-title').textContent();
    expect(title).toBe(tierName);

    // Level grid should have items
    const items = page.locator('#level-list .level-item');
    await expect.poll(async () => items.count(), { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('clicking level opens pre-level modal', async ({ page }) => {
    // Enter first tier
    await page.locator('#stage-map .stage-node:not(.locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 3000 });

    // Click first level item
    await page.locator('#level-list .level-item:not(.locked)').first().click();

    // Pre-level modal should be visible
    await expect(page.locator('#pre-level-modal')).toBeVisible({ timeout: 3000 });

    // Modal should show level name and tech info
    const levelName = await page.locator('#pre-level-name').textContent();
    expect(levelName?.length).toBeGreaterThan(0);
    const techInfo = await page.locator('#pre-level-tech').textContent();
    expect((techInfo ?? '').length).toBeGreaterThan(0);
  });

  test('start button launches game from modal', async ({ page }) => {
    // Navigate to first level
    await page.locator('#stage-map .stage-node:not(.locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 3000 });
    await page.locator('#level-list .level-item:not(.locked)').first().click();
    await expect(page.locator('#pre-level-modal')).toBeVisible({ timeout: 3000 });

    // Click start
    await page.locator('#pre-level-start-btn').click();

    // Game container should appear, level screen hidden
    await expect(page.locator('.game-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#level-screen')).not.toBeVisible();

    // Grid should have 81 cells
    await expect(page.locator('#grid > .cell')).toHaveCount(81);
  });

  test('back button returns to stage map from tier view', async ({ page }) => {
    // Enter tier
    await page.locator('#stage-map .stage-node:not(.locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 3000 });

    // Click back
    await page.locator('#tier-view .tier-back-btn').click();

    // Stage view should be visible, tier view hidden
    await expect(page.locator('#stage-view')).toBeVisible();
    await expect(page.locator('#tier-view')).toHaveClass(/hidden/);
  });

  test('stage map shows partial progress after completing a level', async ({ page }) => {
    // Get the actual first level ID and inject a completion record
    await page.evaluate(async () => {
      const { getAllLevels } = await import('/src/data/dataRegistry.ts');
      const levels = getAllLevels().filter((l: any) => !l.hidden);
      const firstLevel = levels[0];

      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      records[firstLevel.id] = { time: 42, stars: 3, replayHistory: [] };
      localStorage.setItem('sudoku_records', JSON.stringify(records));

      // Re-render stage map
      (window as any).showLevelScreen();
    });
    await page.locator('#level-screen').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    // At least one stage node should show partial or cleared progress
    const partialOrCleared = page.locator('#stage-map .stage-node.partial, #stage-map .stage-node.cleared');
    const count = await partialOrCleared.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
