import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Theme toggle and persistence
 * Switch dark ↔ light → reload → theme persists
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e?.gs, { timeout: 10_000 });
}

test.describe('theme-persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
  });

  test('toggle theme changes data-theme attribute', async ({ page }) => {
    const initialTheme = await page.locator('html').getAttribute('data-theme');

    await page.evaluate(() => (window as any).toggleTheme());

    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
    expect(['light', 'dark']).toContain(newTheme);
  });

  test('theme persists across reload', async ({ page }) => {
    // Set to dark
    await page.evaluate(() => {
      localStorage.setItem('sudoku_theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Reload
    await page.reload();
    await waitForE2E(page);

    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('toggle twice returns to original theme', async ({ page }) => {
    const original = await page.locator('html').getAttribute('data-theme');

    await page.evaluate(() => (window as any).toggleTheme());
    await page.evaluate(() => (window as any).toggleTheme());

    const afterDouble = await page.locator('html').getAttribute('data-theme');
    expect(afterDouble).toBe(original);
  });

  test('theme stored in localStorage', async ({ page }) => {
    await page.evaluate(() => (window as any).toggleTheme());

    const stored = await page.evaluate(() => localStorage.getItem('sudoku_theme'));
    const attr = await page.locator('html').getAttribute('data-theme');
    expect(stored).toBe(attr);
  });
});
