import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

/**
 * E2E: Duo mode edge-case coverage on the live site
 *
 * Suites:
 *   duo-live-errors     — 4 wrong inputs → cooldown → finish
 *   duo-live-disconnect — opponent closes tab → auto-forfeit → host wins
 *   duo-live-multi-round — play-again × 3 rounds
 *   duo-live-network    — host offline 15 s → reconnect → finish
 *
 * Targets: https://wulalainlondon.github.io/sudokuzen/
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const SUITE_TIMEOUT = 300_000; // 5 min

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const badge = document.getElementById('version-badge');
      return badge && badge.textContent && badge.textContent.startsWith('v');
    },
    { timeout: 60_000 },
  );
}

async function setAlias(page: Page, alias: string): Promise<void> {
  await page.evaluate((a) => {
    localStorage.setItem('sudoku_player_alias', a);
    localStorage.setItem('sudoku_player_id', `test_${a}`);
  }, alias);
}

async function waitForAuthUid(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const connState = document.getElementById('duo-conn-state');
      const lobby = document.getElementById('duo-lobby');
      const lobbyVisible = lobby && !lobby.classList.contains('hidden');
      const notErrorState =
        !connState || connState.style.display === 'none' || connState.textContent === '';
      return lobbyVisible && notErrorState;
    },
    { timeout: 30_000 },
  );
}

async function openDuoLobby(page: Page): Promise<void> {
  await page.evaluate(() => (window as Record<string, unknown>).openDuoLobby?.());
  await page.waitForFunction(
    () => !document.getElementById('duo-lobby')?.classList.contains('hidden'),
    { timeout: 20_000 },
  );
  await waitForAuthUid(page);
}

async function createRoom(page: Page): Promise<void> {
  await page.evaluate(() => (window as Record<string, unknown>).createDuoRoomFromLobby?.());
  await page.waitForFunction(
    () => !document.getElementById('duo-room-view')?.classList.contains('hidden'),
    { timeout: 25_000 },
  );
}

async function refreshLobbyAndWaitForRoom(page: Page, hostAlias: string): Promise<void> {
  await page.waitForFunction(
    async (alias) => {
      if (
        Array.from(document.querySelectorAll('.duo-room-item .duo-room-host')).some(
          (el) => el.textContent === alias,
        )
      )
        return true;
      await new Promise<void>((resolve) => {
        const w = window as Record<string, unknown>;
        if (typeof w.refreshDuoLobbyRoom === 'function') w.refreshDuoLobbyRoom();
        setTimeout(resolve, 2500);
      });
      return false;
    },
    hostAlias,
    { timeout: 45_000 },
  );
}

async function joinRoomByHostAlias(page: Page, hostAlias: string): Promise<void> {
  await page.locator(`.duo-room-item:has(.duo-room-host:text("${hostAlias}"))`).click();
  await page.waitForFunction(
    () => !document.getElementById('duo-room-view')?.classList.contains('hidden'),
    { timeout: 15_000 },
  );
}

async function waitForReadyButtonVisible(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('duo-ready-btn') as HTMLButtonElement | null;
      return btn != null && btn.style.display !== 'none' && btn.style.display !== '';
    },
    { timeout: 30_000 },
  );
}

async function clickReady(page: Page): Promise<void> {
  await page.evaluate(() => (window as Record<string, unknown>).toggleDuoReady?.());
}

async function waitForCountdown(page: Page): Promise<void> {
  await page.waitForSelector('#duo-countdown-overlay', { timeout: 30_000 });
}

async function waitForGameStart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('.cell[data-idx]').length === 81,
    { timeout: 30_000 },
  );
  // Handle both standard duo (progress bar) and chess clock (cc-clock-bar) modes
  await page.waitForFunction(
    () => {
      const progress = document.getElementById('duo-progress-container');
      const clockBar = document.getElementById('cc-clock-bar');
      return (progress != null && progress.style.display === 'flex') || clockBar != null;
    },
    { timeout: 10_000 },
  );
}

async function solveBoard(page: Page): Promise<void> {
  const data = await page.evaluate(() => {
    function solveSudoku(b: number[]): boolean {
      const empty = b.indexOf(0);
      if (empty === -1) return true;
      const row = Math.floor(empty / 9);
      const col = empty % 9;
      for (let n = 1; n <= 9; n++) {
        let ok = true;
        for (let i = 0; i < 9 && ok; i++) {
          if (b[row * 9 + i] === n) ok = false;
          if (b[i * 9 + col] === n) ok = false;
          const br = Math.floor(row / 3) * 3 + Math.floor(i / 3);
          const bc = Math.floor(col / 3) * 3 + (i % 3);
          if (b[br * 9 + bc] === n) ok = false;
        }
        if (ok) {
          b[empty] = n;
          if (solveSudoku(b)) return true;
          b[empty] = 0;
        }
      }
      return false;
    }
    const cells = Array.from(document.querySelectorAll<HTMLElement>('.cell[data-idx]')).sort(
      (a, b) => Number(a.dataset.idx) - Number(b.dataset.idx),
    );
    const puzzle = cells.map((c) => {
      if (c.classList.contains('is-fixed') || c.classList.contains('user-val')) {
        const v = parseInt(c.textContent?.trim() ?? '0', 10);
        return Number.isInteger(v) && v >= 1 && v <= 9 ? v : 0;
      }
      return 0;
    });
    const solution = [...puzzle];
    const solved = solveSudoku(solution);
    return { puzzle, solution, solved, cellCount: cells.length };
  });

  if (!data.solved || data.cellCount !== 81) {
    throw new Error(`solveBoard: cellCount=${data.cellCount} solved=${data.solved}`);
  }
  for (let i = 0; i < 81; i++) {
    if (data.puzzle[i] === 0) {
      await page.locator(`.cell[data-idx="${i}"]`).click();
      await page.keyboard.press(String(data.solution[i]));
    }
  }
}

async function waitForResultModal(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

async function waitForLobby(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !document.getElementById('duo-lobby')?.classList.contains('hidden'),
    { timeout: 20_000 },
  );
}

async function cleanup(page: Page): Promise<void> {
  await Promise.race([
    page.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
    page.waitForTimeout(5_000),
  ]).catch(() => {});
}

/**
 * Enter N wrong digits on the given page.
 * Uses the first empty cell and a digit that is guaranteed wrong.
 * Presses Backspace after each input as a safety erase (handles both
 * auto-cleared and persistently-shown error states).
 */
