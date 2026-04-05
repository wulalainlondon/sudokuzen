import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E: Duo sync — real Firebase
 * Two browser contexts (host + guest) pair into the same room,
 * see each other's progress, and produce consistent results.
 *
 * Requires: real Firebase project (sudokuzen-f2aa3) accessible from test env.
 * Uses duo_rooms/<active-room-id> — tests clean up after themselves.
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
    // Force a unique player ID
    localStorage.setItem('sudoku_player_id', `test_${a}_${Date.now()}`);
  }, alias);
}

/** Clean up the shared duo room into a known idle schema. */
async function cleanupDuoRoom(page: Page) {
  await Promise.race([
    page.evaluate(async ({ tierId, modeId }) => {
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
      } catch { /* ignore */ }
    }, { tierId: TEST_TIER_ID, modeId: TEST_MODE_ID }),
    page.waitForTimeout(5000),
  ]);
}

/** Enter a duo room for the given tier+mode: join a waiting room if one exists, otherwise create as host. */
async function enterDuoRoom(page: Page, tierId: string, modeId: string) {
  await page.evaluate(async ({ tierId, modeId }) => {
    const duo = await import('/src/features/duo/index.ts');
    const rooms = await duo.listWaitingDuoRooms(10);
    const matching = rooms.find((r: { tierId: string; modeId: string; roomId: string }) => r.tierId === tierId && r.modeId === modeId);
    if (matching) {
      const joined = await duo.joinDuoRoom(matching.roomId);
      if (joined) return;
    }
    await duo.createDuoRoom(tierId, modeId);
  }, { tierId, modeId });
}

/** Toggle duo ready state. */
async function toggleDuoReady(page: Page) {
  await page.evaluate(async () => {
    const duo = await import('/src/features/duo/index.ts');
    duo.toggleDuoReady();
  });
}

/** Get duo room data from Firestore. */
async function getDuoRoomData(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const e2e = (window as unknown).__e2e;
    if (!e2e?.gs?.firebaseReady) return null;
    const roomId = localStorage.getItem('sudoku_duo_active_room_id');
    if (!roomId) return null;
    const ref = e2e.gs.db.collection('duo_rooms').doc(roomId);
    const doc = await ref.get().catch(() => null);
    if (!doc) return null;
    return doc.exists ? doc.data() : null;
  });
}

async function waitForRoomStatus(page: Page, status: string, timeoutMs = 10000): Promise<void> {
  await page.waitForFunction(
    async (targetStatus) => {
      const e2e = (window as unknown).__e2e;
      if (!e2e?.gs?.firebaseReady) return false;
      const roomId = localStorage.getItem('sudoku_duo_active_room_id');
      if (!roomId) return false;
      const ref = e2e.gs.db.collection('duo_rooms').doc(roomId);
      const doc = await ref.get().catch(() => null);
      if (!doc) return false;
      const data = doc.exists ? doc.data() : null;
      return data?.status === targetStatus;
    },
    status,
    { timeout: timeoutMs },
  );
}

async function ensureRoleAndStatus(
  page: Page,
  tierId: string,
  modeId: string,
  expectedRole: 'host' | 'guest',
  expectedStatus: string,
  attempts = 5,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await enterDuoRoom(page, tierId, modeId);
    const role = await getDuoRole(page);
    if (role === expectedRole) {
      try {
        await waitForRoomStatus(page, expectedStatus, 8000);
        return;
      } catch {
        // Room can be overwritten by stale clients in shared env; retry create/join.
      }
    }
    await page.waitForTimeout(900);
  }
  throw new Error(`Failed to reach role=${expectedRole}, status=${expectedStatus}`);
}

/** Get the duo role for this page's session. */
async function getDuoRole(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown).__e2e?.gs?.duoRole ?? null);
}

/** Fill all empty cells with correct answers. */
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

