import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const baseOrigin = new URL(baseURL).origin;
const managedPort = new URL(baseURL).port || '5173';
const useManagedWebServer = !!process.env.CI || process.env.E2E_MANAGED_SERVER === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'html',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    storageState: {
      cookies: [],
      origins: [{
        origin: baseOrigin,
        localStorage: [{ name: 'sudoku_e2e_mode', value: '1' }],
      }],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useManagedWebServer
    ? {
      command: `npm run dev -- --host 127.0.0.1 --port ${managedPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 30_000,
    }
    : undefined,
});
