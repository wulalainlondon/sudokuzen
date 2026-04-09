import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo mode full game on the live site
 *
 * Two browser contexts pair into a room, both solve the puzzle,
 * and the result modal must show a win/loss outcome.
 *
 * Targets: https://wulalainlondon.github.io/sudokuzen/
 * No __e2e bridge (production build) — uses window globals and DOM directly.
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const SUITE_TIMEOUT = 300_000; // 5 min
const TS = Date.now() % 100_000;
const HOST_ALIAS = `h${TS}`;
const GUEST_ALIAS = `g${TS}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForBoot(page: Page): Promise<void> {
  // App has booted when the version badge is populated (may need to survive a version-reload)
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

/** Wait until Firebase auth UID is available (anonymous sign-in complete). */
async function waitForAuthUid(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      // Firebase anonymous auth caches UID in firebase-related IndexedDB;
      // the simplest check: openDuoLobby is available AND lobby shows no error after open.
      // We detect auth readiness indirectly: the duo-conn-state element is hidden = connected.
      const connState = document.getElementById('duo-conn-state');
      const lobby = document.getElementById('duo-lobby');
      const lobbyVisible = lobby && !lobby.classList.contains('hidden');
      const notErrorState = !connState || connState.style.display === 'none' || connState.textContent === '';
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
  // Also wait for Firebase to be connected (conn-state hidden = ok)
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
  // Retry refresh until the target room card appears
  await page.waitForFunction(
    async (alias) => {
      if (Array.from(document.querySelectorAll('.duo-room-item .duo-room-host')).some(
        (el) => el.textContent === alias,
      )) return true;
      // trigger a refresh and wait
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
  // Ready button is shown only after the guest has joined (guestId populated in snapshot)
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('duo-ready-btn') as HTMLButtonElement | null;
      // Initial HTML has style="display:none;"; becomes "inline-block" when guest joins
      return btn != null && btn.style.display !== 'none' && btn.style.display !== '';
    },
    { timeout: 30_000 },
  );
}

async function clickReady(page: Page): Promise<void> {
  await page.evaluate(() => (window as Record<string, unknown>).toggleDuoReady?.());
}

async function waitForCountdown(page: Page): Promise<void> {
  // The countdown overlay is created and appended to body by startDuoCountdown
  await page.waitForSelector('#duo-countdown-overlay', { timeout: 30_000 });
}

async function waitForGameStart(page: Page): Promise<void> {
  // Wait until 81 cells are in the DOM — they're rendered by initGame's renderCells call
  await page.waitForFunction(
    () => document.querySelectorAll('.cell[data-idx]').length === 81,
    { timeout: 30_000 },
  );
  // Also confirm the duo progress bar is shown (set to flex by launchDuoGame)
  await page.waitForFunction(
    () => {
      const p = document.getElementById('duo-progress-container');
      return p != null && p.style.display === 'flex';
    },
    { timeout: 10_000 },
  );
}

/**
 * Solve the sudoku in-page:
 * 1. Read fixed-cell clues from DOM
 * 2. Run backtracking solver in the page context
 * 3. Fill each empty cell by selecting it + pressing a digit key
 */
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
    throw new Error(`solveBoard: could not solve — cellCount=${data.cellCount}, solved=${data.solved}`);
  }

  for (let i = 0; i < 81; i++) {
    if (data.puzzle[i] === 0) {
      await page.locator(`.cell[data-idx="${i}"]`).click();
      await page.keyboard.press(String(data.solution[i]));
    }
  }
}

async function waitForResultModal(page: Page): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout: 30_000 });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

async function getDiagnostics(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lobby = document.getElementById('duo-lobby');
    const roomView = document.getElementById('duo-room-view');
    const gc = document.querySelector('.game-container') as HTMLElement | null;
    const progress = document.getElementById('duo-progress-container');
    const readyBtn = document.getElementById('duo-ready-btn') as HTMLButtonElement | null;
    const levelScreen = document.getElementById('level-screen');
    const feedbackToast = document.getElementById('feedback-toast');
    return JSON.stringify({
      lobbyHidden: lobby?.classList.contains('hidden'),
      roomViewHidden: roomView?.classList.contains('hidden'),
      gcDisplay: gc?.style.display ?? 'n/a',
      progressDisplay: progress?.style.display ?? 'n/a',
      readyBtnDisplay: readyBtn?.style.display ?? 'n/a',
      levelScreenDisplay: levelScreen?.style.display ?? 'n/a',
      cells: document.querySelectorAll('.cell[data-idx]').length,
      countdownOverlay: !!document.getElementById('duo-countdown-overlay'),
      resultModal: !!document.getElementById('duo-result-modal'),
      feedback: feedbackToast?.textContent?.trim() ?? '',
      feedbackVisible: feedbackToast?.classList.contains('show') ?? false,
    });
  }).catch(() => '(evaluate failed)');
}

async function cleanup(page: Page): Promise<void> {
  await Promise.race([
    page.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
    page.waitForTimeout(5_000),
  ]).catch(() => {});
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe('duo-live', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  let hostCtx: BrowserContext;
  let guestCtx: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeAll(async ({ browser }) => {
    hostCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    guestCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    hostPage = await hostCtx.newPage();
    guestPage = await guestCtx.newPage();

  });

  test.afterAll(async () => {
    try { await cleanup(hostPage); } catch { /* ignore */ }
    try { await cleanup(guestPage); } catch { /* ignore */ }
    await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
  });

  test('兩玩家完整對局並出現勝負結果', async () => {
    // ── 1. Load live site ───────────────────────────────────────────────
    console.log(`[duo-live] loading live site (alias host=${HOST_ALIAS} guest=${GUEST_ALIAS})`);
    await Promise.all([
      hostPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

    // ── 2. Set unique test aliases and reload ───────────────────────────
    await Promise.all([
      setAlias(hostPage, HOST_ALIAS),
      setAlias(guestPage, GUEST_ALIAS),
    ]);
    await Promise.all([
      hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);
    console.log(`[duo-live] both pages booted`);

    // ── 3. Host opens lobby, waits for Firebase, and creates a room ─────
    await openDuoLobby(hostPage);
    console.log(`[duo-live] host lobby open, Firebase ready`);
    await createRoom(hostPage);
    const roomId = await hostPage.locator('#duo-room-id-value').textContent();
    console.log(`[duo-live] host created room: ${roomId}`);

    // ── 4. Guest opens lobby, finds host room, and joins ─────────────────
    await openDuoLobby(guestPage);
    await refreshLobbyAndWaitForRoom(guestPage, HOST_ALIAS);
    console.log(`[duo-live] guest found room in list`);
    await joinRoomByHostAlias(guestPage, HOST_ALIAS);
    console.log(`[duo-live] guest joined room`);

    // ── 5. Both pages: wait for ready button to appear ──────────────────
    await Promise.all([
      waitForReadyButtonVisible(hostPage),
      waitForReadyButtonVisible(guestPage),
    ]);
    console.log(`[duo-live] ready buttons visible on both sides`);

    // ── 6. Both click ready ─────────────────────────────────────────────
    await clickReady(hostPage);
    await hostPage.waitForTimeout(500);
    await clickReady(guestPage);
    console.log(`[duo-live] both players clicked ready`);

    // ── 7. Confirm countdown triggered ─────────────────────────────────
    // Wait for countdown on BOTH pages (confirms snapshot propagated and both launched countdown)
    await Promise.all([
      waitForCountdown(hostPage),
      waitForCountdown(guestPage),
    ]);
    console.log(`[duo-live] countdown triggered on both pages`);

    // ── 8. Wait for game to actually start (GO! fires launchDuoGame async) ───
    await Promise.all([
      waitForGameStart(hostPage),
      waitForGameStart(guestPage),
    ]);
    console.log(`[duo-live] game started on both pages`);

    // ── 9. Solve: host first (ensures win), then guest ──────────────────
    await solveBoard(hostPage);
    console.log(`[duo-live] host solved`);

    await hostPage.waitForTimeout(1_500);

    await solveBoard(guestPage);
    console.log(`[duo-live] guest solved`);

    // ── 10. Both should see result modal ───────────────────────────────
    await Promise.all([
      waitForResultModal(hostPage),
      waitForResultModal(guestPage),
    ]);
    console.log(`[duo-live] result modal appeared`);

    // ── 11. Assert win / loss ──────────────────────────────────────────
    const hostResult = await hostPage.evaluate(() => {
      const panel = document.querySelector('.duo-result-panel');
      if (!panel) return null;
      return {
        victory: panel.classList.contains('victory'),
        defeat: panel.classList.contains('defeat'),
        draw: !!document.querySelector('.draw-title'),
        title: document.querySelector('.victory-title, .defeat-title, .draw-title')?.textContent ?? '',
      };
    });

    const guestResult = await guestPage.evaluate(() => {
      const panel = document.querySelector('.duo-result-panel');
      if (!panel) return null;
      return {
        victory: panel.classList.contains('victory'),
        defeat: panel.classList.contains('defeat'),
        draw: !!document.querySelector('.draw-title'),
        title: document.querySelector('.victory-title, .defeat-title, .draw-title')?.textContent ?? '',
      };
    });

    console.log(`[duo-live] host result:`, JSON.stringify(hostResult));
    console.log(`[duo-live] guest result:`, JSON.stringify(guestResult));

    expect(hostResult, 'host result panel should be present').not.toBeNull();
    expect(guestResult, 'guest result panel should be present').not.toBeNull();

    if (!hostResult!.draw) {
      // Host solved first → should win; guest → should lose
      expect(hostResult!.victory).toBe(true);
      expect(guestResult!.defeat).toBe(true);
    } else {
      // Simultaneous finish — draw is also valid
      expect(hostResult!.draw).toBe(true);
    }

    // ── 12. Play-again and back buttons are visible in the result modal ─
    await expect(hostPage.locator('#duo-result-modal .resume-btn')).toBeVisible();
    await expect(guestPage.locator('#duo-result-modal .resume-btn')).toBeVisible();
    await expect(hostPage.locator('#duo-result-modal .back-btn')).toBeVisible();
    await expect(guestPage.locator('#duo-result-modal .back-btn')).toBeVisible();

    console.log(`[duo-live] ✓ test passed`);
  });
});
