import { test, expect } from '@playwright/test';

test.use({
  browserName: process.env.E2E_BROWSER === 'webkit' ? 'webkit' : 'chromium',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  await page.route('**/firebase-config*.js', route => route.fulfill({ contentType: 'application/javascript', body: '// Isolated skill fixture.' }));
  await page.goto('/');
  await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const e = (window as unknown).__e2e;
    e.gs.isDuoMode = false;
    e.gs.isNotesMode = false;
    e.gs.isSpeedrunMode = false;
    e.gs.wildNotesDisabled = false;
    e.gs.candidateTrackingEnabled = true;
    e.initGame(-9999, true, false, null, {
      id: -9999, source: 'wild', mode: 'world', stars: 1,
      difficultyName: 'Fixture', displayName: '技能載入驗證',
      puzzle: Array(81).fill(0), solution: Array(81).fill(1),
    });
  });
  await page.locator('.game-container').waitFor({ state: 'visible' });
  await page.locator('.game-container').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
});

test('first World long-press loads the deferred runtime and completes a quick cast', async ({ page }) => {
  const readiness = await page.evaluate(async () => (await import('/src/features/skills/skillRuntime.ts')).isSkillRuntimeReady());
  expect(readiness).toBe(false);
  await page.locator('[data-idx="0"]').tap();
  await page.locator('#note-toggle').tap();
  await page.locator('.num-btn').first().tap();
  await page.locator('#note-toggle').tap();
  const box = (await page.locator('[data-idx="0"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown).__e2e.gs.cellsData[0].value === 1);
  expect(await page.evaluate(async () => (await import('/src/features/skills/skillRuntime.ts')).isSkillRuntimeReady())).toBe(true);
  await page.screenshot({ path: `output/skill-runtime-${process.env.E2E_BROWSER || 'chromium'}-quickcast.png` });
});

test('first candidate-tracking interaction can detect and cast after deferred loading', async ({ page }) => {
  await page.evaluate(async () => {
    const gs = (window as unknown).__e2e.gs;
    gs.cellsData[0].notes = [2, 3];
    gs.cellsData[1].notes = [2, 3];
    gs.cellsData[2].notes = [2, 3, 4];
    (await import('/src/game/board.ts')).renderGrid();
  });
  // Let Playwright wait for the game-entry layout animation before holding.
  const digitButton = page.locator('.num-btn').nth(1);
  await digitButton.click({ trial: true });
  const box = (await digitButton.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown).__e2e.gs.candidateTracking.active, null, { timeout: 5000 });
  await page.locator('[data-idx="0"]').tap();
  await page.locator('[data-idx="1"]').tap();
  await expect(page.locator('#tracking-cast-btn')).toBeEnabled();
  await page.locator('#tracking-cast-btn').click();
  await page.waitForFunction(() => !(window as unknown).__e2e.gs.candidateTracking.active);
  expect(await page.evaluate(() => (window as unknown).__e2e.gs.cellsData[2].notes)).toEqual([4]);
  await page.screenshot({ path: `output/skill-runtime-${process.env.E2E_BROWSER || 'chromium'}-tracking.png` });
});
