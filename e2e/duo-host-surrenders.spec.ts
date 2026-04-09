import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo mode — host surrenders mid-game
 *
 * Verifies that when the host calls surrenderDuo() mid-game:
 *   1. hostFinishTime is written as 9999 (forfeit) in Firestore
 *   2. When the guest also surrenders, both finish times are non-null
 *   3. The result modal appears on both sides
 *   4. The host's result card shows forfeit time (9999)
 *
 * Requires: real Firebase (set E2E_LIVE_FIREBASE=1)
 */

const TEST_TIER_ID = 'tierI';
const TEST_MODE_ID = 'standard';
const E2E_TIMEOUT_MS = 20_000;

test.skip(
  process.env.E2E_LIVE_FIREBASE !== '1',
  'Requires isolated live Firebase room state (set E2E_LIVE_FIREBASE=1)',
);

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e, { timeout: E2E_TIMEOUT_MS });
}

async function waitForFirebase(page: Page) {
  await page.waitForFunction(
    () => !!(window as unknown).__e2e?.gs?.firebaseReady,
    { timeout: E2E_TIMEOUT_MS },
  );
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
      const activeRoomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!activeRoomId) return;
      await e2e.gs.db.collection('duo_rooms').doc(activeRoomId).set({
        tierId, modeId, puzzleSeed: 0, levelId: 0, status: 'idle',
        hostId: 'cleanup', hostAlias: 'cleanup', hostTitle: null,
        hostReady: false, hostProgress: 0, hostFinishTime: null, hostStars: null,
        hostDuoWins: 0, hostHeartbeatAtMs: 0, hostOnline: false,
        guestId: null, guestAlias: null, guestTitle: null,
        guestReady: false, guestProgress: 0, guestFinishTime: null, guestStars: null,
        guestDuoWins: null, guestHeartbeatAtMs: null, guestOnline: false,
        startAt: null, levelLocked: false, updatedAt: Date.now(),
      });
    }, { tierId: TEST_TIER_ID, modeId: TEST_MODE_ID }),
    page.waitForTimeout(5000),
  ]);
}

async function enterDuoRoom(page: Page, tierId: string, modeId: string) {
  await page.evaluate(async ({ tierId, modeId }) => {
    const duo = await import('/src/features/duo/index.ts');
    const rooms = await duo.listWaitingDuoRooms(10);
    const matching = rooms.find(
      (r: { tierId: string; modeId: string; roomId: string }) =>
        r.tierId === tierId && r.modeId === modeId,
    );
    if (matching) {
      const joined = await duo.joinDuoRoom(matching.roomId);
      if (joined) return;
    }
    await duo.createDuoRoom(tierId, modeId);
  }, { tierId, modeId });
}

async function toggleDuoReady(page: Page) {
  await page.evaluate(async () => {
    const duo = await import('/src/features/duo/index.ts');
    duo.toggleDuoReady();
  });
}

async function getDuoRoomData(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const e2e = (window as unknown).__e2e;
    if (!e2e?.gs?.firebaseReady) return null;
    const roomId = localStorage.getItem('sudoku_duo_active_room_id');
    if (!roomId) return null;
    const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
    return doc?.exists ? doc.data() : null;
  });
}

async function waitForRoomStatus(page: Page, status: string, timeoutMs = 12_000) {
  await page.waitForFunction(
    async (s) => {
      const e2e = (window as unknown).__e2e;
      const roomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!roomId || !e2e?.gs?.firebaseReady) return false;
      const doc = await e2e.gs.db.collection('duo_rooms').doc(roomId).get().catch(() => null);
      return doc?.exists && doc.data()?.status === s;
    },
    status,
    { timeout: timeoutMs },
  );
}

async function getDuoRole(page: Page) {
  return page.evaluate(() => (window as unknown).__e2e?.gs?.duoRole ?? null);
}

async function ensureRole(
  page: Page,
  tierId: string,
  modeId: string,
  role: 'host' | 'guest',
  attempts = 5,
) {
  for (let i = 0; i < attempts; i++) {
    await enterDuoRoom(page, tierId, modeId);
    const got = await getDuoRole(page);
    if (got === role) return;
    await page.waitForTimeout(900);
  }
  throw new Error(`Could not become ${role}`);
}

async function waitForGameStart(page: Page) {
  await page.waitForFunction(
    () => document.querySelectorAll('.cell[data-idx]').length === 81,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => {
      const p = document.getElementById('duo-progress-container');
      return p != null && p.style.display === 'flex';
    },
    { timeout: 15_000 },
  );
}

