import { test, expect, type Page } from '@playwright/test';

/**
 * Probe the exact reason why client updates get PERMISSION_DENIED.
 * Pair host+guest, start a game, then run a manual update from host page
 * and capture: auth.uid, room snapshot, error.code, error.message.
 */

const LIVE_URL = 'https://wulalainlondon.github.io/sudokuzen/';
const TS = (Date.now() + 7) % 100_000;
const HOST = `ph${TS}`;
const GUEST = `pg${TS}`;

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

test.describe('duo-live-permission-probe', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test('captures exact permission denied details', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    hostPage.on('console', (msg) => {
      console.log(`[host:${msg.type()}] ${msg.text()}`);
    });
    guestPage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[guest:${msg.type()}] ${msg.text()}`);
      }
    });

    try {
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

      // Wait long enough for firebase auth to be fully ready
      await hostPage.waitForTimeout(5000);

      // Open lobby + create room
      await hostPage.evaluate(() => (window as Record<string, unknown>).openDuoLobby?.());
      await hostPage.waitForFunction(() => !document.getElementById('duo-lobby')?.classList.contains('hidden'), {
        timeout: 20_000,
      });
      await hostPage.evaluate(() => (window as Record<string, unknown>).createDuoRoomFromLobby?.());
      await hostPage.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden'), {
        timeout: 25_000,
      });

      // Inspect host context: auth, active room, current room data
      const probe1 = await hostPage.evaluate(async () => {
        const fb = (window as Record<string, unknown>).firebase as {
          auth?: () => { currentUser?: { uid?: string } };
          firestore?: () => unknown;
        };
        const gs = (window as Record<string, unknown>).gs as {
          duoRole?: string;
          duoRoomData?: Record<string, unknown>;
          db?: {
            collection: (n: string) => {
              doc: (id: string) => { get: () => Promise<unknown>; update: (d: unknown) => Promise<unknown> };
            };
          };
        };
        const roomId = localStorage.getItem('sudoku_duo_active_room');
        const auth = fb?.auth?.();
        const result: Record<string, unknown> = {
          authUid: auth?.currentUser?.uid ?? null,
          duoRole: gs?.duoRole ?? null,
          duoRoomId: roomId,
          duoRoomData_hostId: gs?.duoRoomData?.hostId ?? null,
          duoRoomData_status: gs?.duoRoomData?.status ?? null,
        };
        // Read fresh server state
        if (roomId && gs?.db) {
          try {
            const snap = (await gs.db.collection('duo_rooms').doc(roomId).get()) as {
              exists?: boolean;
              data?: () => unknown;
            };
            const data = (snap.data?.() ?? null) as Record<string, unknown> | null;
            result.serverState = {
              exists: snap.exists,
              status: data?.status,
              hostId: data?.hostId,
              guestId: data?.guestId,
              hostAlias: data?.hostAlias,
              levelId: data?.levelId,
              puzzleSeed: data?.puzzleSeed,
            };
          } catch (e) {
            result.serverStateError = (e as Error).message;
          }
        }
        return result;
      });
      console.log('[probe1 just after createRoom]', JSON.stringify(probe1, null, 2));

      // Try a minimal update — just bump hostProgress
      const probe2 = await hostPage.evaluate(async () => {
        const gs = (window as Record<string, unknown>).gs as {
          db?: { collection: (n: string) => { doc: (id: string) => { update: (d: unknown) => Promise<unknown> } } };
        };
        const roomId = localStorage.getItem('sudoku_duo_active_room');
        if (!roomId || !gs?.db) return { error: 'no roomId or db' };
        const fb = (window as Record<string, unknown>).firebase as {
          firestore?: { FieldValue?: { serverTimestamp: () => unknown } };
        };
        try {
          await gs.db.collection('duo_rooms').doc(roomId).update({
            hostProgress: 1,
            updatedAt: fb?.firestore?.FieldValue?.serverTimestamp(),
          });
          return { success: true };
        } catch (e) {
          const err = e as { code?: string; message?: string; name?: string };
          return { error: true, code: err.code, name: err.name, message: err.message };
        }
      });
      console.log('[probe2 minimal update on waiting room]', JSON.stringify(probe2, null, 2));

      // Try without updatedAt
      const probe3 = await hostPage.evaluate(async () => {
        const gs = (window as Record<string, unknown>).gs as {
          db?: { collection: (n: string) => { doc: (id: string) => { update: (d: unknown) => Promise<unknown> } } };
        };
        const roomId = localStorage.getItem('sudoku_duo_active_room');
        if (!roomId || !gs?.db) return { error: 'no roomId or db' };
        try {
          await gs.db.collection('duo_rooms').doc(roomId).update({
            hostProgress: 2,
          });
          return { success: true };
        } catch (e) {
          const err = e as { code?: string; message?: string; name?: string };
          return { error: true, code: err.code, name: err.name, message: err.message };
        }
      });
      console.log('[probe3 update without updatedAt]', JSON.stringify(probe3, null, 2));

      // Cleanup
      await hostPage.evaluate(() => (window as Record<string, unknown>).leaveDuoRoom?.());
    } finally {
      await Promise.allSettled([hostCtx.close(), guestCtx.close()]);
    }
  });
});
