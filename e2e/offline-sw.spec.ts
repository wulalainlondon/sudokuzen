import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * E2E: Offline / Service Worker
 * Verify app loads offline after initial visit, SW caches key assets
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 10_000 });
}

test.describe('offline-sw', () => {
  test('key assets are served and cacheable', async ({ page }) => {
    // Track fetched URLs
    const fetchedUrls: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 200) {
        fetchedUrls.push(new URL(response.url()).pathname);
      }
    });

    await page.goto('/');
    await waitForE2E(page);

    // Core data assets should have been fetched by shard loader.
    const manifestFetched = fetchedUrls.some((u) => u.endsWith('/data/manifest.json'));
    expect(manifestFetched, 'data manifest should be fetched').toBe(true);

    const dataShardFetched = fetchedUrls.some((u) => u.includes('/data/') && u.endsWith('.json') && !u.endsWith('/data/manifest.json'));
    expect(dataShardFetched, 'at least one data shard should be fetched').toBe(true);
  });

  test('teach manifest is fetched on startup', async ({ page }) => {
    const manifestFetched = new Promise<boolean>((resolve) => {
      page.on('response', (response) => {
        if (response.url().includes('teach/manifest.json') && response.status() === 200) {
          resolve(true);
        }
      });
      setTimeout(() => resolve(false), 8000);
    });

    await page.goto('/');
    await waitForE2E(page);

    const result = await manifestFetched;
    expect(result).toBe(true);
  });

  test('production PWA plays offline and preserves data through a guarded upgrade', async () => {
    test.setTimeout(120_000);
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/verify-pwa-offline.mjs'], {
      timeout: 110_000,
      maxBuffer: 2_000_000,
    }).catch(error => {
      console.error(error.stdout);
      throw error;
    });
    expect(stdout).toContain('"offlinePlayBeforeUpgrade":true');
    expect(stdout).toContain('"offlinePlayAfterUpgrade":true');
    expect(stdout).toContain('"additionalNormalDownloadsOnUpgrade":0');
  });
});
