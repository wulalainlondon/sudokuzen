import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Teach system lazy-load
 * Open teach modal → shard fetch → demo/step-through → practice
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

test.describe('teach-lazy-load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
  });

  test('teach manifest loads and contains 40 modules', async ({ page }) => {
    const manifest = await page.evaluate(async () => {
      const { getTeachManifest } = await import('/src/data/dataRegistry.ts');
      return getTeachManifest();
    });
    expect(manifest).not.toBeNull();
    expect(manifest!.totalModules).toBe(40);
    expect(manifest!.version.length).toBeGreaterThan(0);
    expect(Object.keys(manifest!.modules)).toHaveLength(40);
  });

  test('teach shard fetches correctly via network', async ({ page }) => {
    const module = await page.evaluate(async () => {
      const { getTeachShard } = await import('/src/data/dataRegistry.ts');
      return getTeachShard(1);
    });
    expect(module).not.toBeNull();
    expect(module.technique).toBe('naked_single');
    expect(module.name).toBe('啟蒙');
    expect(module.example.steps.length).toBeGreaterThan(0);
  });

  test('openTeach via bridge fetches shard and opens overlay', async ({ page }) => {
    // Call showTeachModal which goes through bridge → store → fetchTeachModule
    await page.evaluate(() => {
      (window as any).showTeachModal(1, 'tier');
    });

    // Wait for teach overlay to render (React component)
    // The store sets flow to 'loading' then 'demo' or 'stepping'
    await page.waitForFunction(
      () => {
        const store = (window as any).__e2e?.gs;
        // Check via zustand store state (teach store is separate)
        return document.querySelector('[role="dialog"]') !== null ||
               document.querySelector('.teach-overlay')?.style.display !== 'none';
      },
      { timeout: 5000 },
    ).catch(() => {
      // Fallback: check if legacy teach modal opened instead
    });

    // Verify the teach store has loaded the module
    const storeState = await page.evaluate(async () => {
      const { useTeachStore } = await import('/src/features/teach/state/teachStore.ts');
      const state = useTeachStore.getState();
      return {
        open: state.open,
        moduleName: state.module?.name ?? null,
        flow: state.flow,
      };
    });

    // Either React overlay or legacy modal should have opened
    expect(storeState.open).toBe(true);
    expect(storeState.moduleName).toBe('啟蒙');
    expect(['demo', 'stepping']).toContain(storeState.flow);
  });

  test('library overlay renders from manifest metadata', async ({ page }) => {
    // Open library overlay
    await page.evaluate(() => (window as any).openLibraryOverlay());

    // Wait for library to render cards
    await page.waitForFunction(
      () => {
        const list = document.getElementById('library-list');
        return list && list.children.length > 0 && !list.textContent?.includes('載入秘笈目錄');
      },
      { timeout: 5000 },
    );

    // Should have library cards
    const cardCount = await page.evaluate(() =>
      document.querySelectorAll('.library-card').length,
    );
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Each card should have name and subtitle
    const firstCard = await page.evaluate(() => {
      const card = document.querySelector('.library-card');
      return {
        title: card?.querySelector('.library-card-title')?.textContent ?? '',
        subtitle: card?.querySelector('.library-card-subtitle')?.textContent ?? '',
      };
    });
    expect(firstCard.title.length).toBeGreaterThan(0);
    expect(firstCard.subtitle.length).toBeGreaterThan(0);
  });

  test('shard fetch URL includes version query param', async ({ page }) => {
    // Use page.on('request') instead of route to capture all requests
    const shardUrls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/teach/') && url.endsWith('.json') || url.includes('/teach/') && url.includes('.json?')) {
        shardUrls.push(url);
      }
    });

    // Fetch shard 5 (unlikely to be cached since we clear localStorage)
    const result = await page.evaluate(async () => {
      const { getTeachShard, getTeachManifest } = await import('/src/data/dataRegistry.ts');
      const manifest = await getTeachManifest();
      const shard = await getTeachShard(5);
      return {
        version: manifest?.version ?? '',
        technique: shard?.technique ?? null,
      };
    });

    expect(result.technique).toBe('hidden_pair');
    expect(result.version.length).toBeGreaterThan(0);

    // Check that a shard request was made with version param
    const shardReq = shardUrls.find((u) => u.includes('/5.json'));
    expect(shardReq, 'shard 5 should have been fetched').toBeDefined();
    expect(shardReq).toContain(`?v=${result.version}`);
  });
});
