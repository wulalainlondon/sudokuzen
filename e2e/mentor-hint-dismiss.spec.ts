import { test, expect } from '@playwright/test';
test.use({
  browserName: process.env.E2E_BROWSER === 'webkit' ? 'webkit' : 'chromium',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
test('timed mentor hint closes and returns to a usable candidate-tracking board', async ({ page }) => {
  await page.route('**/firebase-config*.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '// isolated fixture' }),
  );
  await page.goto('/');
  await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const e = (window as any).__e2e;
    e.gs.candidateTrackingEnabled = true;
    e.initGame(-9999, true, false, null, {
      id: -9999,
      source: 'wild',
      mode: 'world',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
      displayName: '提示恢復驗證',
    });
    const mentor = await import('/src/features/wild/mentorController.ts');
    const original = window.setTimeout;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: any[]) =>
      original(fn, ms === 30000 ? 10 : ms, ...args)) as typeof window.setTimeout;
    try {
      mentor.startEncounterHintTimers('locked_candidates', true);
    } finally {
      window.setTimeout = original;
    }
  });
  await expect(page.locator('#mentor-overlay')).toBeVisible();
  await expect(page.locator('#mentor-text')).toContainText('長按 numpad');
  await page.getByRole('button', { name: '返回棋盤', exact: true }).tap();
  await expect(page.locator('#mentor-overlay')).toHaveCount(0);
  const digit = page.locator('.num-btn').nth(1);
  await digit.click({ trial: true });
  const box = (await digit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__e2e.gs.candidateTracking.active);
  await expect(page.locator('#mentor-overlay')).toHaveCount(0);
  await page.screenshot({ path: `output/mentor-hint-20260918/${process.env.E2E_BROWSER || 'chromium'}-recovered.png` });
});
