import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Wild mode mentor dialog
 *
 * Verifies that mentor overlay messages appear at the right moments:
 *   - First kill: #mentor-overlay shown after the very first wild win
 *   - Dismiss: clicking the dismiss button closes overlay and marks it seen
 *   - Seen persistence: revisiting after dismiss does not re-show the same message
 *
 * Uses window.__e2e (dev-only bridge) to drive encounters without real gameplay.
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 10_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

/** Run one wild encounter to completion, returns onWildComplete result. */
async function runOneEncounter(page: Page, seconds = 90, errors = 0) {
  // Start world session (defers any intro prompt via __e2e.deferMentorIntro)
  await page.evaluate(() => {
    (window as unknown).__e2e.deferMentorIntro();
  });
  await page.evaluate(async () => {
    await (window as unknown).startWorldSession();
  });

  // Wait for encounter to be loaded
  await page.waitForFunction(
    () => !!(window as unknown).__e2e.getCurrentEncounter(),
    { timeout: 15_000 },
  );

  return page.evaluate(
    ({ sec, err }) => (window as unknown).__e2e.onWildComplete(sec, err),
    { sec: seconds, err: errors },
  );
}

test.describe('mentor-dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
  });

  test('first wild win triggers first-kill mentor overlay after ~2s', async ({ page }) => {
    await runOneEncounter(page);

    // triggerFirstKillIfNeeded fires inside setTimeout(2000) in onWildComplete
    await expect(page.locator('#mentor-overlay')).toBeVisible({ timeout: 6_000 });

    // Overlay must contain text
    const text = await page.locator('#mentor-text').textContent();
    expect((text ?? '').length).toBeGreaterThan(0);

    const sub = await page.locator('#mentor-sub').textContent();
    expect((sub ?? '').length).toBeGreaterThan(0);
  });

  test('clicking dismiss button closes the mentor overlay', async ({ page }) => {
    await runOneEncounter(page);
    await expect(page.locator('#mentor-overlay')).toBeVisible({ timeout: 6_000 });

    await page.locator('.mentor-dismiss-btn').click();

    await expect(page.locator('#mentor-overlay')).not.toBeVisible({ timeout: 3_000 });
  });

  test('dismissing mentor marks first_kill as seen in localStorage', async ({ page }) => {
    await runOneEncounter(page);
    await expect(page.locator('#mentor-overlay')).toBeVisible({ timeout: 6_000 });

    await page.locator('.mentor-dismiss-btn').click();
    await expect(page.locator('#mentor-overlay')).not.toBeVisible({ timeout: 3_000 });

    // Allow the debounced markSeen write to settle
    await page.waitForTimeout(300);

    const seen = await page.evaluate(() => {
      const raw = localStorage.getItem('sudoku_mentor_seen');
      return raw ? (JSON.parse(raw) as string[]) : [];
    });
    expect(seen).toContain('first_kill');
  });

  test('second win does not re-trigger first-kill overlay (already seen)', async ({ page }) => {
    // Pre-mark first_kill as seen
    await page.evaluate(() => {
      localStorage.setItem('sudoku_mentor_seen', JSON.stringify(['first_kill']));
    });

    await runOneEncounter(page);
    // Wait longer than the trigger delay to confirm nothing appears
    await page.waitForTimeout(3_500);
    await expect(page.locator('#mentor-overlay')).not.toBeVisible();
  });

  test('window.dismissMentor() closes overlay programmatically', async ({ page }) => {
    await runOneEncounter(page);
    await expect(page.locator('#mentor-overlay')).toBeVisible({ timeout: 6_000 });

    await page.evaluate(() => (window as unknown).dismissMentor());

    await expect(page.locator('#mentor-overlay')).not.toBeVisible({ timeout: 3_000 });
  });
});
