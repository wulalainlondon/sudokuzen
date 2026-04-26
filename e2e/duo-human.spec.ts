import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo mode — human-paced concurrent play
 *
 * Two browser contexts solve the same puzzle simultaneously at human-like speed.
 * Key validations:
 *   1. Opponent progress bar updates during the game (not stuck at 0%) — tests Bug B fix
 *   2. No "opponent disconnected" toast fires during normal play
 *   3. Result modal shows correct winner / loser
 *
 * Targets: https://wulalainlondon.github.io/sudokuzen/
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const SUITE_TIMEOUT = 480_000; // 8 min — human pace is slow
const TS = Date.now() % 100_000;
const HOST_ALIAS = `hh${TS}`;
const GUEST_ALIAS = `gh${TS}`;

// ── Helpers (self-contained, mirrors duo-live.spec.ts pattern) ────────

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
    localStorage.setItem('sudoku_e2e_mode', '1');
  }, alias);
}

async function waitForAuthUid(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
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
  await page.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
    timeout: 20_000,
  });
  await waitForAuthUid(page);
}

async function createRoom(page: Page): Promise<void> {
  await page.evaluate(() => (window as Record<string, unknown>).createDuoRoomFromLobby?.());
  await page.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
    timeout: 25_000,
  });
}

async function refreshLobbyAndWaitForRoom(page: Page, hostAlias: string): Promise<void> {
  await page.waitForFunction(
    async (alias) => {
      if (Array.from(document.querySelectorAll('.duo-room-item .duo-room-host')).some((el) => el.textContent === alias))
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
  await page.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
    timeout: 15_000,
  });
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
  await page.waitForFunction(() => document.querySelectorAll('.cell[data-idx]').length === 81, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => {
      const p = document.getElementById('duo-progress-container');
      return p != null && p.style.display === 'flex';
    },
    { timeout: 10_000 },
  );
}

async function waitForResultModal(page: Page): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout: 60_000 });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

async function cleanup(page: Page): Promise<void> {
  await Promise.race([
    page.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
    page.waitForTimeout(5_000),
  ]).catch(() => {});
}

/**
 * Solve the board at human-like pace.
 *
 * baseDelayMs  — base delay per cell (actual delay is baseDelayMs ± 50%)
 * thinkEvery   — insert a 1.5–3s "thinking pause" every N cells
 *
 * Also waits 3.5s before the first cell fill so duoSetPlaying CF has time
 * to complete — avoids the race where submitDuoFinish fires before room
 * status becomes 'playing'.
 */
async function humanSolve(page: Page, opts: { baseDelayMs: number; thinkEvery: number }): Promise<void> {
  const { baseDelayMs, thinkEvery } = opts;

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
    return { puzzle, solution, solved: solveSudoku(solution), cellCount: cells.length };
  });

  if (!data.solved || data.cellCount !== 81) {
    throw new Error(`humanSolve: failed — cellCount=${data.cellCount}, solved=${data.solved}`);
  }

  // Buffer: let duoSetPlaying CF complete before first cell fill
  await page.waitForTimeout(3500);

  let cellsFilled = 0;
  for (let i = 0; i < 81; i++) {
    if (data.puzzle[i] !== 0) continue;

    await page.locator(`.cell[data-idx="${i}"]`).click();
    await page.keyboard.press(String(data.solution[i]));
    cellsFilled++;

    const isThinkPause = cellsFilled % thinkEvery === 0;
    const delay = isThinkPause
      ? 1500 + Math.floor(Math.random() * 1500) // 1.5–3s thinking pause
      : Math.floor(baseDelayMs * (0.6 + Math.random() * 0.8)); // baseDelayMs ± 40%
    await page.waitForTimeout(delay);
  }
}

/**
 * Returns the opponent progress percentage (0–100) visible on this page.
 * Reads #duo-progress-opp-pct which shows "X%".
 */
async function getOppProgressPct(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.getElementById('duo-progress-opp-pct');
    return parseInt(el?.textContent ?? '0', 10) || 0;
  });
}

// ── Suite ─────────────────────────────────────────────────────────────