test.describe('duo-sync', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(process.env.E2E_LIVE_FIREBASE !== '1', 'Requires isolated live Firebase room state (set E2E_LIVE_FIREBASE=1)');
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeAll(async ({ browser }) => {
    hostContext = await browser.newContext();
    guestContext = await browser.newContext();
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();
  });

  test.afterAll(async () => {
    try { await Promise.race([hostContext.close(), new Promise((r) => setTimeout(r, 8000))]); } catch { /* ignore */ }
    try { await Promise.race([guestContext.close(), new Promise((r) => setTimeout(r, 8000))]); } catch { /* ignore */ }
  });

  test.beforeEach(async () => {
    // Fresh state for each test
    await hostPage.goto('/');
    await guestPage.goto('/');
    await waitForE2E(hostPage);
    await waitForE2E(guestPage);

    // Set distinct aliases and player IDs
    await setAlias(hostPage, 'host_e2e');
    await setAlias(guestPage, 'guest_e2e');

    // Clear localStorage
    await hostPage.evaluate(() => {
      localStorage.removeItem('sudoku_records');
      localStorage.removeItem('sudoku_duo_records');
    });
    await guestPage.evaluate(() => {
      localStorage.removeItem('sudoku_records');
      localStorage.removeItem('sudoku_duo_records');
    });
  });

  test('host creates room and guest joins', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);

    // Clean up any stale room
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    // Host creates room
    await ensureRoleAndStatus(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host', 'waiting');
    const hostRole = await getDuoRole(hostPage);
    expect(hostRole).toBe('host');

    // Verify room is waiting
    const roomAfterHost = await getDuoRoomData(hostPage);
    expect(roomAfterHost.status).toBe('waiting');
    expect(roomAfterHost.hostAlias).toBe('host_e2e');
    expect(roomAfterHost.guestId).toBeNull();

    // Guest joins
    await ensureRoleAndStatus(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest', 'waiting');
    const guestRole = await getDuoRole(guestPage);
    expect(guestRole).toBe('guest');

    // Verify room has both players
    await hostPage.waitForTimeout(1000); // Wait for snapshot propagation
    const roomAfterGuest = await getDuoRoomData(hostPage);
    expect(roomAfterGuest.guestAlias).toBe('guest_e2e');
    expect(roomAfterGuest.guestId).not.toBeNull();
  });

  test('both ready triggers countdown and game start', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    // Host creates, guest joins
    await ensureRoleAndStatus(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host', 'waiting');
    await guestPage.waitForTimeout(500);
    await ensureRoleAndStatus(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest', 'waiting');
    await hostPage.waitForTimeout(1000);

    // Both toggle ready
    await toggleDuoReady(hostPage);
    await hostPage.waitForTimeout(300);
    await toggleDuoReady(guestPage);

    // Wait for countdown to complete (4s countdown + 300ms delay)
    await hostPage.waitForTimeout(5000);
    await waitForRoomStatus(hostPage, 'playing', 12000);

    // Verify room status is 'playing'
    const room = await getDuoRoomData(hostPage);
    expect(room.status).toBe('playing');
  });

  test('progress syncs between players', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    // Setup: host creates, guest joins, both ready
    await ensureRoleAndStatus(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host', 'waiting');
    await guestPage.waitForTimeout(500);
    await ensureRoleAndStatus(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest', 'waiting');
    await hostPage.waitForTimeout(1000);
    await toggleDuoReady(hostPage);
    await hostPage.waitForTimeout(300);
    await toggleDuoReady(guestPage);
    await hostPage.waitForTimeout(5500); // Wait for game to start
    await waitForRoomStatus(hostPage, 'playing', 12000);

    // Host fills a few cells
    await hostPage.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const puzzle = e2e.gs.currentLevel.puzzle;
      const solution = e2e.gs.currentLevel.solution;
      let filled = 0;
      for (let i = 0; i < 81 && filled < 3; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
          filled++;
        }
      }
    });

    // Force progress update (bypass throttle)
    await hostPage.evaluate(async () => {
      const duo = await import('/src/features/duo/index.ts');
      (window as unknown).__e2e.gs.duoProgressThrottle = 0;
      duo.updateDuoProgress();
    });

    // Wait for Firestore propagation
    await hostPage.waitForTimeout(3000);

    // Verify host progress is reflected in the room
    const room = await getDuoRoomData(guestPage);
    expect(room.hostProgress).toBeGreaterThanOrEqual(3);
  });

  test('both finish produces consistent result', async () => {
    await waitForFirebase(hostPage);
    await waitForFirebase(guestPage);
    await cleanupDuoRoom(hostPage);
    await hostPage.waitForTimeout(1200);

    // Setup: create room, join, ready, start
    await ensureRoleAndStatus(hostPage, TEST_TIER_ID, TEST_MODE_ID, 'host', 'waiting');
    await guestPage.waitForTimeout(500);
    await ensureRoleAndStatus(guestPage, TEST_TIER_ID, TEST_MODE_ID, 'guest', 'waiting');
    await hostPage.waitForTimeout(1000);
    await toggleDuoReady(hostPage);
    await hostPage.waitForTimeout(300);
    await toggleDuoReady(guestPage);
    await hostPage.waitForTimeout(5500);
    await waitForRoomStatus(hostPage, 'playing', 12000);

    // Host solves first
    await solveAllCells(hostPage);
    await hostPage.waitForTimeout(2000);

    // Guest solves
    await solveAllCells(guestPage);
    await guestPage.waitForTimeout(3000);

    // Both should have finish times in the room
    const room = await getDuoRoomData(hostPage);
    expect(room.hostFinishTime).not.toBeNull();
    expect(room.guestFinishTime).not.toBeNull();
    expect(room.hostStars).toBeGreaterThanOrEqual(1);
    expect(room.guestStars).toBeGreaterThanOrEqual(1);

    // Host finished first, so host time should be <= guest time
    expect(room.hostFinishTime).toBeLessThanOrEqual(room.guestFinishTime);
  });
});
