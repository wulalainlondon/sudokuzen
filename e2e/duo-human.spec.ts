import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo mode — human-paced concurrent play
 *
 * Two browser contexts solve the same puzzle simultaneously, simulating real players:
 *   Phase 1 — both scan the board and fill candidates (pencil marks) concurrently
 *   Phase 2 — both fill answers one-by-one at human speed (host faster, guest slower)
 *
 * Key validations:
 *   1. Game lasts > 120s from start (past grace period 60s + stale window 60s)
 *      → proves heartbeats survive long enough that auto-forfeit never fires
 *   2. Opponent progress bar updates during the game (not stuck at 0%) — Bug B regression guard
 *   3. No "斷線" disconnect toast fires during normal play
 *   4. Result modal shows correct winner / loser
 *
 * Timing design (assuming ~45 empty cells, ~3.5 avg candidates per cell):
 *   Phase 1 both concurrent:  ~35s
 *   Phase 2 host answers:     ~60s  → host total ~100s from game start
 *   Phase 2 guest answers:   ~115s  → guest total ~155s from game start
 *   Elapsed when both done:   ~155s > 120s  ✓
 *
 * Targets: https://wulalainlondon.github.io/sudokuzen/
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const SUITE_TIMEOUT = 720_000; // 12 min
const TS = Date.now() % 100_000;
const HOST_ALIAS = `hh${TS}`;
const GUEST_ALIAS = `gh${TS}`;

// ── Helpers ───────────────────────────────────────────────────────────

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
  await page.waitForFunction(() => document.querySelectorAll('.cell[data-idx]').length === 81, { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const p = document.getElementById('duo-progress-container');
      return p != null && p.style.display === 'flex';
    },
    { timeout: 10_000 },
  );
}

async function waitForResultModal(page: Page): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout: 300_000 });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

async function cleanup(page: Page): Promise<void> {
  await Promise.race([
    page.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
    page.waitForTimeout(5_000),
  ]).catch(() => {});
}

/**
 * Read the opponent progress percentage shown in the UI.
 * #duo-progress-opp-pct contains "X%" text set by updateDuoProgressUI().
 */
async function getOppProgressPct(page: Page): Promise<number> {
  return page.evaluate(() => parseInt(document.getElementById('duo-progress-opp-pct')?.textContent ?? '0', 10) || 0);
}

/**
 * Human-like solve in two phases:
 *
 * Phase 1 — candidates:
 *   Enable notes mode, scan every empty cell and pencil in all valid
 *   candidates (digits not ruled out by row/col/box constraints).
 *   Pacing: ~100ms per digit, candidateDelayMs between cells.
 *
 * Phase 2 — answers:
 *   Disable notes mode, fill each empty cell with the correct answer.
 *   Pacing: answerDelayMs per cell (± 40%), with longer thinking pauses
 *   every thinkEvery cells.
 *
 * A 3.5s buffer before phase 1 ensures duoSetPlaying CF has completed
 * before the first cell interaction — prevents submitDuoFinish from
 * racing against a room still in 'countdown' status.
 */
