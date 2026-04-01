import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile Layout Audit — screenshot every major screen on 3 device sizes:
 *   - Samsung Galaxy Note 20: 412 × 915 (Android)
 *   - iPhone 14 Pro: 393 × 852 (iOS notch)
 *   - iPhone 16 Pro: 402 × 874 (iOS dynamic island)
 *
 * Each screenshot is saved for manual review. The test PASSES if
 * the page renders without JS errors; visual correctness is checked
 * by comparing screenshots.
 */

const DEVICES = [
  { name: 'note20', width: 412, height: 915, scale: 3 },
  { name: 'i14pro', width: 393, height: 852, scale: 3 },
  { name: 'i16pro', width: 402, height: 874, scale: 3 },
];

const SCREENS = [
  'stage-map',
  'practice-tree',
  'practice-branches',
  'practice-level-grid',
  'wild-lobby',
  'tier-view',
] as const;

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e?.gs, { timeout: 15_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

for (const device of DEVICES) {
  test.describe(`layout-${device.name} (${device.width}×${device.height})`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.scale,
      isMobile: true,
      hasTouch: true,
    });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForE2E(page);
      await clearGameData(page);
      await page.evaluate(() => (window as any).showLevelScreen());
      await page.locator('#level-screen').waitFor({ state: 'visible' });
    });

    test('stage map — no overflow', async ({ page }) => {
      await page.locator('#stage-map').waitFor({ state: 'visible' });
      // Check random-bar buttons are visible
      const bar = page.locator('.random-bar');
      await expect(bar).toBeVisible();
      // Screenshot
      await page.screenshot({ path: `test-results/layout-${device.name}-stage-map.png`, fullPage: false });
      // Verify no horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow).toBe(false);
    });

    test('practice lobby — tree renders, no overflow', async ({ page }) => {
      // Open practice lobby
      await page.evaluate(() => (window as any).openPracticeLobby());
      // Wait for React practice tree to render
      await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('.tree-node').first().waitFor({ state: 'visible', timeout: 5_000 });
      await page.screenshot({ path: `test-results/layout-${device.name}-practice-tree.png`, fullPage: false });
      // Check no horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow).toBe(false);
    });

    test('practice branches — fork SVG fits', async ({ page }) => {
      await page.evaluate(() => (window as any).openPracticeLobby());
      await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 10_000 });
      // Scroll to fork section
      const fork = page.locator('.tree-fork').first();
      if (await fork.isVisible()) {
        await fork.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/layout-${device.name}-practice-branches.png`, fullPage: false });
        const branchOverflow = await page.evaluate(() => {
          const el = document.querySelector('.tree-fork-branches');
          if (!el) return false;
          return el.scrollWidth > document.documentElement.clientWidth + 2;
        });
        expect(branchOverflow).toBe(false);
      }
    });

    test('practice level grid — 25 items fit', async ({ page }) => {
      await page.evaluate(() => (window as any).openPracticeLobby());
      await page.locator('.practice-tree-container').waitFor({ state: 'visible', timeout: 10_000 });
      // Click first unlocked technique (naked_single)
      const firstNode = page.locator('.tree-node').first();
      if (await firstNode.isVisible()) {
        await firstNode.click();
        await page.locator('#tier-view').waitFor({ state: 'visible', timeout: 5_000 });
        await page.screenshot({ path: `test-results/layout-${device.name}-practice-level-grid.png`, fullPage: false });
        // Verify level items exist
        const count = await page.locator('#level-list .level-item').count();
        expect(count).toBe(25);
      }
    });

    test('wild lobby — profile + bestiary fit', async ({ page }) => {
      await page.evaluate(() => (window as any).openWildLobby());
      await page.locator('#wild-lobby').waitFor({ state: 'visible', timeout: 10_000 });
      await page.screenshot({ path: `test-results/layout-${device.name}-wild-lobby.png`, fullPage: false });
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow).toBe(false);
    });

    test('tier view — level grid fits', async ({ page }) => {
      // Enter first tier
      const firstNode = page.locator('.stage-node').first();
      if (await firstNode.isVisible()) {
        await firstNode.click();
        await page.locator('#tier-view').waitFor({ state: 'visible', timeout: 5_000 });
        await page.screenshot({ path: `test-results/layout-${device.name}-tier-view.png`, fullPage: false });
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow).toBe(false);
      }
    });
  });
}
