import { test, expect, type Page } from '@playwright/test';

/**
 * Live debug: reproduce 「進度條沒在更新 + 60 秒對方離線」complaint.
 * Pair two anonymous browsers, start a game, host fills 5 cells slowly,
 * watch what guest sees + monitor heartbeat freshness for 90s.
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const TS = Date.now() % 100_000;
const HOST = `dh${TS}`;
const GUEST = `dg${TS}`;

async function waitForBoot(page: Page) {
  await page.waitForFunction(
    () => {
      const b = document.getElementById('version-badge');
      return b && b.textContent && b.textContent.startsWith('v');
    },
    { timeout: 60_000 },
  );
}

async function setAlias(page: Page, alias: string) {
  await page.evaluate((a) => {
    localStorage.setItem('sudoku_player_alias', a);
    localStorage.setItem('sudoku_player_id', `test_${a}`);
    localStorage.setItem('sudoku_e2e_mode', '1');
  }, alias);
}

async function openLobby(page: Page) {
  await page.evaluate(() => (window as Record<string, unknown>).openDuoLobby?.());
  await page.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
    timeout: 20_000,
  });
}

async function createRoom(page: Page) {
  await page.evaluate(() => (window as Record<string, unknown>).createDuoRoomFromLobby?.());
  await page.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
    timeout: 25_000,
  });
}

async function refreshAndJoin(page: Page, hostAlias: string) {
  await page.waitForFunction(
    async (alias) => {
      if (Array.from(document.querySelectorAll('.duo-room-item .duo-room-host')).some((el) => el.textContent === alias))
        return true;
      await new Promise<void>((r) => {
        const w = window as Record<string, unknown>;
        if (typeof w.refreshDuoLobbyRoom === 'function') w.refreshDuoLobbyRoom();
        setTimeout(r, 2500);
      });
      return false;
    },
    hostAlias,
    { timeout: 45_000 },
  );
  await page.locator(`.duo-room-item:has(.duo-room-host:text("${hostAlias}"))`).click();
  await page.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
    timeout: 15_000,
  });
}

async function clickReady(page: Page) {
  await page.evaluate(() => (window as Record<string, unknown>).toggleDuoReady?.());
}

async function waitForGameStart(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('.cell[data-idx]').length === 81, { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const p = document.getElementById('duo-progress-container');
      return p != null && p.style.display === 'flex';
    },
    { timeout: 10_000 },
  );
}

async function getRoomState(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const d = (window as Record<string, unknown>).gs as { duoRoomData?: unknown };
    return d?.duoRoomData ?? null;
  });
}

async function getOppProgressUI(page: Page): Promise<{ pct: string; width: string; label: string }> {
  return page.evaluate(() => ({
    pct: (document.getElementById('duo-progress-opp-pct') as HTMLElement | null)?.textContent ?? '?',
    width: (document.getElementById('duo-progress-fill-opp') as HTMLElement | null)?.style.width ?? '?',
    label: (document.getElementById('duo-progress-opp-label') as HTMLElement | null)?.textContent ?? '?',
  }));
}

async function getFeedbackText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const t = document.getElementById('feedback-toast');
    return (t?.textContent ?? '').trim();
  });
}

test.describe('duo-live-progress-debug', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test('進度條更新 + 60s 心跳完整檢查', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Capture browser console for both pages
    hostPage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[host:${msg.type()}] ${msg.text()}`);
      }
    });
    guestPage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[guest:${msg.type()}] ${msg.text()}`);
      }
    });
    hostPage.on('pageerror', (e) => console.log(`[host:pageerror] ${e.message}`));
    guestPage.on('pageerror', (e) => console.log(`[guest:pageerror] ${e.message}`));

    try {
      console.log(`[debug] launching host=${HOST} guest=${GUEST}`);
      await Promise.all([
        hostPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);
      await Promise.all([setAlias(hostPage, HOST), setAlias(guestPage, GUEST)]);
      await Promise.all([
        hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      const hostVer = await hostPage.evaluate(() => document.getElementById('version-badge')?.textContent);
      console.log(`[debug] both booted; client version: ${hostVer}`);

      await openLobby(hostPage);
      await createRoom(hostPage);
      console.log('[debug] host created room');

      await openLobby(guestPage);
      await refreshAndJoin(guestPage, HOST);
      console.log('[debug] guest joined');

      await Promise.all([
        hostPage.waitForFunction(
          () => {
            const b = document.getElementById('duo-ready-btn') as HTMLButtonElement | null;
            return b != null && b.style.display !== 'none' && b.style.display !== '';
          },
          { timeout: 30_000 },
        ),
        guestPage.waitForFunction(
          () => {
            const b = document.getElementById('duo-ready-btn') as HTMLButtonElement | null;
            return b != null && b.style.display !== 'none' && b.style.display !== '';
          },
          { timeout: 30_000 },
        ),
      ]);
      await clickReady(hostPage);
      await hostPage.waitForTimeout(500);
      await clickReady(guestPage);
      console.log('[debug] both ready');

      await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
      console.log('[debug] game started — both pages on board');

      const hostRoomId = await hostPage.evaluate(
        () =>
          (window as Record<string, unknown>).gs?.duoRoomData?.roomId ?? localStorage.getItem('sudoku_duo_active_room'),
      );
      console.log(`[debug] roomId = ${hostRoomId}`);

      // ── Phase 1: Fill 1 cell, watch progress propagate ────────────────────
      console.log('\n========== PHASE 1: progress propagation ==========');
      const t0 = Date.now();
      // host fills first empty cell
      const firstFill = await hostPage.evaluate(() => {
        const cells = Array.from(document.querySelectorAll<HTMLElement>('.cell[data-idx]')).sort(
          (a, b) => Number(a.dataset.idx) - Number(b.dataset.idx),
        );
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (!c.classList.contains('is-fixed') && !c.classList.contains('user-val')) {
            return Number(c.dataset.idx);
          }
        }
        return -1;
      });
      console.log(`[debug] host filling cell idx=${firstFill}`);

      // Compute solution and fill
      await hostPage.evaluate((idx) => {
        function solve(b: number[]): boolean {
          const empty = b.indexOf(0);
          if (empty === -1) return true;
          const row = Math.floor(empty / 9),
            col = empty % 9;
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
              if (solve(b)) return true;
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
        const sol = [...puzzle];
        solve(sol);
        (window as Record<string, unknown>).__testSolution = sol;
      }, firstFill);

      // Click + press
      await hostPage.locator(`.cell[data-idx="${firstFill}"]`).click();
      const digit = await hostPage.evaluate((idx) => {
        const sol = (window as Record<string, unknown>).__testSolution as number[];
        return sol[idx];
      }, firstFill);
      await hostPage.keyboard.press(String(digit));
      console.log(`[debug] host pressed ${digit} at cell ${firstFill}, t=${Date.now() - t0}ms`);

      // Wait up to 5s, sample every 500ms
      for (let i = 0; i < 10; i++) {
        await hostPage.waitForTimeout(500);
        const snap = (await getRoomState(guestPage)) as Record<string, unknown> | null;
        const oppUI = await getOppProgressUI(guestPage);
        const fb = await getFeedbackText(guestPage);
        console.log(
          `[debug] t=${Date.now() - t0}ms guest sees: hostProgress=${snap?.hostProgress} hostHB=${snap?.hostHeartbeatAtMs} oppPct=${oppUI.pct} oppWidth=${oppUI.width} feedback="${fb}"`,
        );
      }

      // ── Phase 2: Watch heartbeat behavior over 80 seconds ──────────────────
      console.log('\n========== PHASE 2: heartbeat over 80s ==========');
      const phase2Start = Date.now();
      // Host idles for 80s; guest watches feedback
      for (let i = 0; i < 8; i++) {
        await hostPage.waitForTimeout(10_000);
        const snap = (await getRoomState(guestPage)) as Record<string, unknown> | null;
        const fb = await getFeedbackText(guestPage);
        const fbHost = await getFeedbackText(hostPage);
        const now = await hostPage.evaluate(() => Date.now());
        const hostHB = snap?.hostHeartbeatAtMs as number | undefined;
        const hostHBAge = hostHB ? now - hostHB : '?';
        console.log(
          `[debug] t+${Math.round((Date.now() - phase2Start) / 1000)}s hostHB age=${hostHBAge}ms hostOnline=${snap?.hostOnline} guestFeedback="${fb}" hostFeedback="${fbHost}"`,
        );
      }

      // Final assertion: guest should NOT have seen "對方離線" toast
      const guestFb = await getFeedbackText(guestPage);
      const hostFb = await getFeedbackText(hostPage);
      console.log(`\n[debug] FINAL guestFb="${guestFb}" hostFb="${hostFb}"`);

      const sawOffline =
        guestFb.includes('離線') ||
        guestFb.includes('offline') ||
        hostFb.includes('離線') ||
        hostFb.includes('offline');
      console.log(`[debug] saw offline toast: ${sawOffline}`);

      expect(sawOffline, 'should NOT see "opponent offline" within 80s when both pages active').toBe(false);
    } finally {
      await Promise.allSettled([
        hostPage.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
        guestPage.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
      ]);
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});
