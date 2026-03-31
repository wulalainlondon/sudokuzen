import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Practice mode
 * Practice lobby → technique tree → level grid → navigation
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

test.describe('practice-mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    // Ensure level screen is showing
    await page.evaluate(() => (window as any).showLevelScreen());
    await page.locator('#level-screen').waitFor({ state: 'visible' });
  });

  test('practice lobby opens with tree nodes', async ({ page }) => {
    // Click practice entry button
    await page.locator('.practice-entry-btn').click();

    // Practice lobby should be visible
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Tree nodes (technique nodes) should render
    const nodes = page.locator('#practice-lobby-body .practice-node');
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Progress counter should be visible
    const progress = await page.locator('#practice-lobby-progress').textContent();
    expect(progress).toContain('/41');
  });

  test('first technique (naked_single) is unlocked and clickable', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // naked_single has no prerequisites, so should be unlocked (not .locked)
    const firstNode = page.locator('#practice-lobby-body .practice-node').first();
    await expect(firstNode).not.toHaveClass(/locked/);
    await expect(firstNode).toHaveClass(/unlocked|partial|completed/);

    // Should have a name
    const name = await firstNode.locator('.practice-node-name').textContent();
    expect(name?.length).toBeGreaterThan(0);
  });

  test('clicking naked_single opens tier-view with correct title', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Click the first unlocked node (naked_single)
    const firstNode = page.locator('#practice-lobby-body .practice-node:not(.locked)').first();
    const techName = await firstNode.locator('.practice-node-name').textContent();
    await firstNode.click();

    // Tier view should appear, practice lobby should be hidden
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });
    await expect(page.locator('#practice-lobby')).toHaveClass(/hidden/);

    // Tier title should match the technique name
    const tierTitle = await page.locator('#tier-title').textContent();
    expect(tierTitle).toBe(techName);
  });

  test('back navigation returns to practice lobby from tier-view', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Enter first technique
    await page.locator('#practice-lobby-body .practice-node:not(.locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });

    // Click back
    await page.locator('#tier-view .tier-back-btn').click();

    // Practice lobby should be visible again, tier view hidden
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 3000 });
    await expect(page.locator('#tier-view')).toHaveClass(/hidden/);
  });

  test('technique level grid shows 25 levels', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Click first unlocked technique
    await page.locator('#practice-lobby-body .practice-node:not(.locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });

    // Level list should have 25 items
    const items = page.locator('#level-list .level-item');
    await expect(items).toHaveCount(25, { timeout: 5000 });
  });

  test('back button from practice lobby returns to stage map', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('#practice-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Click the back button in practice lobby header
    await page.locator('#practice-lobby .tier-back-btn').click();

    // Stage view should be visible, practice lobby hidden
    await expect(page.locator('#stage-view')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#practice-lobby')).toHaveClass(/hidden/);
  });
});
