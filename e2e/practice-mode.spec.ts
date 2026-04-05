import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Practice mode
 * Practice tree (React) → technique tree → level grid → navigation
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

test.describe('practice-mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    // Ensure level screen is showing
    await page.evaluate(() => (window as unknown).showLevelScreen());
    await page.locator('#level-screen').waitFor({ state: 'visible' });
  });

  test('practice lobby opens with tree nodes', async ({ page }) => {
    // Click practice entry button
    await page.locator('.practice-entry-btn').click();

    // React practice tree should be visible
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // Tree nodes (technique nodes) should render
    const nodes = page.locator('.tree-node');
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Progress counter should be visible
    const progress = await page.locator('.practice-tree-progress').textContent();
    expect(progress).toContain('/41');
  });

  test('first technique (naked_single) is unlocked and clickable', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // naked_single has no prerequisites, so should be unlocked (not .locked)
    const firstNode = page.locator('.tree-node').first();
    await expect(firstNode).not.toHaveClass(/\btree-node--locked\b/);
    await expect(firstNode).toHaveClass(/\btree-node--(unlocked|partial|completed)\b/);

    // Should have a name
    const name = await firstNode.locator('.tree-node-label').textContent();
    expect(name?.length).toBeGreaterThan(0);

    // Should show Chinese progress-first copy (no GO/LOCK/DONE)
    await expect(firstNode.locator('.tree-node-primary')).toContainText('剩');
    await expect(firstNode.locator('.tree-node-secondary')).toContainText('已通關');
    await expect(firstNode).not.toContainText(/GO|LOCK|DONE/);
  });

  test('clicking naked_single opens tier-view with correct title', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // Click the first unlocked node (naked_single)
    const firstNode = page.locator('.tree-node:not(.tree-node--locked)').first();
    const techName = await firstNode.locator('.tree-node-label').textContent();
    await firstNode.click();

    // Tier view should appear, practice tree should be hidden
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });
    await expect(page.locator('.practice-tree-container')).not.toBeVisible();

    // Tier title should match the technique name
    const tierTitle = await page.locator('#tier-title').textContent();
    expect(tierTitle).toBe(techName);
  });

  test('back navigation returns to practice lobby from tier-view', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // Enter first technique
    await page.locator('.tree-node:not(.tree-node--locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });

    // Click back
    await page.locator('#tier-view .tier-back-btn').click();

    // Practice tree should be visible again, tier view hidden
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 3000 });
    await expect(page.locator('#tier-view')).toHaveClass(/hidden/);
  });

  test('technique level grid shows 25 levels', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // Click first unlocked technique
    await page.locator('.tree-node:not(.tree-node--locked)').first().click();
    await page.locator('#tier-view:not(.hidden)').waitFor({ timeout: 5000 });

    // Level list should have 25 items
    const items = page.locator('#level-list .level-item');
    await expect(items).toHaveCount(25, { timeout: 5000 });
  });

  test('back button from practice lobby returns to stage map', async ({ page }) => {
    await page.locator('.practice-entry-btn').click();
    await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 5000 });

    // Click the back button in practice tree header
    await page.locator('.practice-tree-container .tier-back-btn').click();

    // Stage view should be visible, practice tree should be hidden
    await expect(page.locator('#stage-view')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.practice-tree-container')).not.toBeVisible();
  });
});