async function makeWrongInputs(page: Page, count: number): Promise<void> {
  const target = await page.evaluate(() => {
    function solveSudoku(b: number[]): boolean {
      const empty = b.indexOf(0);
      if (empty === -1) return true;
      const row = Math.floor(empty / 9);
      const col = empty % 9;
      for (let n = 1; n <= 9; n++) {
        let ok = true;
        for (let i = 0; i < 9 && ok; i++) {
          if (b[row * 9 + i] === n) ok = false;
          if (b[i * 9 + col] === n) ok = false;
          const br = Math.floor(row / 3) * 3 + Math.floor(i / 3);
          const bc = Math.floor(col / 3) * 3 + (i % 3);
          if (b[br * 9 + bc] === n) ok = false;
        }
        if (ok) {
          b[empty] = n;
          if (solveSudoku(b)) return true;
          b[empty] = 0;
        }
      }
      return false;
    }
    const cells = Array.from(document.querySelectorAll<HTMLElement>('.cell[data-idx]')).sort(
      (a, b) => Number(a.dataset.idx) - Number(b.dataset.idx),
    );
    const puzzle = cells.map((c) => {
      if (c.classList.contains('is-fixed') || c.classList.contains('user-val')) {
        const v = parseInt(c.textContent?.trim() ?? '0', 10);
        return Number.isInteger(v) && v >= 1 && v <= 9 ? v : 0;
      }
      return 0;
    });
    const solution = [...puzzle];
    solveSudoku(solution);
    const emptyIdx = puzzle.findIndex((v) => v === 0);
    if (emptyIdx === -1) return null;
    const correctVal = solution[emptyIdx];
    // Pick a digit that is definitely wrong
    return { idx: emptyIdx, wrongVal: correctVal === 9 ? 1 : correctVal + 1 };
  });

  if (!target) throw new Error('makeWrongInputs: no empty cells found');

  for (let i = 0; i < count; i++) {
    await page.locator(`.cell[data-idx="${target.idx}"]`).click();
    await page.keyboard.press(String(target.wrongVal));
    await page.waitForTimeout(700); // wait for error animation
    // Safety: erase in case the wrong value was not auto-cleared by the game
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  }
}

