import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const APP_URL = '/';
const LOCAL_WS_HOST = process.env.E2E_DUO_WS_HOST ?? '127.0.0.1:8787';

async function boot(page: Page, alias: string): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    async ({ alias, host }) => {
      const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      localStorage.setItem('sudoku_player_alias', alias);
      localStorage.setItem('sudoku_e2e_mode', '1');
      localStorage.setItem('duo_ws', '1');
      localStorage.setItem('duo_ws_host', host);
      localStorage.removeItem('sudoku_duo_active_room_id');
      localStorage.removeItem('sudoku_duo_active_role');
      localStorage.removeItem('sudoku_duo_round_v1');
      localStorage.setItem(
        'sudoku_duo_profile_v2',
        JSON.stringify({ playCount: {}, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, rivals: {} }),
      );
    },
    { alias, host: LOCAL_WS_HOST },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __e2e?: unknown }).__e2e);
}

async function createRoom(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const duo = await import('/src/features/duo/index.ts');
    const roomId = await duo.createDuoRoom('tier0', 'standard');
    if (!roomId) throw new Error('create failed');
    duo.openDuoRoomView();
    return roomId;
  });
}

async function joinRoom(page: Page, roomId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const duo = await import('/src/features/duo/index.ts');
    if (!(await duo.joinDuoRoom(id))) throw new Error('join failed');
    duo.openDuoRoomView();
  }, roomId);
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const duo = await import('/src/features/duo/index.ts');
    await duo.toggleDuoReady();
  });
}

async function waitForBoard(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = document.querySelector('.game-container') as HTMLElement | null;
      return (
        game?.style.display === 'flex' &&
        document.querySelectorAll('.cell[data-idx]').length === 81 &&
        !document.getElementById('duo-countdown-overlay')
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function fillOne(page: Page): Promise<{ index: number; value: number; puzzle: string }> {
  return page.evaluate(() => {
    const e2e = (
      window as unknown as {
        __e2e: {
          gs: { currentLevel: { puzzle: number[]; solution: number[] } };
          selectCell(index: number): void;
          handleInput(value: number): void;
        };
      }
    ).__e2e;
    const index = e2e.gs.currentLevel.puzzle.findIndex((value) => value === 0);
    const value = e2e.gs.currentLevel.solution[index];
    e2e.selectCell(index);
    e2e.handleInput(value);
    return { index, value, puzzle: e2e.gs.currentLevel.puzzle.join('') };
  });
}

async function solve(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e2e = (
      window as unknown as {
        __e2e: {
          gs: { currentLevel: { puzzle: number[]; solution: number[] } };
          selectCell(index: number): void;
          handleInput(value: number): void;
        };
      }
    ).__e2e;
    for (let i = 0; i < 81; i++) {
      if (e2e.gs.currentLevel.puzzle[i] !== 0) continue;
      e2e.selectCell(i);
      e2e.handleInput(e2e.gs.currentLevel.solution[i]);
    }
  });
}

async function resumeAfterReload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __e2e?: unknown }).__e2e);
  await page.evaluate(async () => {
    const room = await import('/src/features/duo/duoRoom.ts');
    if (!(await room.resumeDuoRoomIfAny())) throw new Error('resume failed');
    const view = await import('/src/features/duo/duoRoomView.ts');
    view.openDuoRoomView();
  });
  await waitForBoard(page);
}

