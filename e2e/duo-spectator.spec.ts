import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo spectator mode
 *
 * Verifies:
 *   1. First finisher sees spectator overlay (#duo-spec-overlay)
 *   2. Still-playing player sees 👁 badge
 *   3. Spectator's spec-grid syncs when opponent fills a cell (specBoardVersion increments)
 *   4. Bomb (💣) obscures 5 cells on the still-playing player's real grid for 500ms
 *   5. When second player finishes, spectator overlay closes and result modal appears for both
 *
 * Requires: E2E_LIVE_FIREBASE=1 + local dev server at localhost:5173
 */

const TEST_TIER_ID = 'tierI';
const TEST_MODE_ID = 'standard';
const E2E_TIMEOUT_MS = 20_000;

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e, { timeout: E2E_TIMEOUT_MS });
}
async function waitForFirebase(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs?.firebaseReady, { timeout: E2E_TIMEOUT_MS });
}

async function setAlias(page: Page, alias: string) {
  await page.evaluate((a) => {
    localStorage.setItem('sudoku_player_alias', a);
    localStorage.setItem('sudoku_player_id', `test_${a}_${Date.now()}`);
  }, alias);
}

async function cleanupDuoRoom(page: Page) {
  await Promise.race([
    page.evaluate(async ({ tierId, modeId }) => {
      const e2e = (window as unknown).__e2e;
      if (!e2e?.gs?.firebaseReady) return;
      try {
        const activeRoomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (activeRoomId) {
          await e2e.gs.db.collection('duo_rooms').doc(activeRoomId).set({
            tierId, modeId, puzzleSeed: 0, levelId: 0, status: 'idle',
            hostId: 'cleanup', hostAlias: 'cleanup', hostTitle: null,
            hostReady: false, hostProgress: 0, hostFinishTime: null,
            hostStars: null, hostDuoWins: 0, hostHeartbeatAtMs: 0, hostOnline: false,
            guestId: null, guestAlias: null, guestTitle: null, guestReady: false,
            guestProgress: 0, guestFinishTime: null, guestStars: null,
            guestDuoWins: null, guestHeartbeatAtMs: null, guestOnline: false,
            startAt: null, levelLocked: false, updatedAt: Date.now(),
          });
        }
      } catch {}
    }, { tierId: TEST_TIER_ID, modeId: TEST_MODE_ID }),
    page.waitForTimeout(5000),
  ]);
}

async function waitForRoomStatus(page: Page, status: string, timeoutMs = 12000) {
  await page.waitForFunction(
    async (s) => {
      const e2e = (window as unknown).__e2e;
      if (!e2e?.gs?.firebaseReady) return false;
      const roomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!roomId) return false;
      const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
      return doc?.exists ? doc.data()?.status === s : false;
    },
    status,
    { timeout: timeoutMs },
  );
}

async function createRoomAsHost(page: Page, tierId: string, modeId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await page.evaluate(async ({ tierId, modeId }) => {
      const e2e = (window as unknown).__e2e;
      const duo = await import('/src/features/duo/index.ts');
      const fb = await import('/src/firebase/runtime.ts');
      return {
        roomId: await duo.createDuoRoom(tierId, modeId) as string | null,
        firebaseReady: !!e2e?.gs?.firebaseReady,
        authUid: fb.getAuthUid(),
      };
    }, { tierId, modeId });
    console.log(`[spec] createRoomAsHost attempt ${attempt + 1}: roomId=${result.roomId}`);
    if (result.roomId) {
      await waitForRoomStatus(page, 'waiting', 10000);
      return result.roomId;
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('createDuoRoom returned null after 5 attempts');
}

async function joinRoomAsGuest(page: Page, roomId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const duo = await import('/src/features/duo/index.ts');
    await duo.joinDuoRoom(id);
  }, roomId);
  await waitForRoomStatus(page, 'waiting', 10000);
}

async function toggleReady(page: Page) {
  await page.evaluate(async () => {
    const duo = await import('/src/features/duo/index.ts');
    duo.toggleDuoReady();
  });
}

async function waitForGameStart(page: Page) {
  await page.waitForFunction(
    () => {
      const gc = document.querySelector('.game-container') as HTMLElement | null;
      const p = document.getElementById('duo-progress-container');
      return (
        gc != null && gc.style.display === 'flex' &&
        document.querySelectorAll('.cell[data-idx]').length === 81 &&
        p != null && p.style.display === 'flex'
      );
    },
    { timeout: 30_000 },
  );
}

async function startRound(hostPage: Page, guestPage: Page): Promise<string> {
  const roomId = await createRoomAsHost(hostPage, TEST_TIER_ID, TEST_MODE_ID);
  console.log(`[spec] room created: ${roomId}`);
  await guestPage.waitForTimeout(500);
  await joinRoomAsGuest(guestPage, roomId);
  await hostPage.waitForTimeout(1000);

  await toggleReady(hostPage);
  await hostPage.waitForTimeout(300);
  await toggleReady(guestPage);

  await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
  await waitForRoomStatus(hostPage, 'playing', 12000);
  console.log(`[spec] game started on both pages`);
  return roomId;
}