test.describe('duo-human', () => {
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
    try {
      await cleanup(hostPage);
    } catch {
      /* ignore */
    }
    try {
      await cleanup(guestPage);
    } catch {
      /* ignore */
    }
    await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
  });

  test('人類節奏雙人對戰 — 進度即時同步 + 勝負正確', async () => {
    // ── 1. Boot ────────────────────────────────────────────────────────
    await Promise.all([
      hostPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

    await Promise.all([setAlias(hostPage, HOST_ALIAS), setAlias(guestPage, GUEST_ALIAS)]);
    await Promise.all([
      hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
    ]);
    await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);
    console.log('[duo-human] both pages booted');

    // ── 2. Room setup ──────────────────────────────────────────────────
    await openDuoLobby(hostPage);
    await createRoom(hostPage);
    console.log('[duo-human] host created room');

    await openDuoLobby(guestPage);
    await refreshLobbyAndWaitForRoom(guestPage, HOST_ALIAS);
    await joinRoomByHostAlias(guestPage, HOST_ALIAS);
    console.log('[duo-human] guest joined room');

    await Promise.all([waitForReadyButtonVisible(hostPage), waitForReadyButtonVisible(guestPage)]);

    await clickReady(hostPage);
    await hostPage.waitForTimeout(400);
    await clickReady(guestPage);
    console.log('[duo-human] both ready');

    // ── 3. Countdown + game start ─────────────────────────────────────
    await Promise.all([waitForCountdown(hostPage), waitForCountdown(guestPage)]);
    await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
    console.log('[duo-human] game started on both pages');

    // ── 4. Arm progress monitors (browser-side, resolve when opp > 0%) ─
    // These run concurrently with solving — proves progress syncs in real-time.
    const hostSeesGuestProgress = hostPage.waitForFunction(
      () => parseInt(document.getElementById('duo-progress-opp-pct')?.textContent ?? '0', 10) > 0,
      { timeout: 90_000 },
    );
    const guestSeesHostProgress = guestPage.waitForFunction(
      () => parseInt(document.getElementById('duo-progress-opp-pct')?.textContent ?? '0', 10) > 0,
      { timeout: 90_000 },
    );

    // ── 5. Both players solve concurrently at human pace ──────────────
    // Host: ~150ms/cell → finishes first (wins)
    // Guest: ~380ms/cell → finishes second (loses)
    console.log('[duo-human] starting concurrent human-pace solve…');
    await Promise.all([
      humanSolve(hostPage, { baseDelayMs: 150, thinkEvery: 14 }),
      humanSolve(guestPage, { baseDelayMs: 380, thinkEvery: 10 }),
    ]);
    console.log('[duo-human] both players finished solving');

    // ── 6. Verify opponent progress was seen during the game ──────────
    // Both monitors should already have resolved by now.
    // If either throws, Bug B regressed (progress stuck at 0%).
    await Promise.all([hostSeesGuestProgress, guestSeesHostProgress]);
    const finalHostSeesPct = await getOppProgressPct(hostPage);
    const finalGuestSeesPct = await getOppProgressPct(guestPage);
    console.log(
      `[duo-human] final opp pct — host sees guest: ${finalHostSeesPct}%, guest sees host: ${finalGuestSeesPct}%`,
    );
    expect(finalHostSeesPct, 'host should see guest progress > 0%').toBeGreaterThan(0);
    expect(finalGuestSeesPct, 'guest should see host progress > 0%').toBeGreaterThan(0);

    // ── 7. Both result modals appear ──────────────────────────────────
    await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
    console.log('[duo-human] result modals appeared on both pages');

    // ── 8. Verify no disconnect toast fired during the game ───────────
    // If auto-forfeit had fired, the result modal would not appear (game would
    // end differently or show an error). Reaching this point confirms no disconnect.
    // Double-check: feedback toast should not mention disconnect.
    const hostToast = await hostPage
      .evaluate(() => document.getElementById('feedback-toast')?.textContent ?? '')
      .catch(() => '');
    const guestToast = await guestPage
      .evaluate(() => document.getElementById('feedback-toast')?.textContent ?? '')
      .catch(() => '');
    expect(hostToast, 'host should not see disconnect toast').not.toContain('斷線');
    expect(guestToast, 'guest should not see disconnect toast').not.toContain('斷線');

    // ── 9. Verify win / loss outcome ──────────────────────────────────
    const hostResult = await hostPage.evaluate(() => {
      const panel = document.querySelector('.duo-result-panel');
      if (!panel) return null;
      return {
        victory: panel.classList.contains('victory'),
        defeat: panel.classList.contains('defeat'),
        draw: !!document.querySelector('.draw-title'),
      };
    });
    const guestResult = await guestPage.evaluate(() => {
      const panel = document.querySelector('.duo-result-panel');
      if (!panel) return null;
      return {
        victory: panel.classList.contains('victory'),
        defeat: panel.classList.contains('defeat'),
        draw: !!document.querySelector('.draw-title'),
      };
    });

    console.log('[duo-human] host result:', JSON.stringify(hostResult));
    console.log('[duo-human] guest result:', JSON.stringify(guestResult));

    expect(hostResult, 'host result panel must be present').not.toBeNull();
    expect(guestResult, 'guest result panel must be present').not.toBeNull();

    if (hostResult!.draw) {
      // Extremely rare simultaneous finish — draw is valid
      expect(guestResult!.draw).toBe(true);
    } else {
      // Host solved faster → host wins, guest loses
      expect(hostResult!.victory, 'host (faster solver) should win').toBe(true);
      expect(guestResult!.defeat, 'guest (slower solver) should lose').toBe(true);
    }

    console.log('[duo-human] ✓ all assertions passed');
  });
});
