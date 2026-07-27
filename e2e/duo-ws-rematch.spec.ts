import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * E2E: WS Duo — 真人步調完整兩場（每場 ≥ 3 分鐘）+ 再來一輪
 *
 * 目的：
 *  1) 用真人步調（雙方並發、逐格數秒）打完一整場，每場 ≥ 3 分鐘，
 *     驗證「對局開始後棋盤偶發不可點」已修、且長時對局全程穩定。
 *  2) 結算後點「再來一局」→ 原房雙方回準備區 → 再完整打第二場。
 *  3) round 1 內含 32s 思考停頓探針，驗證 R1 心跳不誤殺 idle 玩家。
 *
 * 預設打本機 dev server（playwright.config.ts，baseURL=localhost:5173，goto('/')）。
 * 設 E2E_APP_URL=https://wulalainlondon.github.io/sudokuzen/ 可改打線上 production。
 * 後端一律走線上 Cloudflare worker + 正式 Firestore。
 */

const SUITE_TIMEOUT = 900_000;
// 單場對局目標時長：host 依空格數動態配速使整場 ≈ 此值（assertion 門檻 180s）。
const MATCH_MIN_MS = 190_000;
// 導向目標：預設相對 '/'（本機 dev root）；E2E_APP_URL 可覆寫為線上絕對網址。
const APP_URL = process.env.E2E_APP_URL ?? '/';

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