test.describe('Duo WS resilience', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('restores both boards and keeps both players in the room for a clean rematch', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    let hostContext: BrowserContext | null = null;
    let guestContext: BrowserContext | null = null;
    try {
      hostContext = await browser.newContext();
      guestContext = await browser.newContext();
      const host = await hostContext.newPage();
      const guest = await guestContext.newPage();
      await Promise.all([boot(host, `RH${Date.now()}`), boot(guest, `RG${Date.now()}`)]);
      const roomId = await createRoom(host);
      await joinRoom(guest, roomId);
      await Promise.all([ready(host), ready(guest)]);
      await Promise.all([waitForBoard(host), waitForBoard(guest)]);

      const [hostMove, guestMove] = await Promise.all([fillOne(host), fillOne(guest)]);
      expect(hostMove.puzzle).toBe(guestMove.puzzle);
      await host.waitForTimeout(800);

      await Promise.all([resumeAfterReload(host), resumeAfterReload(guest)]);
      await expect(host.locator(`.cell[data-idx="${hostMove.index}"]`)).toHaveText(String(hostMove.value));
      await expect(guest.locator(`.cell[data-idx="${guestMove.index}"]`)).toHaveText(String(guestMove.value));
      await expect(host.locator('#duo-progress-self-pct')).not.toHaveText('0%');
      await expect(guest.locator('#duo-progress-self-pct')).not.toHaveText('0%');

      await Promise.all([solve(host), solve(guest)]);
      await Promise.all([
        host.locator('#duo-result-modal .resume-btn').waitFor({ state: 'visible', timeout: 30_000 }),
        guest.locator('#duo-result-modal .resume-btn').waitFor({ state: 'visible', timeout: 30_000 }),
      ]);

      await host.locator('#duo-result-modal .resume-btn').click();
      await Promise.all([
        host.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden')),
        guest.waitForFunction(() => !document.getElementById('duo-room-view')?.classList.contains('hidden')),
      ]);
      expect(await host.evaluate(() => localStorage.getItem('sudoku_duo_active_room_id'))).toBe(roomId);
      expect(await guest.evaluate(() => localStorage.getItem('sudoku_duo_active_room_id'))).toBe(roomId);

      await Promise.all([ready(host), ready(guest)]);
      await Promise.all([waitForBoard(host), waitForBoard(guest)]);
      await expect(host.locator('#duo-progress-self-pct')).toHaveText('0%');
      await expect(host.locator('#duo-progress-opp-pct')).toHaveText('0%');
      await expect(guest.locator('#duo-progress-self-pct')).toHaveText('0%');
      await expect(guest.locator('#duo-progress-opp-pct')).toHaveText('0%');
    } finally {
      await hostContext?.close().catch(() => {});
      await guestContext?.close().catch(() => {});
    }
  });

  test('cancels a countdown disconnect and republishes the host room for five consecutive rounds', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    let hostContext: BrowserContext | null = null;
    let guestContext: BrowserContext | null = null;
    try {
      hostContext = await browser.newContext();
      guestContext = await browser.newContext();
      for (let round = 0; round < 5; round++) {
        const host = await hostContext.newPage();
        const guest = await guestContext.newPage();
        const stamp = `${Date.now()}${round}`;
        await Promise.all([boot(host, `CH${stamp}`), boot(guest, `CG${stamp}`)]);
        const roomId = await createRoom(host);
        await expect
          .poll(() =>
            host.evaluate(async () => {
              const duo = await import('/src/features/duo/index.ts');
              return duo.getWsLobbyMirrorDebugState();
            }),
          )
          .toEqual({ desiredVisible: true, roomId });
        await joinRoom(guest, roomId);

        await ready(host);
        await ready(guest);
        await guest.close();

        await host.waitForFunction(
          () => {
            const room = document.getElementById('duo-room-view');
            const game = document.querySelector('.game-container') as HTMLElement | null;
            const overlay = document.getElementById('duo-countdown-overlay');
            const state = (
              window as unknown as {
                __e2e?: { gs?: { duoRoomData?: { status?: string; guestId?: string | null } } };
              }
            ).__e2e?.gs?.duoRoomData;
            return (
              state?.status === 'waiting' &&
              !state.guestId &&
              !room?.classList.contains('hidden') &&
              game?.style.display !== 'flex' &&
              !overlay
            );
          },
          undefined,
          { timeout: 15_000 },
        );
        const mirrorState = await host.evaluate(async () => {
          const duo = await import('/src/features/duo/index.ts');
          return duo.getWsLobbyMirrorDebugState();
        });
        expect(mirrorState, `round ${round + 1}`).toMatchObject({ desiredVisible: true, roomId });
        await expect(host.locator('#duo-progress-self-pct')).toHaveText('0%');
        await expect(host.locator('#duo-progress-opp-pct')).toHaveText('0%');
        if (round === 4) {
          await host.screenshot({ path: 'output/duo-fix/countdown-disconnect-host.png', fullPage: true });
        }
        await host.close();
      }
    } finally {
      await hostContext?.close().catch(() => {});
      await guestContext?.close().catch(() => {});
    }
  });
});