/** Solve all empty cells except one (leaves the last non-fixed cell empty) */
async function solveAllExceptOne(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e2e = (window as unknown).__e2e;
    const puzzle = e2e.gs.currentLevel.puzzle;
    const solution = e2e.gs.currentLevel.solution;
    const empties: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] === 0) empties.push(i);
    }
    // Fill all except last
    for (let j = 0; j < empties.length - 1; j++) {
      const i = empties[j];
      e2e.selectCell(i);
      e2e.handleInput(solution[i]);
    }
  });
}

/** Solve the last remaining empty cell (triggers finish) */
async function solveLastCell(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e2e = (window as unknown).__e2e;
    const puzzle = e2e.gs.currentLevel.puzzle;
    const solution = e2e.gs.currentLevel.solution;
    for (let i = 80; i >= 0; i--) {
      if (puzzle[i] === 0 && e2e.gs.cellsData[i].value === 0) {
        e2e.selectCell(i);
        e2e.handleInput(solution[i]);
        return;
      }
    }
  });
}

async function solveAllCells(page: Page) {
  await page.evaluate(() => {
    const e2e = (window as unknown).__e2e;
    const puzzle = e2e.gs.currentLevel.puzzle;
    const solution = e2e.gs.currentLevel.solution;
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] === 0) {
        e2e.selectCell(i);
        e2e.handleInput(solution[i]);
      }
    }
  });
}

async function waitForResultModal(page: Page, timeoutMs = 30000) {
  await page.waitForFunction(
    () => {
      const modal = document.getElementById('duo-result-modal');
      return modal !== null && !modal.classList.contains('zen-overlay--hidden');
    },
    { timeout: timeoutMs },
  );
  await page.waitForSelector('.duo-result-panel', { timeout: 5000 });
}