// 解出當前盤面，回傳謎面（0=空格）與完整解答。
async function computeSolvePlan(
  page: Page,
): Promise<{ puzzle: number[]; solution: number[]; solved: boolean; cellCount: number }> {
  return await page.evaluate(() => {
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
}

// 真人步調填盤：依 targetTotalMs 與空格數動態配速（每格數秒），整場約 targetTotalMs。
// guest 端用 extraPerCellMs 放慢、並 stopOnResult：對局一旦結算（對手獲勝）就停手，
// 避免對著結算遮罩硬點。
async function fillBoardPaced(
  page: Page,
  opts: { targetTotalMs: number; extraPerCellMs?: number; stopOnResult?: boolean },
): Promise<void> {
  const data = await computeSolvePlan(page);
  if (!data.solved || data.cellCount !== 81) {
    throw new Error(`fillBoard: cellCount=${data.cellCount} solved=${data.solved}`);
  }
  const empties: number[] = [];
  for (let i = 0; i < 81; i++) if (data.puzzle[i] === 0) empties.push(i);
  const perCellMs = Math.ceil(opts.targetTotalMs / Math.max(empties.length, 1)) + (opts.extraPerCellMs ?? 0);
  for (const i of empties) {
    if (opts.stopOnResult) {
      const ended = await page.evaluate(() => document.getElementById('duo-result-modal') !== null);
      if (ended) return;
    }
    try {
      await page.locator(`.cell[data-idx="${i}"]`).click({ timeout: 8000 });
      await page.keyboard.press(String(data.solution[i]));
    } catch {
      if (opts.stopOnResult) return; // 對局已結束、棋盤不可互動 → 收手
      throw new Error(`fillBoard: 第 ${i} 格無法操作`);
    }
    await page.waitForTimeout(perCellMs);
  }
}

// 真人步調探針：對局中雙方同時「停下來想」一段時間（故意 > 25s 離線門檻），
// 期間不做任何操作。client 每 10s 的 ping 應持續刷新 server 端 lastSeen，
// 因此對手端不該看到離線、也不該誤觸沒收結算。驗證 R1 心跳在真人思考停頓下
// 不會誤殺對手。
async function idleThinkProbe(hostPage: Page, guestPage: Page, idleMs: number): Promise<void> {
  await Promise.all([hostPage.waitForTimeout(idleMs), guestPage.waitForTimeout(idleMs)]);

  // 雙向斷言：兩邊都不該把對手標記為離線，且都還在對局中（沒被誤判沒收結算）。
  for (const [page, who] of [
    [hostPage, 'host'],
    [guestPage, 'guest'],
  ] as const) {
    const state = await page.evaluate(() => {
      const dot = document.getElementById('duo-progress-opp-conn');
      return {
        offline: !!dot?.classList.contains('offline'),
        uncertain: !!dot?.classList.contains('uncertain'),
        resultModal: document.getElementById('duo-result-modal') !== null,
        boardCells: document.querySelectorAll('.cell[data-idx]').length,
      };
    });
    expect(state.offline, `${who} 端不該在思考停頓後把對手標為離線`).toBe(false);
    expect(state.resultModal, `${who} 端不該因思考停頓被誤觸結算`).toBe(false);
    expect(state.boardCells, `${who} 端棋盤應仍在對局中`).toBe(81);
    if (state.uncertain) console.warn(`[rematch] ⚠ ${who} 端對手連線燈為 uncertain（非離線，但值得留意）`);
  }
}

async function waitForResultModal(page: Page): Promise<void> {
  await page.waitForSelector('#duo-result-modal', { timeout: 30_000 });
  await page.waitForSelector('.duo-result-panel', { timeout: 10_000 });
}

// 點「再來一局」→ 原房重置並回到雙方準備區。
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
async function playFullMatch(
  hostPage: Page,
  guestPage: Page,
  hostAlias: string,
  round: number,
  opts: { idleProbeMs?: number; reuseRoom?: boolean } = {},
): Promise<void> {
  if (!opts.reuseRoom) {
    await openLobby(hostPage);
    await openLobby(guestPage);

    await createRoom(hostPage);
    await discoverAndJoin(guestPage, hostAlias);
  }

  await Promise.all([waitForReadyButtonVisible(hostPage), waitForReadyButtonVisible(guestPage)]);
  await clickReady(hostPage);
  await hostPage.waitForTimeout(400);
  await clickReady(guestPage);

  await Promise.all([waitForPlayableBoard(hostPage), waitForPlayableBoard(guestPage)]);
  console.log(`[rematch] round ${round}: 棋盤可玩（overlay 已消失）`);
  const matchStart = Date.now();

  if (opts.idleProbeMs) {
    console.log(`[rematch] round ${round}: 思考停頓探針 ${opts.idleProbeMs}ms（> 25s 離線門檻）`);
    await idleThinkProbe(hostPage, guestPage, opts.idleProbeMs);
    console.log(`[rematch] round ${round}: 停頓後雙方仍在線、未誤觸沒收 ✓`);
  }

  // 雙方並發真人慢速填盤：host 配速到 ~MATCH_MIN_MS 解完獲勝；guest 較慢、
  // 對局結算即停。整場 ≈ host 解題時長（≥ 3 分鐘）。
  console.log(`[rematch] round ${round}: 開始真人步調填盤（目標單場 ≈ ${Math.round(MATCH_MIN_MS / 1000)}s）`);
  await Promise.all([
    fillBoardPaced(hostPage, { targetTotalMs: MATCH_MIN_MS }),
    fillBoardPaced(guestPage, { targetTotalMs: MATCH_MIN_MS, extraPerCellMs: 2500, stopOnResult: true }),
  ]);

  await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
  const matchMs = Date.now() - matchStart;
  console.log(`[rematch] round ${round}: 雙方結算完成，對局歷時 ${Math.round(matchMs / 1000)}s`);
  expect(matchMs, `round ${round} 對局時長應 ≥ 3 分鐘`).toBeGreaterThanOrEqual(180_000);
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
        hostPage.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      await setupClient(hostPage, hostAlias);
      await setupClient(guestPage, guestAlias);
      await Promise.all([
        hostPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
        guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }),
      ]);
      await Promise.all([waitForBoot(hostPage), waitForBoot(guestPage)]);

      // ── 第一場（含真人思考停頓探針：32s idle 驗證心跳不誤殺）──
      await playFullMatch(hostPage, guestPage, hostAlias, 1, { idleProbeMs: 32_000 });

      // ── 再來一局：任一方點擊，server-authoritative reset 讓雙方留在原房 ──
      await clickPlayAgain(hostPage);
      await Promise.all([
        hostPage.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
          timeout: 20_000,
        }),
        guestPage.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
          timeout: 20_000,
        }),
      ]);
      console.log('[rematch] 再來一局 → 雙方留在原房準備區');

      // ── 第二場（同樣完整走完）──
      await playFullMatch(hostPage, guestPage, hostAlias, 2, { reuseRoom: true });

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
