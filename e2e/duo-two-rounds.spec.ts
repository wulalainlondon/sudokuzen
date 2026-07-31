import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo two consecutive rounds
 *
 * Verifies:
 *   1. First finisher sees "finishedFirst" feedback toast (not win celebration)
 *   2. Both players see the result modal
 *   3. After closing result, a second round works end-to-end
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
    localStorage.setItem('sudoku_e2e_mode', '1');
  }, alias);
}

async function cleanupDuoRoom(page: Page) {
  await Promise.race([
    page.evaluate(
      async ({ tierId, modeId }) => {
        const e2e = (window as unknown).__e2e;
        if (!e2e?.gs?.firebaseReady) return;
        try {
          const activeRoomId = localStorage.getItem('sudoku_duo_active_room_id');
          if (activeRoomId) {
            await e2e.gs.db.collection('duo_rooms').doc(activeRoomId).set({
              tierId,
              modeId,
              puzzleSeed: 0,
              levelId: 0,
              status: 'idle',
              hostId: 'cleanup',
              hostAlias: 'cleanup',
              hostTitle: null,
              hostReady: false,
              hostProgress: 0,
              hostFinishTime: null,
              hostStars: null,
              hostDuoWins: 0,
              hostHeartbeatAtMs: 0,
              hostOnline: false,
              guestId: null,
              guestAlias: null,
              guestTitle: null,
              guestReady: false,
              guestProgress: 0,
              guestFinishTime: null,
              guestStars: null,
              guestDuoWins: null,
              guestHeartbeatAtMs: null,
              guestOnline: false,
              startAt: null,
              levelLocked: false,
              updatedAt: Date.now(),
            });
          }
        } catch {
          /* ignore */
        }
      },
      { tierId: TEST_TIER_ID, modeId: TEST_MODE_ID },
    ),
    page.waitForTimeout(5000),
  ]);
}

async function getDuoRole(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown).__e2e?.gs?.duoRole ?? null);
}

async function getDuoRoomData(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const e2e = (window as unknown).__e2e;
    if (!e2e?.gs?.firebaseReady) return null;
    const roomId = localStorage.getItem('sudoku_duo_active_room_id');
    if (!roomId) return null;
    const ref = e2e.gs.db.collection('duo_rooms').doc(roomId);
    const doc = await ref.get().catch(() => null);
    return doc?.exists ? doc.data() : null;
  });
}

async function waitForRoomStatus(page: Page, status: string, timeoutMs = 12000) {
  await page.waitForFunction(
    async (s) => {
      const e2e = (window as unknown).__e2e;
      if (!e2e?.gs?.firebaseReady) return false;
      const roomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!roomId) return false;
      const doc = await e2e.gs.db
        .collection('duo_rooms')
        .doc(roomId)
        .get()
        .catch(() => null);
      return doc?.exists ? doc.data()?.status === s : false;
    },
    status,
    { timeout: timeoutMs },
  );
}

