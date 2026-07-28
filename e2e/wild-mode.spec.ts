import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Wild (World) mode
 * Wild lobby → profile card → bestiary → filters → navigation
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 10_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    const e2eMode = localStorage.getItem('sudoku_e2e_mode');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
    if (e2eMode) localStorage.setItem('sudoku_e2e_mode', e2eMode);
  });
}

test.describe('wild-mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    // Ensure level screen is showing
    await page.evaluate(() => (window as unknown).showLevelScreen());
    await page.locator('#level-screen').waitFor({ state: 'visible' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku_e2e_mode'))).toBe('1');
  });

  test('wild lobby opens when clicking world button', async ({ page }) => {
    // Click world entry button
    await page.locator('.world-entry-btn').click();

    // Wild lobby should be visible
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Stage view should be hidden
    const stageViewDisplay = await page.locator('#stage-view').evaluate((el) => getComputedStyle(el).display);
    expect(stageViewDisplay).toBe('none');
  });

  test('profile card renders with level badge and exp bar', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Level badge
    const levelText = await page.locator('#wild-level').textContent();
    expect(levelText).toMatch(/Lv\.\d+/);

    // Level title
    const titleText = await page.locator('#wild-level-title').textContent();
    expect(titleText?.length).toBeGreaterThan(0);

    // Exp bar fill exists
    await expect(page.locator('#wild-exp-fill')).toBeAttached();

    // Exp text
    const expText = await page.locator('#wild-exp-text').textContent();
    expect(expText).toContain('EXP');

    // Stats section: completed, discovered, encounters
    await expect(page.locator('#wild-completed')).toBeAttached();
    await expect(page.locator('#wild-discovered')).toBeAttached();
    await expect(page.locator('#wild-encounters')).toBeAttached();
  });

  test('bestiary grid renders with technique cards', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Bestiary count should be visible
    const countText = await page.locator('#wild-bestiary-count').textContent();
    expect(countText).toMatch(/\d+ \/ \d+/);

    // Bestiary grid should have cards (at least undiscovered ones for phase 1)
    const grid = page.locator('#wild-bestiary-grid');
    await expect(grid).toBeAttached();

    // Should have beast cards or phase headers
    const cards = page.locator('#wild-bestiary-grid .wild-beast-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('bestiary filter buttons update grid', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Count initial cards (all filter)
    const allCards = await page.locator('#wild-bestiary-grid .wild-beast-card').count();
    expect(allCards).toBeGreaterThanOrEqual(1);

    // Click "discovered" filter — with fresh data, discovered count should be 0
    await page.locator('#wild-bestiary-controls button[data-filter="discovered"]').click();
    await page.waitForTimeout(300);

    // The discovered filter button should now be active
    await expect(page.locator('#wild-bestiary-controls button[data-filter="discovered"]')).toHaveClass(/active/);

    // With clean data, no techniques are discovered yet, so card count should be 0
    const discoveredCards = await page.locator('#wild-bestiary-grid .wild-beast-card').count();
    expect(discoveredCards).toBe(0);

    // Switch back to "all"
    await page.locator('#wild-bestiary-controls button[data-filter="all"]').click();
    await page.waitForTimeout(300);

    const restoredCards = await page.locator('#wild-bestiary-grid .wild-beast-card').count();
    expect(restoredCards).toBe(allCards);
  });

  test('rarity filter buttons work', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Click "common" rarity filter
    await page.locator('#wild-rarity-controls button[data-rarity="common"]').click();
    await page.waitForTimeout(300);

    // The common button should be active
    await expect(page.locator('#wild-rarity-controls button[data-rarity="common"]')).toHaveClass(/active/);

    // Click "all" to restore
    await page.locator('#wild-rarity-controls button[data-rarity="all"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#wild-rarity-controls button[data-rarity="all"]')).toHaveClass(/active/);
  });

  test('back navigation returns to stage map', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Click back button
    await page.locator('#wild-lobby .tier-back-btn').click();

    // Stage view should be visible, wild lobby hidden
    await expect(page.locator('#stage-view')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#wild-lobby')).toHaveClass(/hidden/);
  });

  test('enter button is present with correct text', async ({ page }) => {
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    // Enter button should exist
    const enterBtn = page.locator('#wild-enter-btn');
    await expect(enterBtn).toBeVisible();

    // Should have enter text
    const enterText = await enterBtn.locator('.wild-enter-text').textContent();
    expect(enterText?.length).toBeGreaterThan(0);

    // Sub-text should exist
    const enterSub = await page.locator('#wild-enter-sub').textContent();
    expect(enterSub?.length).toBeGreaterThan(0);
  });
});
