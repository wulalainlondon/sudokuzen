import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * E2E: WS Duo — 人類步調完整一場 + 再來一輪
 *
 * 目的：
 *  1) 用接近真人的步調打完一整場（等倒數 overlay 消失才開始填、逐格有延遲），
 *     驗證「對局開始後棋盤偶發不可點」的 bug 已修（launchDuoGame 兜底移除
 *     #duo-countdown-overlay）。
 *  2) 結算後點「再來一局」→ 回大廳 → 再完整打第二場，確認 rematch loop 能走完。
 *
 * 跑在本機 dev server（含本地原始碼修正）+ 線上 Cloudflare worker + 正式 Firestore。
 */

const SUITE_TIMEOUT = 300_000;

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const badge = document.getElementById('version-badge');
      return badge && badge.textContent && badge.textContent.startsWith('v');
    },
    { timeout: 60_000 },
  );
}

async function setupClient(page: Page, alias: string): Promise<void> {
  await page.evaluate((a) => {
    localStorage.setItem('sudoku_player_alias', a);
    localStorage.setItem('sudoku_player_id', `test_${a}`);
    localStorage.setItem('duo_ws', '1');
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

async function openLobby(page: Page): Promise<void> {
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

async function discoverAndJoin(page: Page, hostAlias: string): Promise<void> {
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

// 等遊戲真正可玩：81 格就緒、進度條顯示、且全螢幕倒數 overlay 已消失（關鍵：
// snapshot-launch 競態下 overlay 可能殘留蓋住棋盤）。
async function waitForPlayableBoard(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.cell[data-idx]').length === 81, { timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('duo-progress-container')?.style.display === 'flex', {
    timeout: 10_000,
  });
  await page.waitForFunction(() => document.getElementById('duo-countdown-overlay') === null, { timeout: 10_000 });
}

// 人類步調填盤：逐格點選 + 輸入數字，每格間隔小延遲（不瞬間 solve）。
async function solveBoardHumanPace(page: Page): Promise<void> {
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
      await page.waitForTimeout(40); // 人類步調：逐格小停頓
    }
  }
}

async function waitForResultModal(page: Page): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout: 30_000 });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

// 點「再來一局」→ closeDuoResult → 回大廳。
async function clickPlayAgain(page: Page): Promise<void> {
  await page.locator('#duo-result-modal .resume-btn').click();
  await page
    .waitForFunction(() => document.getElementById('duo-result-modal') === null, { timeout: 10_000 })
    .catch(async () => {
      // ZenOverlay 可能只是隱藏而非移除 → 退而求其次等面板不可見
      await page.waitForFunction(() => {
        const m = document.getElementById('duo-result-modal');
        return !m || (m as HTMLElement).offsetParent === null;
      });
    });
}

// 打完整一場（從大廳到雙方結算）。host 先完成確保有明確勝負。
async function playFullMatch(hostPage: Page, guestPage: Page, hostAlias: string, round: number): Promise<void> {
  await openLobby(hostPage);
  await openLobby(guestPage);

  await createRoom(hostPage);
  await discoverAndJoin(guestPage, hostAlias);

  await Promise.all([waitForReadyButtonVisible(hostPage), waitForReadyButtonVisible(guestPage)]);
  await clickReady(hostPage);
  await hostPage.waitForTimeout(400);
  await clickReady(guestPage);

  await Promise.all([waitForPlayableBoard(hostPage), waitForPlayableBoard(guestPage)]);
  console.log(`[rematch] round ${round}: 棋盤可玩（overlay 已消失）`);

  await solveBoardHumanPace(hostPage);
  await hostPage.waitForTimeout(800);
  await solveBoardHumanPace(guestPage);

  await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
  console.log(`[rematch] round ${round}: 雙方結算完成`);
}

test.describe('duo-ws-rematch', () => {
  test.describe.configure({ mode: 'serial', timeout: SUITE_TIMEOUT });

  test('完整一場 → 再來一局 → 再完整一場', async ({ browser }: { browser: Browser }) => {
    const hostAlias = `H${Date.now().toString(36).slice(-5)}`;
    const guestAlias = `G${Date.now().toString(36).slice(-5)}`;

    let hostCtx: BrowserContext | null = null;
    let guestCtx: BrowserContext | null = null;
    try {
      hostCtx = await browser.newContext();
      guestCtx = await browser.newContext();
      const hostPage = await hostCtx.newPage();
      const guestPage = await guestCtx.newPage();

      await Promise.all([
        hostPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      await setupClient(hostPage, hostAlias);
      await setupClient(guestPage, guestAlias);
      await Promise.all([
        hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      // ── 第一場 ──
      await playFullMatch(hostPage, guestPage, hostAlias, 1);

      // ── 再來一局：雙方點 → 回大廳 ──
      await clickPlayAgain(hostPage);
      await clickPlayAgain(guestPage);
      await Promise.all([
        hostPage.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
          timeout: 20_000,
        }),
        guestPage.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
          timeout: 20_000,
        }),
      ]);
      console.log('[rematch] 再來一局 → 雙方已回大廳');

      // ── 第二場（同樣完整走完）──
      await playFullMatch(hostPage, guestPage, hostAlias, 2);

      // 確認第二場結算面板確實出現
      const r2Host = await hostPage.evaluate(() => !!document.querySelector('.duo-result-panel'));
      const r2Guest = await guestPage.evaluate(() => !!document.querySelector('.duo-result-panel'));
      expect(r2Host, 'round2 host result panel').toBe(true);
      expect(r2Guest, 'round2 guest result panel').toBe(true);
      console.log('[rematch] ✓ 兩場皆完整走完（含再來一輪）');
    } finally {
      await hostCtx?.close().catch(() => {});
      await guestCtx?.close().catch(() => {});
    }
  });
});
