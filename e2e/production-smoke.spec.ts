import { test, expect } from '@playwright/test';

/**
 * Production smoke tests — no __e2e dev bridge required.
 * Runs purely via UI interactions; safe to run against any build including production/preview.
 *
 * Target: playwright.preview.config.ts (real URL) or default config (localhost).
 */

test.describe('production-smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to boot: level screen must be visible
    await page.waitForSelector('#level-screen', { state: 'visible', timeout: 15_000 });
  });

  // ── Boot ──────────────────────────────────────────────────────────────

  test('page loads and renders level screen with stage map nodes', async ({ page }) => {
    // Stage map nodes are populated dynamically by levels.ts
    await page.waitForFunction(
      () => document.querySelectorAll('#stage-map .stage-node').length > 0,
      { timeout: 10_000 },
    );
    const nodes = page.locator('#stage-map .stage-node');
    await expect(nodes.first()).toBeVisible();
  });

  test('app version badge is visible', async ({ page }) => {
    await expect(page.locator('#version-badge')).toBeVisible();
  });

  // ── Wild lobby ────────────────────────────────────────────────────────

  test('opening Wild lobby shows profile card', async ({ page }) => {
    await page.click('.world-entry-btn');
    await expect(page.locator('#wild-lobby')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#wild-lobby .wild-profile-card')).toBeVisible();
    await expect(page.locator('#wild-level')).toBeVisible();
    await expect(page.locator('#wild-exp-text')).toBeVisible();
  });

  test('closing Wild lobby returns to stage view', async ({ page }) => {
    await page.click('.world-entry-btn');
    await expect(page.locator('#wild-lobby')).toBeVisible({ timeout: 5_000 });

    await page.locator('#wild-lobby .tier-back-btn').click();
    await expect(page.locator('#wild-lobby')).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('#stage-view')).toBeVisible();
  });

  // ── Library overlay ───────────────────────────────────────────────────

  test('library overlay opens and shows technique cards', async ({ page }) => {
    await page.click('#library-btn');
    const overlay = page.locator('#library-overlay');
    await expect(overlay).toBeVisible({ timeout: 5_000 });

    // Cards are rendered dynamically
    await page.waitForFunction(
      () => document.querySelectorAll('.library-card').length > 0,
      { timeout: 8_000 },
    );
    const cards = page.locator('.library-card');
    await expect(cards.first()).toBeVisible();
  });

  test('library overlay closes', async ({ page }) => {
    await page.click('#library-btn');
    await expect(page.locator('#library-overlay')).toBeVisible({ timeout: 5_000 });

    await page.locator('.library-back-btn').click();
    await expect(page.locator('#library-overlay')).toBeHidden({ timeout: 3_000 });
  });

  // ── Stats modal ───────────────────────────────────────────────────────

  test('stats modal opens on button click', async ({ page }) => {
    await page.click('#stats-btn');
    await expect(page.locator('#stats-modal')).toBeVisible({ timeout: 5_000 });
  });

  // ── Duo lobby ─────────────────────────────────────────────────────────

  test('duo lobby opens and shows room UI', async ({ page }) => {
    await page.click('#duo-entry-btn');
    await expect(page.locator('#duo-lobby')).toBeVisible({ timeout: 5_000 });
  });

  test('duo lobby closes', async ({ page }) => {
    await page.click('#duo-entry-btn');
    await expect(page.locator('#duo-lobby')).toBeVisible({ timeout: 5_000 });

    await page.locator('#duo-back-btn').click();
    await expect(page.locator('#duo-lobby')).toBeHidden({ timeout: 3_000 });
  });

  // ── Alias input ───────────────────────────────────────────────────────

  test('alias saves and persists across reload', async ({ page }) => {
    const alias = 'SmokeTest' + Date.now().toString().slice(-4);

    await page.fill('#alias-input', alias);
    await page.click('.alias-save-btn');

    // Reload and verify alias persists
    await page.reload();
    await page.waitForSelector('#level-screen', { state: 'visible', timeout: 15_000 });
    await expect(page.locator('#alias-input')).toHaveValue(alias);
  });

  // ── Tier navigation ───────────────────────────────────────────────────

  test('clicking stage node opens tier view with levels', async ({ page }) => {
    await page.waitForFunction(
      () => document.querySelectorAll('#stage-map .stage-node').length > 0,
      { timeout: 10_000 },
    );

    // Click first unlocked node
    const unlocked = page.locator('#stage-map .stage-node:not(.locked)').first();
    await unlocked.click();

    await expect(page.locator('#tier-view')).toBeVisible({ timeout: 5_000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.level-item').length > 0,
      { timeout: 8_000 },
    );
    await expect(page.locator('.level-item').first()).toBeVisible();
  });

  test('back button from tier view returns to stage map', async ({ page }) => {
    await page.waitForFunction(
      () => document.querySelectorAll('#stage-map .stage-node').length > 0,
      { timeout: 10_000 },
    );

    const unlocked = page.locator('#stage-map .stage-node:not(.locked)').first();
    await unlocked.click();
    await expect(page.locator('#tier-view')).toBeVisible({ timeout: 5_000 });

    await page.locator('#tier-view .tier-back-btn').click();
    await expect(page.locator('#tier-view')).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('#stage-view')).toBeVisible();
  });
});
