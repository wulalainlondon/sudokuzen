import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

const output = 'output/pwa-history-continuity-20261001/ui';
fs.mkdirSync(output, { recursive: true });
const runtimeFixture = `
import { editionProject } from '/src/platform/appEdition.ts';
window.SUDOKU_FIREBASE_CONFIG = { projectId: editionProject() };
const uid = 'qa_' + localStorage.getItem('sudoku_player_alias');
const query = { get: async () => ({ docs: [], forEach: () => {} }), onSnapshot: () => () => {},
  doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, delete: async () => {},
    collection: () => query, onSnapshot: () => () => {} }),
  orderBy: () => query, where: () => query, limit: () => query };
const db = { collection: () => query };
const firebase = { apps: [{}], firestore: () => db };
export const ensureFirebaseRuntime = async () => firebase;
export const initAnonymousAuth = async () => uid;
export const getAuthUid = () => uid;
export const getFirebaseIdToken = async () => null;
export const firebaseServerTimestamp = () => ({ toMillis: () => Date.now() });
export const firebaseTimestampFromMillis = n => ({ toMillis: () => n });
export const callDuoFunction = async () => ({});
export const getLegacyProfileDb = async () => null;
const legacyQuery = {
 get: async () => ({docs: [{data: () => ({playerId:'p_old_board', alias:'舊榜玩家', firstTimeSec:88, firstStars:3})}]}),
 orderBy: () => legacyQuery, limit: () => legacyQuery, collection: () => legacyQuery, doc: () => legacyQuery
};
export const getLegacyLeaderboardDb = async () => legacyQuery;
export const signOutLegacySession = async () => {};
export const deleteCurrentAuthUser = async () => {};
export const hasFirebaseSdkLoadFailure = () => false;
export const getFirebaseSdkFailureUrl = () => null;
`;
const originalProfile = {
  wins: 7,
  losses: 2,
  draws: 1,
  currentStreak: 3,
  bestStreak: 5,
  playCount: { 'tier0-standard': 12 },
};
const evidence = [];
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch({ headless: true });
  const contexts = [];
  try {
    const pages = {};
    async function boot(edition, role) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      contexts.push(context);
      await context.route('**/src/firebase/runtime.ts*', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: runtimeFixture }),
      );
      await context.addInitScript(
        ({ edition, role, originalProfile }) => {
          if (localStorage.getItem('qa_seeded')) return;
          localStorage.setItem('qa_seeded', '1');
          localStorage.setItem('sudoku_e2e_mode', '1');
          localStorage.setItem('sudoku_player_alias', edition + '_' + role);
          localStorage.setItem('sudoku_player_id', 'p_original_' + edition + '_' + role);
          localStorage.setItem('sudoku_legacy_player_id', 'old_journey');
          localStorage.setItem('sudoku_duo_profile_v2', JSON.stringify(originalProfile));
          localStorage.setItem(
            'sudoku_duo_profile_v2_' + edition,
            JSON.stringify({
              wins: 2,
              losses: 0,
              draws: 0,
              currentStreak: 2,
              bestStreak: 2,
              playCount: { 'tier0-standard': 2 },
              legacyPlayCount: originalProfile.playCount,
            }),
          );
          localStorage.setItem('duo_ws_host', 'localhost:' + (edition === 'ios' ? '8896' : '8895'));
        },
        { edition, role, originalProfile },
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`http://localhost:${edition === 'ios' ? '5196' : '5195'}/`);
      await page.waitForFunction(() => !!window.__e2e?.gs.firebaseReady);
      return { page, errors };
    }
    for (const edition of ['pwa', 'ios']) {
      pages[edition] = [await boot(edition, 'host'), await boot(edition, 'guest')];
      const page = pages[edition][0].page;
      await page.click('#stats-btn');
      const card = page.getByTestId('edition-records');
      await card.waitFor();
      const text = await card.innerText();
      assert(text.includes(edition === 'ios' ? 'iOS 版' : 'PWA 版'));
      assert(text.includes('7 勝 · 2 敗 · 1 平手'));
      assert(text.includes(edition === 'pwa' ? '9 勝 · 2 敗 · 1 平手' : '2 勝 · 0 敗 · 0 平手'));
      await page.screenshot({ path: `${output}/${name}-${edition}-history.png` });
      const download = page.waitForEvent('download');
      await card.getByRole('button', { name: '匯出舊雙人紀錄' }).click();
      const file = await download;
      await file.saveAs(`${output}/${name}-${edition}-export.json`);
      assert.equal(JSON.parse(fs.readFileSync(`${output}/${name}-${edition}-export.json`, 'utf8')).duoProfile.wins, 7);
      // Reload keeps history and current counters separate.
      await page.reload();
      await page.waitForFunction(() => !!window.__e2e?.gs.firebaseReady);
      const persisted = await page.evaluate(
        (edition) => ({
          old: JSON.parse(localStorage.getItem('sudoku_duo_profile_v2')),
          current: JSON.parse(localStorage.getItem('sudoku_duo_profile_v2_' + edition)),
        }),
        edition,
      );
      assert.equal(persisted.old.wins, 7);
      assert.equal(persisted.current.wins, 2);
      await page.locator('#stage-map .stage-node:not(.locked)').first().click();
      await page.locator('#level-list .level-item:not(.locked)').first().click();
      if (edition === 'pwa') {
        await page
          .getByTestId('pwa-existing-board')
          .getByText(/舊榜玩家/)
          .waitFor();
        assert((await page.getByTestId('pwa-existing-board').innerText()).includes('既有首通榜'));
        assert(await page.getByTestId('pwa-current-board').isVisible());
      } else {
        await page.locator('#pre-level-modal summary').click();
        assert((await page.locator('#pre-level-modal details').innerText()).includes('舊榜含 PWA 與 iOS 成績'));
      }
      await page.screenshot({ path: `${output}/${name}-${edition}-legacy-board.png` });
      await page.locator('#pre-level-modal .back-btn-light').click();
      for (const item of pages[edition]) {
        await item.page.evaluate(async () => {
          await window.openDuoLobby();
        });
        assert(
          (await item.page.locator('#duo-lobby-title').innerText()).includes(edition === 'ios' ? 'iOS 版' : 'PWA 版'),
        );
      }
      await page.screenshot({ path: `${output}/${name}-${edition}-lobby.png` });
      await page.evaluate(async () => {
        await window.createDuoRoomFromLobby();
      });
      await page.waitForFunction(() => !!localStorage.getItem('sudoku_duo_active_room_id'));
      const roomId = await page.evaluate(() => localStorage.getItem('sudoku_duo_active_room_id'));
      const guest = pages[edition][1].page;
      assert(
        await guest.evaluate(async (roomId) => {
          const duo = await import('/src/features/duo/duoRoom.ts');
          const joined = await duo.joinDuoRoom(roomId);
          if (joined) {
            window.closeDuoLobby();
            const view = await import('/src/features/duo/duoRoomView.ts');
            view.openDuoRoomView();
          }
          return joined;
        }, roomId),
      );
      // Ready loads the canonical shard, agrees on the fingerprint and starts.
      for (const current of [page, guest])
        await current.evaluate(async () => {
          const duo = await import('/src/features/duo/duoGame.ts');
          await duo.toggleDuoReady();
        });
      for (const current of [page, guest])
        await current.waitForFunction(
          () =>
            window.__e2e.gs.duoRoomData?.status === 'playing' &&
            document.querySelector('.game-container')?.style.display !== 'none',
          null,
          { timeout: 15000 },
        );
      await page.screenshot({ path: `${output}/${name}-${edition}-playing.png` });
      // The real input path completes both boards and records independent results.
      for (const current of [page, guest]) {
        await current.evaluate(() => {
          const e = window.__e2e;
          for (let index = 0; index < 81; index++)
            if (!e.gs.currentLevel.puzzle[index]) {
              e.selectCell(index);
              e.handleInput(e.gs.currentLevel.solution[index]);
            }
        });
      }
      for (const current of [page, guest])
        await current.waitForFunction(() => window.__e2e.gs.duoRoomData?.status === 'finished', { timeout: 15000 });
      await page.screenshot({ path: `${output}/${name}-${edition}-result.png` });
      const result = await page.evaluate(
        (edition) => ({
          oldWins: JSON.parse(localStorage.getItem('sudoku_duo_profile_v2')).wins,
          profile: JSON.parse(localStorage.getItem('sudoku_duo_profile_v2_' + edition)),
          resultText: document.querySelector('#duo-result-record')?.textContent,
          roomStatus: window.__e2e.gs.duoRoomData.status,
        }),
        edition,
      );
      assert.equal(result.oldWins, 7);
      const base = edition === 'pwa' ? originalProfile : { wins: 0, losses: 0, draws: 0 };
      assert(
        result.resultText.includes(
          `${base.wins + result.profile.wins}W ${base.losses + result.profile.losses}L ${base.draws + result.profile.draws}D`,
        ),
      );
      assert.equal(result.profile.wins + result.profile.losses + result.profile.draws, 3);
      for (const current of [page, guest])
        await current.evaluate(async () => {
          const socket = await import('/src/features/duo/duoSocket.ts');
          socket.duoWsDisconnect();
        });
      evidence.push({ engine: name, edition, migratedHistory: true, export: true, fullDuo: true, result });
    }
    for (const edition of ['pwa', 'ios']) for (const item of pages[edition]) assert.deepEqual(item.errors, []);
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
fs.writeFileSync(`${output}/verification.json`, JSON.stringify({ pass: true, checks: evidence }, null, 2));
console.log(JSON.stringify({ pass: true, scenarios: evidence.length, engines: ['chromium', 'webkit'] }));