test.describe('duo-spectator', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  test.skip(process.env.E2E_LIVE_FIREBASE !== '1', 'Requires live Firebase (set E2E_LIVE_FIREBASE=1)');

  let hostCtx: BrowserContext;
  let guestCtx: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeAll(async ({ browser }) => {
    hostCtx = await browser.newContext();
    guestCtx = await browser.newContext();
    hostPage = await hostCtx.newPage();
    guestPage = await guestCtx.newPage();
    hostPage.on('console', (msg) => { if (msg.text().includes('[duo]') || msg.text().includes('[spec]')) console.log('[H]', msg.text()); });
    guestPage.on('console', (msg) => { if (msg.text().includes('[duo]') || msg.text().includes('[spec]')) console.log('[G]', msg.text()); });

    await Promise.all([hostPage.goto('/'), guestPage.goto('/')]);
    await Promise.all([waitForE2E(hostPage), waitForE2E(guestPage)]);
    await Promise.all([waitForFirebase(hostPage), waitForFirebase(guestPage)]);

    await setAlias(hostPage, 'duo_spec_h_e2e');
    await setAlias(guestPage, 'duo_spec_g_e2e');
  });

  test.afterAll(async () => {
    await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
  });

  test('1. 先完成者（host）進入觀戰模式，被觀者（guest）看到 👁 badge', async () => {
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    await startRound(hostPage, guestPage);
    console.log('[spec-e2e] 1: game started');

    // Host finishes, leaving guest to solve alone
    await solveAllCells(hostPage);
    console.log('[spec-e2e] 1: host finished');

    // Host should see spectator overlay
    await hostPage.waitForFunction(
      () => {
        const overlay = document.getElementById('duo-spec-overlay');
        return overlay !== null;
      },
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 1: ✓ host sees spectator overlay');

    // Guest should see 👁 badge (startBeingWatched)
    await guestPage.waitForFunction(
      () => {
        const badge = document.getElementById('duo-being-watched-badge');
        return badge !== null;
      },
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 1: ✓ guest sees 👁 badge');

    // Verify overlay content: spec-grid has 81 cells
    const specGridCells = await hostPage.evaluate(() => {
      return document.querySelectorAll('#duo-spec-grid .cell').length;
    });
    expect(specGridCells).toBe(81);
    console.log('[spec-e2e] 1: ✓ spec-grid has 81 cells');

    // Verify emoji bar with bomb button exists
    const bombBtnExists = await hostPage.evaluate(() => {
      return document.getElementById('spec-bomb-btn') !== null;
    });
    expect(bombBtnExists).toBe(true);
    console.log('[spec-e2e] 1: ✓ bomb button present');
  });

  test('2. 盤面同步：guest 填格後 host 的 spec-grid 版本更新', async () => {
    // Read initial specBoardVersion from Firestore
    const initialVersion = await hostPage.evaluate(async () => {
      const e2e = (window as unknown).__e2e;
      const roomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!e2e?.gs?.firebaseReady || !roomId) return null;
      const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
      return doc?.exists ? (doc.data()?.specBoardVersion ?? null) : null;
    });
    console.log('[spec-e2e] 2: initial specBoardVersion =', initialVersion);

    // Guest fills one more cell (still playing)
    await guestPage.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const puzzle = e2e.gs.currentLevel.puzzle;
      const solution = e2e.gs.currentLevel.solution;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0 && e2e.gs.cellsData[i].value === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
          return;
        }
      }
    });
    console.log('[spec-e2e] 2: guest filled one cell');

    // Wait for Firestore specBoardVersion to increment
    await hostPage.waitForFunction(
      async (prevVer) => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (!e2e?.gs?.firebaseReady || !roomId) return false;
        const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
        if (!doc?.exists) return false;
        const newVer = doc.data()?.specBoardVersion;
        return newVer != null && newVer !== prevVer;
      },
      initialVersion,
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 2: ✓ specBoardVersion incremented in Firestore');

    // Verify host's spec-grid reflects the new fill (at least one filled cell besides givens)
    const filledCells = await hostPage.evaluate(() => {
      return document.querySelectorAll('#duo-spec-grid .cell.filled').length;
    });
    expect(filledCells).toBeGreaterThan(0);
    console.log(`[spec-e2e] 2: ✓ host spec-grid has ${filledCells} filled cells`);
  });

  test('3. 炸彈：host 投炸彈，guest 盤面短暫出現 .spec-bombed cells', async () => {
    // Verify bomb button is enabled
    const bombEnabled = await hostPage.evaluate(() => {
      const btn = document.getElementById('spec-bomb-btn') as HTMLButtonElement | null;
      return btn !== null && !btn.disabled;
    });
    expect(bombEnabled).toBe(true);

    // Host throws bomb
    await hostPage.evaluate(async () => {
      const m = await import('/src/features/duo/duoSpectator.ts');
      m.throwBomb();
    });
    console.log('[spec-e2e] 3: host threw bomb');

    // Wait for specBombAt to appear in Firestore
    await guestPage.waitForFunction(
      async () => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (!e2e?.gs?.firebaseReady || !roomId) return false;
        const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
        return doc?.exists && doc.data()?.specBombAt != null;
      },
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 3: ✓ specBombAt written to Firestore');

    // Guest should see .spec-bombed cells temporarily (within 2s)
    const hasBombedCells = await guestPage.waitForFunction(
      () => document.querySelectorAll('.cell.spec-bombed').length > 0,
      { timeout: 5_000 },
    ).then(() => true).catch(() => false);

    expect(hasBombedCells).toBe(true);
    console.log('[spec-e2e] 3: ✓ guest has spec-bombed cells');

    // Bomb button should now be disabled
    const bombDisabledAfter = await hostPage.evaluate(() => {
      const btn = document.getElementById('spec-bomb-btn') as HTMLButtonElement | null;
      return btn?.disabled ?? false;
    });
    expect(bombDisabledAfter).toBe(true);
    console.log('[spec-e2e] 3: ✓ bomb button disabled after use');

    // Wait for bombed cells to clear (500ms timeout)
    await guestPage.waitForTimeout(700);
    const bombedCellsAfter = await guestPage.evaluate(
      () => document.querySelectorAll('.cell.spec-bombed').length,
    );
    expect(bombedCellsAfter).toBe(0);
    console.log('[spec-e2e] 3: ✓ spec-bombed cleared after 500ms');
  });

  test('4. guest 完成後：觀戰 overlay 關閉，雙方看到結算 modal', async () => {
    // Guest finishes remaining cells
    await solveAllCells(guestPage);
    console.log('[spec-e2e] 4: guest finished all cells');

    // Wait for both finishTimes in Firestore
    await hostPage.waitForFunction(
      async () => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (!e2e?.gs?.firebaseReady || !roomId) return false;
        const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
        if (!doc?.exists) return false;
        const d = doc.data();
        return d?.hostFinishTime != null && d?.guestFinishTime != null;
      },
      { timeout: 15_000 },
    );
    console.log('[spec-e2e] 4: both finishTimes in Firestore');

    // Spectator overlay should close
    await hostPage.waitForFunction(
      () => document.getElementById('duo-spec-overlay') === null,
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 4: ✓ spectator overlay closed');

    // 👁 badge should disappear from guest
    await guestPage.waitForFunction(
      () => document.getElementById('duo-being-watched-badge') === null,
      { timeout: 8_000 },
    );
    console.log('[spec-e2e] 4: ✓ 👁 badge removed from guest');

    // Both should see result modal
    await Promise.all([
      waitForResultModal(hostPage),
      waitForResultModal(guestPage),
    ]);
    console.log('[spec-e2e] 4: ✓ both see result modal');

    // Host finished first → host wins
    const hostWin = await hostPage.evaluate(() =>
      document.querySelector('.duo-result-panel')?.classList.contains('victory') ?? false,
    );
    expect(hostWin).toBe(true);
    console.log('[spec-e2e] 4: ✓ host wins (finished first)');
  });
});
