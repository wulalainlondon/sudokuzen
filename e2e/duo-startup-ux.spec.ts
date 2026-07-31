import { expect, test, type Page } from '@playwright/test';

const OUTPUT_DIR = 'output/duo-ux';

async function waitForE2E(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __e2e?: unknown }).__e2e, null, {
    timeout: 10_000,
  });
}

test.describe('Duo startup and connection UX', () => {
  test('standalone PWA shows an immediate resume surface for a stored match', async ({ page }) => {
    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => {
          if (query !== '(display-mode: standalone)') return originalMatchMedia(query);
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => true,
          };
        },
      });
      localStorage.setItem('sudoku_duo_active_room_id', 'e2e-resume-room');
      localStorage.setItem('sudoku_duo_active_role', 'host');
    });

    await page.goto('/');
    const overlay = page.locator('#duo-resume-overlay');
    await expect(overlay).toBeVisible({ timeout: 8_000 });
    await expect(overlay).toContainText('正在返回對局');
    await page.screenshot({ path: `${OUTPUT_DIR}/cold-resume.png`, fullPage: true });
  });

  test('reconnect banner keeps the board visible and disappears after recovery', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/');
    await waitForE2E(page);
    await page.evaluate(() =>
      (
        window as unknown as {
          __e2e: { initGame: (levelId: number, forceReset: boolean) => void };
        }
      ).__e2e.initGame(1, true),
    );
    await expect(page.locator('.game-container')).toBeVisible();

    await page.evaluate(async () => {
      const progress = document.getElementById('duo-progress-container');
      if (!progress) throw new Error('Duo progress container is unavailable');
      progress.style.display = 'flex';
      for (const id of ['timer', 'quit-btn', 'level-tech-hint']) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
      }
      const connectionUi = await import('/src/features/duo/duoConnectionUi.ts');
      connectionUi.renderDuoConnectionState('reconnecting');
    });

    const banner = page.locator('#duo-game-connection');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('連線');
    await expect(page.locator('.sudoku-grid')).toBeVisible();
    await page.screenshot({ path: `${OUTPUT_DIR}/reconnecting-game.png`, fullPage: true });

    await page.evaluate(async () => {
      const connectionUi = await import('/src/features/duo/duoConnectionUi.ts');
      connectionUi.renderDuoConnectionState('connected');
    });
    await expect(banner).toBeHidden();
    await expect(page.locator('.sudoku-grid')).toBeVisible();
  });

  test('rematch transition prevents duplicate actions without hiding the result', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/');
    await waitForE2E(page);
    await page.evaluate(async () => {
      const { bridgeOpenDuoResult, bridgeSetDuoRematchPending } =
        await import('/src/react/duoresult/duoResultBridge.ts');
      bridgeOpenDuoResult({
        contentHtml: `
          <div class="duo-result-cards">
            <div class="duo-result-card winner"><div class="duo-result-alias">玩家9233</div><div class="duo-result-time">03:14</div></div>
            <div class="duo-result-card"><div class="duo-result-alias">S10Ezu4g</div><div class="duo-result-time">04:17</div></div>
          </div>
        `,
        iWon: true,
        isDraw: false,
        outcomeTier: 'dominant-win',
        timeDiffSec: 63,
        gapRatio: 0.25,
        levelId: 1,
        hostMoves: [],
        guestMoves: [],
        hostAlias: '玩家9233',
        guestAlias: 'S10Ezu4g',
        puzzle: [],
      });
      bridgeSetDuoRematchPending(true);
    });

    const rematch = page.locator('.duo-rematch-btn');
    await expect(rematch).toBeVisible();
    await expect(rematch).toBeDisabled();
    await expect(rematch).toContainText('正在返回準備區');
    await expect(page.locator('.duo-rematch-spinner')).toBeVisible();
    await page.screenshot({ path: `${OUTPUT_DIR}/rematch-pending.png`, fullPage: true });
  });
});