async function createRoomAsHost(page: Page, tierId: string, modeId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await page.evaluate(
      async ({ tierId, modeId }) => {
        const e2e = (window as unknown).__e2e;
        const duo = await import('/src/features/duo/index.ts');
        const fb = await import('/src/firebase/runtime.ts');
        return {
          roomId: (await duo.createDuoRoom(tierId, modeId)) as string | null,
          firebaseReady: !!e2e?.gs?.firebaseReady,
          authUid: fb.getAuthUid(),
        };
      },
      { tierId, modeId },
    );
    console.log(
      `[createRoomAsHost] attempt ${attempt + 1}: roomId=${result.roomId}, fbReady=${result.firebaseReady}, authUid=${result.authUid?.slice(0, 8) ?? 'null'}`,
    );
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

async function waitForGameStart(page: Page) {
  // Wait for game container visible + 81 cells rendered + duo progress bar.
  // Must check game-container display because Round N-1 cells remain in the DOM
  // (hidden) after resetDuoState — the cell count alone would give a false positive.
  await page.waitForFunction(
    () => {
      const gc = document.querySelector('.game-container') as HTMLElement | null;
      const p = document.getElementById('duo-progress-container');
      return (
        gc != null &&
        gc.style.display === 'flex' &&
        document.querySelectorAll('.cell[data-idx]').length === 81 &&
        p != null &&
        p.style.display === 'flex'
      );
    },
    { timeout: 30_000 },
  );
}

async function startRound(hostPage: Page, guestPage: Page) {
  const roomId = await createRoomAsHost(hostPage, TEST_TIER_ID, TEST_MODE_ID);
  console.log(`[duo-two-rounds] room created: ${roomId}`);
  await guestPage.waitForTimeout(500);
  await joinRoomAsGuest(guestPage, roomId);
  await hostPage.waitForTimeout(1000);

  await toggleReady(hostPage);
  await hostPage.waitForTimeout(300);
  await toggleReady(guestPage);

  // Wait for both pages to fully enter the game
  await Promise.all([waitForGameStart(hostPage), waitForGameStart(guestPage)]);
  // Also wait for the launchDuoGame Firestore transaction (sets status='playing',
  // resets finishTimes to null) to commit before any solve attempt.
  // This prevents submitDuoFinish from racing with the reset transaction.
  await waitForRoomStatus(hostPage, 'playing', 12000);
  console.log(`[duo-two-rounds] game started on both pages`);
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

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('duo-two-rounds', () => {
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
    hostPage.on('console', (msg) => {
      if (msg.text().includes('[duo]')) console.log('[H]', msg.text());
    });
    guestPage.on('console', (msg) => {
      if (msg.text().includes('[duo]')) console.log('[G]', msg.text());
    });

    await Promise.all([hostPage.goto('/'), guestPage.goto('/')]);
    await Promise.all([waitForE2E(hostPage), waitForE2E(guestPage)]);
    await Promise.all([waitForFirebase(hostPage), waitForFirebase(guestPage)]);

    await setAlias(hostPage, 'duo_h_e2e');
    await setAlias(guestPage, 'duo_g_e2e');
  });

  test.afterAll(async () => {
    await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
  });

  // ── Round 1 ──────────────────────────────────────────────────────────────

  test('局 1：先完成者收到等待 toast，雙方看到結果 modal', async () => {
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    await startRound(hostPage, guestPage);
    console.log('[duo-two-rounds] 局1 遊戲開始');

    // Host solves first
    await solveAllCells(hostPage);
    console.log('[duo-two-rounds] 局1 host 完成');

    // Verify: host sees "finishedFirst" feedback toast (not win celebration)
    const toastText = await hostPage.waitForFunction(
      () => {
        const toast = document.getElementById('feedback-toast');
        return toast && toast.textContent && toast.textContent.trim().length > 0 ? toast.textContent.trim() : null;
      },
      { timeout: 3000 },
    );
    const toastContent = await toastText.jsonValue();
    console.log('[duo-two-rounds] 局1 host toast:', toastContent);

    // Must NOT show win celebration overlay (would have wrong navigation buttons)
    const winCelebrationVisible = await hostPage.evaluate(() => {
      const overlay = document.getElementById('win-celebration-overlay');
      return overlay !== null && overlay.style.display !== 'none' && !overlay.classList.contains('hidden');
    });
    expect(winCelebrationVisible, 'win celebration overlay must NOT appear in duo mode').toBe(false);

    // Toast must contain waiting-related text (not empty)
    expect(toastContent, 'host should see a waiting feedback toast').toBeTruthy();
    await expect(hostPage.locator('#duo-finish-moment.local')).toBeVisible();
    await expect(hostPage.locator('#duo-finish-moment.local .duo-finish-moment-title')).toContainText('完成');
    await expect(guestPage.locator('#duo-finish-moment.opponent')).toBeVisible();
    console.log('[duo-two-rounds] ✓ win celebration 未出現，host 有 toast 通知');

    // Guest solves
    await guestPage.waitForTimeout(1500);
    await solveAllCells(guestPage);
    console.log('[duo-two-rounds] 局1 guest 完成');

    // callDuoFinish is async (lazy import + Firestore write) and not awaited by page.evaluate.
    // Poll Firestore directly to confirm both finishTimes are written, before waiting for modal.
    await hostPage.waitForFunction(
      async () => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (!e2e?.gs?.firebaseReady || !roomId) return false;
        const doc = await e2e.gs.db
          .collection('duo_rooms')
          .doc(roomId)
          .get()
          .catch(() => null);
        if (!doc?.exists) return false;
        const d = doc.data();
        return d?.hostFinishTime != null && d?.guestFinishTime != null;
      },
      { timeout: 20_000 },
    );
    console.log('[duo-two-rounds] 局1 Firestore 已有雙方 finishTime');

    // Both see result modal
    await Promise.all([waitForResultModal(hostPage), waitForResultModal(guestPage)]);
    console.log('[duo-two-rounds] 局1 雙方結果 modal 出現');

    // Firestore: both finish times set, host faster
    const room = await getDuoRoomData(hostPage);
    expect(room!.hostFinishTime).not.toBeNull();
    expect(room!.guestFinishTime).not.toBeNull();
    expect(Number(room!.hostFinishTime)).toBeLessThan(Number(room!.guestFinishTime));
    console.log(`[duo-two-rounds] ✓ 局1 host ${room!.hostFinishTime}s < guest ${room!.guestFinishTime}s`);

    // Host wins
    const hostWin = await hostPage.evaluate(
      () => document.querySelector('.duo-result-panel')?.classList.contains('victory') ?? false,
    );
    const guestLose = await guestPage.evaluate(
      () => document.querySelector('.duo-result-panel')?.classList.contains('defeat') ?? false,
    );
    expect(hostWin).toBe(true);
    expect(guestLose).toBe(true);
    await expect(hostPage.locator('.duo-result-panel.victory h2')).toHaveText('險勝');
    await expect(guestPage.locator('.duo-result-panel.defeat h2')).toHaveText('惜敗');
    await expect(hostPage.locator('#duo-finish-moment')).toHaveCount(0);
    await expect(guestPage.locator('#duo-finish-moment')).toHaveCount(0);
    console.log('[duo-two-rounds] ✓ 局1 勝負正確');
  });

  // ── Round 2 ──────────────────────────────────────────────────────────────

  test('局 2：關閉結果 modal 後再戰一局，雙方仍能看到結果', async () => {
    // Close result modal on both sides → returns to duo lobby
    await hostPage.evaluate(async () => {
      const m = await import('/src/features/duo/duoGame.ts');
      await m.closeDuoResult();
    });
    await guestPage.evaluate(async () => {
      const m = await import('/src/features/duo/duoGame.ts');
      await m.closeDuoResult();
    });

    // Wait for duo lobby to be visible on both sides
    await Promise.all([
      hostPage.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
        timeout: 10_000,
      }),
      guestPage.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
        timeout: 10_000,
      }),
    ]);
    console.log('[duo-two-rounds] 局2 雙方返回大廳');

    await hostPage.waitForTimeout(1500);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    await startRound(hostPage, guestPage);
    console.log('[duo-two-rounds] 局2 遊戲開始');

    // This time guest finishes first
    await solveAllCells(guestPage);
    console.log('[duo-two-rounds] 局2 guest 完成 (先)');

    // Guest should see waiting toast
    const guestToastText = await guestPage.waitForFunction(
      () => {
        const toast = document.getElementById('feedback-toast');
        return toast && toast.textContent && toast.textContent.trim().length > 0 ? toast.textContent.trim() : null;
      },
      { timeout: 3000 },
    );
    const guestToastContent = await guestToastText.jsonValue();
    console.log('[duo-two-rounds] 局2 guest toast:', guestToastContent);
    expect(guestToastContent, 'guest should see waiting feedback toast').toBeTruthy();

    // Win celebration must not appear for guest either
    const guestWinCelebration = await guestPage.evaluate(() => {
      const overlay = document.getElementById('win-celebration-overlay');
      return overlay !== null && overlay.style.display !== 'none' && !overlay.classList.contains('hidden');
    });
    expect(guestWinCelebration, 'win celebration must not appear for first-finisher guest').toBe(false);

    // Host finishes
    await hostPage.waitForTimeout(1500);
    await solveAllCells(hostPage);
    console.log('[duo-two-rounds] 局2 host 完成 (後)');

    // Poll Firestore to confirm both finishTimes written before waiting for modal
    await guestPage.waitForFunction(
      async () => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        if (!e2e?.gs?.firebaseReady || !roomId) return false;
        const doc = await e2e.gs.db
          .collection('duo_rooms')
          .doc(roomId)
          .get()
          .catch(() => null);
        if (!doc?.exists) return false;
        const d = doc.data();
        return d?.hostFinishTime != null && d?.guestFinishTime != null;
      },
      { timeout: 20_000 },
    );
    console.log('[duo-two-rounds] 局2 Firestore 已有雙方 finishTime');

    // Diagnose game state before waiting for modal
    const diagR2 = await hostPage.evaluate(async () => {
      const e2e = (window as unknown).__e2e;
      const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
      return {
        isDuoMode: e2e?.gs?.isDuoMode,
        duoRole: e2e?.gs?.duoRole,
        duoRoomDataStatus: e2e?.gs?.duoRoomData?.status,
        gsHostFinishTime: e2e?.gs?.duoRoomData?.hostFinishTime,
        gsGuestFinishTime: e2e?.gs?.duoRoomData?.guestFinishTime,
        duoResultStoreVisible: useDuoResultStore.getState().visible,
        resultModalInDom: !!document.getElementById('duo-result-modal'),
        hasUnsubscribe: !!e2e?.gs?.duoUnsubscribe,
      };
    });
    console.log('[duo-two-rounds] 局2 host 診斷:', JSON.stringify(diagR2));
    const diagR2g = await guestPage.evaluate(async () => {
      const e2e = (window as unknown).__e2e;
      const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
      return {
        isDuoMode: e2e?.gs?.isDuoMode,
        duoRole: e2e?.gs?.duoRole,
        duoRoomDataStatus: e2e?.gs?.duoRoomData?.status,
        gsHostFinishTime: e2e?.gs?.duoRoomData?.hostFinishTime,
        gsGuestFinishTime: e2e?.gs?.duoRoomData?.guestFinishTime,
        duoResultStoreVisible: useDuoResultStore.getState().visible,
        resultModalInDom: !!document.getElementById('duo-result-modal'),
        hasUnsubscribe: !!e2e?.gs?.duoUnsubscribe,
      };
    });
    console.log('[duo-two-rounds] 局2 guest 診斷:', JSON.stringify(diagR2g));

    // Wait for in-memory gs.duoRoomData to reflect Firestore (snapshot propagation)
    const hostGsUpdated = await hostPage
      .waitForFunction(
        () => {
          const e2e = (window as unknown).__e2e;
          return e2e?.gs?.duoRoomData?.hostFinishTime != null && e2e?.gs?.duoRoomData?.guestFinishTime != null;
        },
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    console.log('[duo-two-rounds] 局2 host gs更新:', hostGsUpdated);
    if (!hostGsUpdated) {
      const diagR2b = await hostPage.evaluate(async () => {
        const e2e = (window as unknown).__e2e;
        const roomId = localStorage.getItem('sudoku_duo_active_room_id');
        let fsData = null;
        if (e2e?.gs?.firebaseReady && roomId) {
          const doc = await e2e.gs.db
            .collection('duo_rooms')
            .doc(roomId)
            .get()
            .catch(() => null);
          fsData = doc?.exists ? doc.data() : null;
        }
        return {
          gsHostFinishTime: e2e?.gs?.duoRoomData?.hostFinishTime,
          gsGuestFinishTime: e2e?.gs?.duoRoomData?.guestFinishTime,
          gsStatus: e2e?.gs?.duoRoomData?.status,
          fsHostFinishTime: fsData?.hostFinishTime,
          fsGuestFinishTime: fsData?.guestFinishTime,
          fsStatus: fsData?.status,
        };
      });
      console.log('[duo-two-rounds] 局2 host 10s後仍無更新:', JSON.stringify(diagR2b));
    }

    // Both see result modal
    await Promise.all([waitForResultModal(hostPage, 15000), waitForResultModal(guestPage, 15000)]);
    console.log('[duo-two-rounds] 局2 雙方結果 modal 出現');

    const room2 = await getDuoRoomData(hostPage);
    expect(room2!.hostFinishTime).not.toBeNull();
    expect(room2!.guestFinishTime).not.toBeNull();
    expect(Number(room2!.guestFinishTime)).toBeLessThan(Number(room2!.hostFinishTime));
    console.log(`[duo-two-rounds] ✓ 局2 guest ${room2!.guestFinishTime}s < host ${room2!.hostFinishTime}s`);

    // Guest wins round 2
    const guestWin2 = await guestPage.evaluate(
      () => document.querySelector('.duo-result-panel')?.classList.contains('victory') ?? false,
    );
    const hostLose2 = await hostPage.evaluate(
      () => document.querySelector('.duo-result-panel')?.classList.contains('defeat') ?? false,
    );
    expect(guestWin2).toBe(true);
    expect(hostLose2).toBe(true);
    console.log('[duo-two-rounds] ✓ 局2 勝負正確（guest 勝）');
  });
});
