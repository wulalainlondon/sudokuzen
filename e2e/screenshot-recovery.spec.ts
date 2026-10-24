import { expect, test, type Page } from '@playwright/test';

async function openRecoveryFromLobby(page: Page) {
  await expect(page.locator('#recovery-home-entry')).toHaveCount(0);
  await expect(page.locator('#recovery-lobby-entry button')).toBeAttached();
  // Isolate the local recovery flow from Firebase authentication and room discovery.
  await page.evaluate(() => document.getElementById('duo-lobby')?.classList.remove('hidden'));
  await page.locator('#recovery-lobby-entry button').click();
}

const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
  .split('')
  .map(Number);
const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  .split('')
  .map(Number);

test.describe('screenshot recovery', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('imports a screenshot, keeps progress editable, finishes solo, and resumes locally', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/');
    await openRecoveryFromLobby(page);
    const dataURL = await page.evaluate(async (digits) => {
      await document.fonts.ready;
      const c = document.createElement('canvas');
      c.width = 540;
      c.height = 780;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      for (let n = 0; n <= 9; n++) {
        ctx.strokeStyle = n % 3 ? '#c2c7ce' : '#707780';
        ctx.lineWidth = n % 3 ? 1 : 3;
        ctx.beginPath();
        ctx.moveTo(20, 120 + (n * 500) / 9);
        ctx.lineTo(520, 120 + (n * 500) / 9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(20 + (n * 500) / 9, 120);
        ctx.lineTo(20 + (n * 500) / 9, 620);
        ctx.stroke();
      }
      const values = [...digits];
      values[2] = 4;
      values.forEach((digit, i) => {
        if (!digit) return;
        ctx.fillStyle = i === 2 ? '#0984e3' : '#2d3436';
        ctx.font = `${i === 2 ? 300 : 600} 28px Outfit, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(digit), 20 + (((i % 9) + 0.5) * 500) / 9, 120 + ((Math.floor(i / 9) + 0.5) * 500) / 9);
      });
      return c.toDataURL('image/png');
    }, puzzle);
    await page.locator('input[type=file]').setInputFiles({
      name: 'disconnected-match.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataURL.split(',')[1], 'base64'),
    });
    await expect(page.locator('.recovery-crop')).toBeVisible();
    await page.getByRole('button', { name: '辨識棋盤', exact: true }).click();
    const board = page.locator('.recovery-grid');
    await expect(board.locator('.cell')).toHaveCount(81);
    await expect(board.locator('[data-cell="0"]')).toHaveText('5');
    await expect(board.locator('[data-cell="2"]')).toHaveText('4');
    await expect(board.locator('[data-cell="2"]')).toHaveClass(/user-val/);
    await expect(page.getByRole('button', { name: '開始遊戲' })).toBeDisabled();
    await page.getByLabel('確認數字正確').check();
    await page.getByRole('button', { name: '開始遊戲' }).click();
    await expect(page.locator('#recovery-title')).toHaveText('SUDOKU');
    await expect(page.locator('#recovery-screen')).not.toContainText('進度已儲存於此裝置');
    await expect(page.locator('#recovery-screen')).not.toContainText('不計入對戰勝負');
    await board.locator('[data-cell="2"]').click();
    await page.getByRole('button', { name: '清除', exact: true }).click();
    await expect(board.locator('[data-cell="2"]')).toHaveText('');
    await page.locator('.recovery-numpad button').filter({ hasText: /^4$/ }).click();
    await expect(board.locator('[data-cell="2"]')).toHaveText('4');
    await board.locator('[data-cell="3"]').click();
    await page.getByRole('button', { name: '筆記', exact: true }).click();
    await page.locator('.recovery-numpad button').filter({ hasText: /^6$/ }).click();
    await expect(board.locator('[data-cell="3"] .recovery-notes')).toHaveText('6');
    await page.getByRole('button', { name: '關閉', exact: true }).click();
    await page.reload();
    await openRecoveryFromLobby(page);
    await page.getByRole('button', { name: '繼續遊戲' }).click();
    await expect(board.locator('[data-cell="2"]')).toHaveText('4');
    await expect(board.locator('[data-cell="3"] .recovery-notes')).toHaveText('6');
    await expect(page.getByRole('button', { name: '筆記', exact: true })).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] || i === 2) continue;
      await board.locator(`[data-cell="${i}"]`).click();
      await page
        .locator('.recovery-numpad button')
        .filter({ hasText: new RegExp(`^${solution[i]}$`) })
        .click();
    }
    await expect(page.locator('.recovery-hud [role=status]')).toHaveText('完成');
    expect(await page.evaluate(() => localStorage.getItem('sudoku_duo_profile_v2'))).toBeNull();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: 'output/recovery/solo-complete-mobile.png', fullPage: true });
  });

  test('opens and resumes without a network connection', async ({ page, context }) => {
    await page.goto('/');
    await openRecoveryFromLobby(page);
    await expect(page.locator('#recovery-title')).toHaveText('截圖復盤');
    await context.setOffline(true);
    await expect(page.locator('#recovery-title')).toHaveText('截圖復盤');
    await expect(page.locator('input[type=file]')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#recovery-screen')).toHaveCount(0);
  });

  test('matches the original number keys at mobile and desktop sizes', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown).__e2e?.gs);
    const values = solution.map((digit, i) => (i === 2 || i === 3 ? 0 : digit));
    await page.evaluate(
      ({ values, solution }) => {
        (window as unknown).__e2e.initGame(99999, true, false, null, {
          id: 99999,
          mode: 'normal',
          stars: 1,
          puzzle: values,
          solution,
        });
        localStorage.setItem(
          'sudoku_recovery_session_v1',
          JSON.stringify({
            version: 1,
            cells: values.map((value) => ({ value, fixed: !!value, notes: [] })),
            solution,
            seconds: 0,
          }),
        );
      },
      { values, solution },
    );
    await expect(page.locator('#numpad .num-btn')).toHaveCount(9);
    const metrics = async (selector: string) =>
      page.locator(`${selector} .num-btn`).evaluateAll((keys) =>
        keys.map((key) => {
          const rect = key.getBoundingClientRect();
          const style = getComputedStyle(key);
          return {
            width: rect.width,
            height: rect.height,
            font: style.font,
            background: style.background,
            border: style.border,
            radius: style.borderRadius,
            opacity: style.opacity,
            completed: key.classList.contains('completed'),
            disabled: (key as HTMLButtonElement).disabled,
          };
        }),
      );
    const sizes = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ];
    const original = [];
    for (const size of sizes) {
      await page.setViewportSize(size);
      original.push(await metrics('#numpad'));
    }
    await page.evaluate(() => {
      document.getElementById('level-screen')!.style.display = 'flex';
      (document.querySelector('.game-container') as HTMLElement).style.display = 'none';
    });
    await openRecoveryFromLobby(page);
    await page.getByRole('button', { name: '繼續遊戲' }).click();
    for (const [i, size] of sizes.entries()) {
      await page.setViewportSize(size);
      expect(await metrics('.recovery-numpad')).toEqual(original[i]);
    }
    await page.setViewportSize(sizes[1]);
    await page.locator('.recovery-grid [data-cell="2"]').click();
    await page.locator('.recovery-numpad button').filter({ hasText: /^4$/ }).click();
    await expect(page.locator('.recovery-numpad button').filter({ hasText: /^4$/ })).toHaveClass(/completed/);
    await page.getByRole('button', { name: '清除', exact: true }).click();
    await expect(page.locator('.recovery-numpad button').filter({ hasText: /^4$/ })).toBeEnabled();
    await page.screenshot({ path: 'output/recovery/matching-number-keys.png', fullPage: true });
  });

  test('reads a real mobile match screenshot offline with remote fonts unavailable', async ({ page, context }) => {
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
    await page.goto('/');
    await openRecoveryFromLobby(page);
    await expect(page.locator('input[type=file]')).toBeEnabled();
    await context.setOffline(true);
    await page.locator('input[type=file]').setInputFiles('e2e/fixtures/recovery-duo-mobile.png');
    await page.getByRole('button', { name: '辨識棋盤', exact: true }).click();
    const board = page.locator('.recovery-grid');
    await expect(board.locator('.cell')).toHaveCount(81);
    const digits = (await board.locator('.cell').allTextContents()).map((n) => n || '0').join('');
    expect(digits).toBe('060090800089003000403085020301546009005320164000019750030002400100934002006008000');
    await expect(board.locator('.is-fixed')).toHaveCount(36);
    await expect(board.locator('[data-cell="1"]')).toHaveClass(/user-val/);
    await page.screenshot({ path: 'output/recovery/real-offline-check.png', fullPage: true });
    await page.getByLabel('確認數字正確').check();
    await page.getByRole('button', { name: '開始遊戲' }).click();
    await expect(page.locator('#recovery-title')).toHaveText('SUDOKU');
    await expect(page.locator('#recovery-screen')).not.toContainText('進度已儲存於此裝置');
    await expect(page.locator('#recovery-screen')).not.toContainText('不計入對戰勝負');
    await expect(page.locator('#recovery-screen [role=alert]')).toHaveCount(0);
    await page.screenshot({ path: 'output/recovery/clean-solo-mobile.png', fullPage: true });
  });
});
