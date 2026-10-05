import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

for (const [width, height] of [
  [414, 736],
  [320, 568],
  [568, 320],
]) {
  test(`all nine digit controls fit and receive input at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const e = (window as unknown).__e2e;
      e.gs.isDuoMode = false;
      e.gs.isNotesMode = false;
      e.gs.candidateTrackingEnabled = false;
      e.initGame(99999, true, false, null, {
        id: 99999,
        mode: 'normal',
        stars: 1,
        difficultyName: 'QA',
        displayName: 'Layout regression',
        puzzle: Array(81).fill(0),
        solution: Array.from(
          '123456789456789123789123456234567891567891234891234567345678912678912345912345678',
          Number,
        ),
      });
    });
    await page.locator('.game-container').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const bounds = await page.locator('#numpad .num-btn').evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }),
    );
    expect(bounds).toHaveLength(9);
    for (const b of bounds) {
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(width + 1);
      expect(b.bottom).toBeLessThanOrEqual(height + 1);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    for (let digit = 1; digit <= 9; digit++) {
      await page.locator(`.cell[data-idx="${digit - 1}"]`).tap();
      await page
        .locator('#numpad .num-btn')
        .filter({ hasText: new RegExp(`^${digit}$`) })
        .tap();
      expect(await page.evaluate((i) => (window as unknown).__e2e.gs.cellsData[i].value, digit - 1)).toBe(digit);
    }
  });
}
