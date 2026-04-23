import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for testing the live production site.
 * No local dev server — tests hit https://wulalainlondon.github.io/sudokuzen/ directly.
 *
 * Usage:
 *   npx playwright test e2e/duo-live.spec.ts --config playwright.live.config.ts
 */

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/duo-live*.spec.ts'],
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report-live' }], ['list']],
  timeout: 300_000,
  use: {
    baseURL: 'https://wulalainlondon.github.io/sudokuzen/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
