import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

/**
 * E2E: Phase 5 — Cloudflare WebSocket Duo 大廳發現 + 端到端對局
 *
 * 驗證 localStorage.duo_ws='1' 路徑：
 *   建房 → 大廳麵包屑(duo_ws_rooms)被寫入 → guest 在大廳發現 → 加入 →
 *   麵包屑被移除 → 雙方準備 → 倒數 → 開局 → 雙方完賽 → 結算。
 *
 * 跑在本機 dev server（playwright.config.ts baseURL=http://localhost:5173），
 * 連線實際的線上 Cloudflare worker(duo-party) + 正式 Firestore。
 */

const SUITE_TIMEOUT = 240_000;

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const badge = document.getElementById('version-badge');
      return badge && badge.textContent && badge.textContent.startsWith('v');
    },
    { timeout: 60_000 },
  );
}

// 設定暱稱/玩家 id 並啟用 WS flag
async function setupClient(page: Page, alias: string): Promise<void> {
  await page.evaluate((a) => {
    localStorage.setItem('sudoku_player_alias', a);
    localStorage.setItem('sudoku_player_id', `test_${a}`);
    localStorage.setItem('duo_ws', '1');
  }, alias);
}

async function isWsEnabled(page: Page): Promise<boolean> {
  return page.evaluate(() => localStorage.getItem('duo_ws') === '1');
}

// 直接查 Firestore duo_ws_rooms，回傳該 hostAlias 的麵包屑數量（-1 = gs.db 不可用）
async function wsBreadcrumbCount(page: Page, alias: string): Promise<number> {
  return page.evaluate(async (a) => {
    const db = (window as Record<string, unknown>).__e2e?.gs?.db;
    if (!db) return -1;
    try {
      const snap = await db.collection('duo_ws_rooms').get();
      return snap.docs.filter((d: Record<string, unknown>) => d.data()?.hostAlias === a).length;
    } catch {
      return -2;
    }
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

async function cleanup(page: Page): Promise<void> {
  await Promise.race([
    page.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.()),
    page.waitForTimeout(5_000),
  ]).catch(() => {});
}

test.describe('duo-ws-phase5', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('WS 大廳發現 → 加入 → 對局完賽', async ({ browser }: { browser: Browser }) => {
    const ts = Date.now() % 100_000;
    const hostAlias = `wh${ts}`;
    const guestAlias = `wg${ts}`;

    const hostCtx: BrowserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const guestCtx: BrowserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // 把瀏覽器 console 轉發到測試輸出，方便診斷
    hostPage.on('console', (m) => {
      if (/duoWs|duo]/.test(m.text())) console.log(`[host-console] ${m.text()}`);
    });

    try {
      await Promise.all([
        hostPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      await Promise.all([setupClient(hostPage, hostAlias), setupClient(guestPage, guestAlias)]);
      await Promise.all([
        hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      // 確認 flag 真的開了
      expect(await isWsEnabled(hostPage), 'host WS flag on').toBe(true);
      expect(await isWsEnabled(guestPage), 'guest WS flag on').toBe(true);
      console.log(`[phase5] booted WS mode (h=${hostAlias} g=${guestAlias})`);

      // ── 建房 ──
      await openDuoLobby(hostPage);
      await createRoom(hostPage);
      console.log('[phase5] room created (WS)');

      // ── 斷言 1：麵包屑被寫入 duo_ws_rooms ──
      await expect
        .poll(() => wsBreadcrumbCount(hostPage, hostAlias), {
          timeout: 15_000,
          message: 'WS breadcrumb should be published after create',
        })
        .toBe(1);
      console.log('[phase5] ✓ breadcrumb published');

      // ── 大廳發現 + 加入 ──
      await openDuoLobby(guestPage);
      await refreshLobbyAndWaitForRoom(guestPage, hostAlias);
      console.log('[phase5] ✓ guest discovered room in lobby');
      await joinRoomByHostAlias(guestPage, hostAlias);
      console.log('[phase5] guest joined');

      // ── 斷言 2：guest 加入後麵包屑被移除（避免他人點到滿房） ──
      await expect
        .poll(() => wsBreadcrumbCount(hostPage, hostAlias), {
          timeout: 15_000,
          message: 'WS breadcrumb should be removed after guest joins',
        })
        .toBe(0);
      console.log('[phase5] ✓ breadcrumb removed after join');

      // ── 準備 → 倒數 → 開局 ──
      await Promise.all([waitForReadyButtonVisible(hostPage), waitForReadyButtonVisible(guestPage)]);
      await clickReady(hostPage);
      await hostPage.waitForTimeout(500);
      await clickReady(guestPage);

      await Promise.all([waitForCountdown(hostPage), waitForCountdown(guestPage)]);
      await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
      console.log('[phase5] ✓ game started (WS countdown/launch)');

      // ── 雙方完賽 ──（host 先，確保有明確勝負）
      await solveBoard(hostPage);
      await hostPage.waitForTimeout(1_000);
      await solveBoard(guestPage);

      await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
      console.log('[phase5] ✓ both result modals shown');

      const [hostPanel, guestPanel] = await Promise.all([
        hostPage.evaluate(() => {
          const p = document.querySelector('.duo-result-panel');
          return p ? { present: true, victory: p.classList.contains('victory') } : null;
        }),
        guestPage.evaluate(() => !!document.querySelector('.duo-result-panel')),
      ]);
      expect(hostPanel?.present, 'host result panel').toBe(true);
      expect(guestPanel, 'guest result panel').toBe(true);
      expect(hostPanel?.victory, 'host (finished first) should win').toBe(true);
      console.log('[phase5] ✓ ALL PASSED');
    } finally {
      try {
        await cleanup(hostPage);
      } catch {
        /* noop */
      }
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});