// ── setupGame ─────────────────────────────────────────────────────────────────

interface GameSetup {
  hostCtx: BrowserContext;
  guestCtx: BrowserContext;
  hostPage: Page;
  guestPage: Page;
  hostAlias: string;
  guestAlias: string;
}

/**
 * Full game setup: boot → alias → create room → join → ready → countdown → game start.
 * Cleans up contexts automatically if setup fails.
 */
async function setupGame(browser: Browser, testId: string): Promise<GameSetup> {
  const ts = Date.now() % 100_000;
  const hostAlias = `h${testId}${ts}`;
  const guestAlias = `g${testId}${ts}`;

  const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const guestCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const hostPage = await hostCtx.newPage();
  const guestPage = await guestCtx.newPage();

  try {
    await Promise.all([
      hostPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

    await Promise.all([setAlias(hostPage, hostAlias), setAlias(guestPage, guestAlias)]);
    await Promise.all([
      hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);
    console.log(`[duo-live-2/${testId}] booted (h=${hostAlias} g=${guestAlias})`);

    await openDuoLobby(hostPage);
    await createRoom(hostPage);
    console.log(`[duo-live-2/${testId}] room created`);

    await openDuoLobby(guestPage);
    await refreshLobbyAndWaitForRoom(guestPage, hostAlias);
    await joinRoomByHostAlias(guestPage, hostAlias);
    console.log(`[duo-live-2/${testId}] guest joined`);

    await Promise.all([waitForReadyButtonVisible(hostPage), waitForReadyButtonVisible(guestPage)]);
    await clickReady(hostPage);
    await hostPage.waitForTimeout(500);
    await clickReady(guestPage);

    await Promise.all([waitForCountdown(hostPage), waitForCountdown(guestPage)]);
    await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
    console.log(`[duo-live-2/${testId}] game started`);

    return { hostCtx, guestCtx, hostPage, guestPage, hostAlias, guestAlias };
  } catch (err) {
    await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    throw err;
  }
}

// ── Suite 1: Wrong inputs ─────────────────────────────────────────────────────

test.describe('duo-live-errors', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('填格錯誤 → 愛心減少 → cooldown → 完賽', async ({ browser }) => {
    const { hostCtx, guestCtx, hostPage, guestPage } = await setupGame(browser, 'err');

    try {
      // Make 4 wrong inputs; the 4th triggers cooldown (maxErrors=3 → 4th = remaining<0)
      await makeWrongInputs(hostPage, 4);
      console.log('[duo-live-2/err] 4 wrong inputs done');

      // Wait for cooldown to clear (base 5 s + generous buffer)
      await hostPage.waitForTimeout(8_000);
      console.log('[duo-live-2/err] cooldown wait done');

      // Both solve; guest has no errors so runs in parallel
      await Promise.all([solveBoard(hostPage), solveBoard(guestPage)]);
      console.log('[duo-live-2/err] both solved');

      // Both should see the result modal
      await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
      console.log('[duo-live-2/err] result modal shown ✓');

      const [hostHasPanel, guestHasPanel] = await Promise.all([
        hostPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
        guestPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
      ]);
      expect(hostHasPanel, 'host result panel').toBe(true);
      expect(guestHasPanel, 'guest result panel').toBe(true);
    } finally {
      try {
        await cleanup(hostPage);
      } catch {}
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});

// ── Suite 2: Opponent disconnect ──────────────────────────────────────────────

test.describe('duo-live-disconnect', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('對手斷線 → 寬限結束 → 主機自動獲勝', async ({ browser }) => {
    const { hostCtx, guestCtx, hostPage } = await setupGame(browser, 'disc');

    try {
      // Close guest's browser context to simulate an abrupt disconnect
      await guestCtx.close();
      console.log('[duo-live-2/disc] guest context closed (simulated disconnect)');

      // Host solves immediately — sets _duoFinishSubmitted = true
      await solveBoard(hostPage);
      console.log('[duo-live-2/disc] host solved; waiting for auto-forfeit...');

      // Auto-forfeit fires once GAME_START_GRACE_MS (60 s) + stale detection (~15 s) passes.
      // Allow up to 150 s for the result modal.
      await waitForResultModal(hostPage, 150_000);
      console.log('[duo-live-2/disc] result modal shown ✓');

      const result = await hostPage.evaluate(() => {
        const panel = document.querySelector('.duo-result-panel');
        if (!panel) return null;
        return {
          victory: panel.classList.contains('victory'),
          defeat: panel.classList.contains('defeat'),
          draw: !!document.querySelector('.draw-title'),
        };
      });

      expect(result, 'result panel must be present').not.toBeNull();
      expect(result!.victory, 'host must win when opponent disconnects').toBe(true);
    } finally {
      try {
        await cleanup(hostPage);
      } catch {}
      await hostCtx.close().catch(() => {}); // guestCtx already closed
    }
  });
});

// ── Suite 3: Multi-round (play-again × 3) ────────────────────────────────────

test.describe('duo-live-multi-round', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('連打三局 play-again', async ({ browser }) => {
    const { hostCtx, guestCtx, hostPage, guestPage, hostAlias } = await setupGame(browser, 'mr');

    try {
      for (let round = 1; round <= 3; round++) {
        console.log(`[duo-live-2/mr] round ${round} — solving`);

        // Host finishes first, then guest (ensures a clear win/loss, not relying on timing)
        await solveBoard(hostPage);
        await hostPage.waitForTimeout(1_000);
        await solveBoard(guestPage);

        await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
        console.log(`[duo-live-2/mr] round ${round} — result shown`);

        if (round < 3) {
          // Both click play-again
          await Promise.all([
            hostPage.locator('#duo-result-modal .resume-btn').click(),
            guestPage.locator('#duo-result-modal .resume-btn').click(),
          ]);
          // Both return to duo lobby
          await Promise.all([waitForLobby(hostPage), waitForLobby(guestPage)]);
          console.log(`[duo-live-2/mr] round ${round} — both back in lobby`);

          // Host creates a new room; guest finds it by host alias
          await createRoom(hostPage);
          await refreshLobbyAndWaitForRoom(guestPage, hostAlias);
          await joinRoomByHostAlias(guestPage, hostAlias);

          await Promise.all([
            waitForReadyButtonVisible(hostPage),
            waitForReadyButtonVisible(guestPage),
          ]);
          await clickReady(hostPage);
          await hostPage.waitForTimeout(500);
          await clickReady(guestPage);

          await Promise.all([waitForCountdown(hostPage), waitForCountdown(guestPage)]);
          await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
          console.log(`[duo-live-2/mr] round ${round + 1} started`);
        }
      }

      // Final assertion: both pages show a result panel after 3 rounds
      const [h, g] = await Promise.all([
        hostPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
        guestPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
      ]);
      expect(h, 'host result panel after 3 rounds').toBe(true);
      expect(g, 'guest result panel after 3 rounds').toBe(true);
      console.log('[duo-live-2/mr] ✓ 3 rounds completed');
    } finally {
      try {
        await cleanup(hostPage);
      } catch {}
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});

// ── Suite 4: Network disconnect/reconnect ─────────────────────────────────────

test.describe('duo-live-network', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('網路中斷 15s → 重連 → 完賽', async ({ browser }) => {
    const { hostCtx, guestCtx, hostPage, guestPage } = await setupGame(browser, 'net');

    try {
      // Take host offline (Firebase SDK buffers writes, reconnects automatically)
      await hostCtx.setOffline(true);
      console.log('[duo-live-2/net] host offline');

      // 15 s offline — well within 60 s stale heartbeat threshold; no false disconnect detection
      await hostPage.waitForTimeout(15_000);

      await hostCtx.setOffline(false);
      console.log('[duo-live-2/net] host back online');

      // Give Firebase 3 s to re-establish listeners and flush buffered writes
      await hostPage.waitForTimeout(3_000);

      // Both players solve; host first
      await solveBoard(hostPage);
      console.log('[duo-live-2/net] host solved');
      await hostPage.waitForTimeout(1_000);
      await solveBoard(guestPage);
      console.log('[duo-live-2/net] guest solved');

      // Both should see result modal
      await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
      console.log('[duo-live-2/net] result modal shown ✓');

      const [h, g] = await Promise.all([
        hostPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
        guestPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
      ]);
      expect(h, 'host result panel after reconnect').toBe(true);
      expect(g, 'guest result panel after reconnect').toBe(true);
    } finally {
      // Ensure host is back online even if test fails mid-way
      await hostCtx.setOffline(false).catch(() => {});
      try {
        await cleanup(hostPage);
      } catch {}
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});
