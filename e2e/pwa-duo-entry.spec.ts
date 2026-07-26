import { expect, test } from '@playwright/test';

test('installed PWA can open the Duo lobby without legacy storage markers', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });

  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => typeof (window as Window & { openDuoLobby?: unknown }).openDuoLobby === 'function');

  const entry = page.locator('#duo-entry-btn');
  await expect(entry).not.toHaveClass(/journey-locked/);
  await entry.click();
  await expect(page.locator('#duo-lobby')).not.toHaveClass(/hidden/);
  await page.screenshot({ path: testInfo.outputPath('duo-lobby.png'), fullPage: true });

  await context.close();
});