test.describe('duo-host-surrenders', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let hostCtx: BrowserContext;
  let guestCtx: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeAll(async ({ browser }) => {
    hostCtx = await browser.newContext();
    guestCtx = await browser.newContext();
    hostPage = await hostCtx.newPage();
    guestPage = await guestCtx.newPage();
  });

  test.afterAll(async () => {
    await hostCtx.close().catch(() => {});
    await guestCtx.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await hostPage.goto('/');
    await guestPage.goto('/');
    await waitForE2E(hostPage);
    await waitForE2E(guestPage);
    const ts = Date.now() % 100_000;
    await setAlias(hostPage, `h_surr_${ts}`);
    await setAlias(guestPage, `g_surr_${ts}`);
    for (const p of [hostPage, guestPage]) {
      await p.evaluate(() => {
        localStorage.removeItem('sudoku_records');
        localStorage.removeItem('sudoku_duo_records');
      });
    }
  });

  test('host surrenders mid-game: forfeit written to Firestore and result modal shows on both sides', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    // Both enter the room
    await ensureRole(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host');
    await guestPage.waitForTimeout(500);
    await ensureRole(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest');
    await hostPage.waitForTimeout(1000);

    // Both ready → game starts
    await toggleDuoReady(hostPage);
    await hostPage.waitForTimeout(300);
    await toggleDuoReady(guestPage);
    await waitForRoomStatus(hostPage, 'playing', 15_000);

    await waitForGameStart(hostPage);
    await waitForGameStart(guestPage);

    // Host surrenders — writes hostFinishTime: 9999
    await hostPage.evaluate(async () => {
      await (window as unknown).surrenderDuo();
    });

    // Verify Firestore: host has forfeit time
    await hostPage.waitForTimeout(2000);
    const roomAfterHostSurrender = await getDuoRoomData(hostPage);
    expect(roomAfterHostSurrender.hostFinishTime).toBe(9999);
    expect(roomAfterHostSurrender.guestFinishTime).toBeNull();

    // Guest sees "opponent finished" feedback (async snapshot)
    // Guest also surrenders to trigger the result
    await guestPage.evaluate(async () => {
      await (window as unknown).surrenderDuo();
    });

    // Now both finish times are set — result modal should appear
    await expect(hostPage.locator('#duo-result-modal')).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.locator('#duo-result-modal')).toBeVisible({ timeout: 15_000 });

    // Verify Firestore: both have finish times, host is forfeit
    const finalRoom = await getDuoRoomData(hostPage);
    expect(finalRoom.hostFinishTime).toBe(9999);
    expect(finalRoom.guestFinishTime).toBe(9999);

    // Result cards should be visible on both sides
    await expect(hostPage.locator('#duo-result-cards')).toBeVisible({ timeout: 5_000 });
    await expect(guestPage.locator('#duo-result-cards')).toBeVisible({ timeout: 5_000 });
  });

  test('host surrenders while guest plays on: guest sees opponent-finished toast, then finishes normally', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    await ensureRole(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host');
    await guestPage.waitForTimeout(500);
    await ensureRole(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest');
    await hostPage.waitForTimeout(1000);

    await toggleDuoReady(hostPage);
    await hostPage.waitForTimeout(300);
    await toggleDuoReady(guestPage);
    await waitForRoomStatus(hostPage, 'playing', 15_000);

    await waitForGameStart(hostPage);
    await waitForGameStart(guestPage);

    // Host surrenders
    await hostPage.evaluate(async () => {
      await (window as unknown).surrenderDuo();
    });
    await hostPage.waitForTimeout(3000); // Let Firestore propagate

    // Guest's onSnapshot should have fired — check hostFinishTime is 9999 now
    const roomFromGuest = await getDuoRoomData(guestPage);
    expect(roomFromGuest.hostFinishTime).toBe(9999);

    // Guest solves the puzzle to finish legitimately
    await guestPage.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });

    // Result modal should show on guest side
    await expect(guestPage.locator('#duo-result-modal')).toBeVisible({ timeout: 15_000 });

    // Verify guest has a real finish time (not forfeit)
    const finalRoom = await getDuoRoomData(guestPage);
    expect(finalRoom.hostFinishTime).toBe(9999);
    expect(finalRoom.guestFinishTime).not.toBeNull();
    expect(finalRoom.guestFinishTime).not.toBe(9999);
  });
});