async function humanSolve(
  page: Page,
  opts: { candidateDelayMs: number; answerDelayMs: number; thinkEvery: number },
): Promise<void> {
  const { candidateDelayMs, answerDelayMs, thinkEvery } = opts;

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
    if (!solveSudoku(solution)) return { puzzle, solution, candidates: [], solved: false, cellCount: cells.length };

    // Compute valid candidates for each empty cell (basic elimination only)
    const candidates: { idx: number; digits: number[] }[] = [];
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] !== 0) continue;
      const r = Math.floor(i / 9);
      const c = i % 9;
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      const used = new Set<number>();
      for (let j = 0; j < 9; j++) {
        used.add(puzzle[r * 9 + j]);
        used.add(puzzle[j * 9 + c]);
        used.add(puzzle[(br + Math.floor(j / 3)) * 9 + (bc + (j % 3))]);
      }
      candidates.push({ idx: i, digits: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d)) });
    }

    return { puzzle, solution, candidates, solved: true, cellCount: cells.length };
  });

  if (!data.solved || data.cellCount !== 81) {
    throw new Error(`humanSolve: failed — cellCount=${data.cellCount}, solved=${data.solved}`);
  }

  // Wait for duoSetPlaying CF to complete before first interaction
  await page.waitForTimeout(3500);

  // ── Phase 1: fill candidates ──────────────────────────────────────
  await page.evaluate(() => (window as Record<string, unknown>).toggleNoteMode?.());

  for (const { idx, digits } of data.candidates) {
    await page.locator(`.cell[data-idx="${idx}"]`).click();
    for (const d of digits) {
      await page.keyboard.press(String(d));
      // ~100ms per digit — fast scanning pace
      await page.waitForTimeout(70 + Math.floor(Math.random() * 60));
    }
    // Move to next cell
    await page.waitForTimeout(Math.floor(candidateDelayMs * (0.6 + Math.random() * 0.8)));
  }

  await page.evaluate(() => (window as Record<string, unknown>).toggleNoteMode?.());

  // ── Phase 2: fill answers ─────────────────────────────────────────
  let cellsFilled = 0;
  for (let i = 0; i < 81; i++) {
    if (data.puzzle[i] !== 0) continue;

    await page.locator(`.cell[data-idx="${i}"]`).click();
    await page.keyboard.press(String(data.solution[i]));
    cellsFilled++;

    const isThinkPause = cellsFilled % thinkEvery === 0;
    const delay = isThinkPause
      ? 2000 + Math.floor(Math.random() * 3000) // 2–5s thinking pause
      : Math.floor(answerDelayMs * (0.6 + Math.random() * 0.8));
    await page.waitForTimeout(delay);
  }
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

  test('人類節奏雙人對戰 — 候選→作答 + 進度同步 + 心跳存活 120s', async () => {
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
    const gameStartedAt = Date.now();
    console.log('[duo-human] game started on both pages');

    // ── 4. Arm progress monitors ──────────────────────────────────────
    // Candidates phase takes ~35s before first answer is filled,
    // so give progress monitor 150s to see non-zero opponent progress.
    const hostSeesGuestProgress = hostPage.waitForFunction(
      () => parseInt(document.getElementById('duo-progress-opp-pct')?.textContent ?? '0', 10) > 0,
      { timeout: 150_000 },
    );
    const guestSeesHostProgress = guestPage.waitForFunction(
      () => parseInt(document.getElementById('duo-progress-opp-pct')?.textContent ?? '0', 10) > 0,
      { timeout: 150_000 },
    );

    // ── 5. Both players solve concurrently ────────────────────────────
    // Host:  candidateDelayMs=250  answerDelayMs=1200  thinkEvery=12
    //        ~35s candidates + ~60s answers = ~100s total game time
    // Guest: candidateDelayMs=350  answerDelayMs=2800  thinkEvery=8
    //        ~35s candidates + ~120s answers = ~158s total game time
    //
    // Guest's 158s >> GAME_START_GRACE_MS(60s) + DUO_STALE_HEARTBEAT_MS(60s) = 120s
    // → heartbeats must fire correctly throughout or auto-forfeit triggers
    console.log('[duo-human] starting concurrent human-pace solve (Phase1: candidates, Phase2: answers)…');
    await Promise.all([
      humanSolve(hostPage, { candidateDelayMs: 250, answerDelayMs: 1200, thinkEvery: 12 }),
      humanSolve(guestPage, { candidateDelayMs: 350, answerDelayMs: 2800, thinkEvery: 8 }),
    ]);

    const elapsed = Date.now() - gameStartedAt;
    console.log(`[duo-human] both solved — elapsed: ${(elapsed / 1000).toFixed(1)}s`);

    // ── 6. Assert game lasted past watchdog window ────────────────────
    // GAME_START_GRACE_MS(60s) + DUO_STALE_HEARTBEAT_MS(60s) = 120s.
    // If elapsed < 120s, the guest never entered the post-grace zone and
    // the test isn't actually verifying heartbeat survival.
    expect(
      elapsed,
      'game must last > 120s to pass grace period + stale window (tests heartbeat survival)',
    ).toBeGreaterThan(120_000);

    // ── 7. Verify opponent progress was seen during the game ──────────
    await Promise.all([hostSeesGuestProgress, guestSeesHostProgress]);
    const finalHostSeesPct = await getOppProgressPct(hostPage);
    const finalGuestSeesPct = await getOppProgressPct(guestPage);
    console.log(
      `[duo-human] opp pct final — host sees guest: ${finalHostSeesPct}%, guest sees host: ${finalGuestSeesPct}%`,
    );
    expect(finalHostSeesPct, 'host should see guest progress > 0%').toBeGreaterThan(0);
    expect(finalGuestSeesPct, 'guest should see host progress > 0%').toBeGreaterThan(0);

    // ── 8. Both result modals appear ──────────────────────────────────
    await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
    console.log('[duo-human] result modals appeared on both pages');

    // ── 9. No disconnect toast ────────────────────────────────────────
    // Auto-forfeit produces a toast containing "斷線" before the result modal.
    // If we reached the result modal AND elapsed > 120s, normal play confirmed.
    // Belt-and-suspenders: also check the toast text directly.
    const hostToast = await hostPage
      .evaluate(() => document.getElementById('feedback-toast')?.textContent ?? '')
      .catch(() => '');
    const guestToast = await guestPage
      .evaluate(() => document.getElementById('feedback-toast')?.textContent ?? '')
      .catch(() => '');
    expect(hostToast, 'host should not see disconnect toast').not.toContain('斷線');
    expect(guestToast, 'guest should not see disconnect toast').not.toContain('斷線');

    // ── 10. Verify win / loss outcome ─────────────────────────────────
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
      expect(guestResult!.draw).toBe(true);
    } else {
      expect(hostResult!.victory, 'host (faster solver) should win').toBe(true);
      expect(guestResult!.defeat, 'guest (slower solver) should lose').toBe(true);
    }

    console.log('[duo-human] ✓ all assertions passed');
  });
});
