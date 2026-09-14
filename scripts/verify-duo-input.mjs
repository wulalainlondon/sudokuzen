// Isolated browser regression against a dev server. No socket is opened and no
// live room is published; launch/snapshot/persistence use the real app modules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5181';
const output = path.resolve('output/duo-input-verification');
fs.mkdirSync(output, { recursive: true });
const results = [];

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const role of ['host', 'guest']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(role => {
        localStorage.setItem('sudoku_e2e_mode', '1');
        localStorage.setItem('sudoku_duo_active_room_id', 'input-fixture');
        localStorage.setItem('sudoku_duo_active_role', role);
        localStorage.setItem('sudoku_erase_visible', '1');
      }, role);
      await context.route('**/firebase-config*.js', route => route.fulfill({ contentType: 'application/javascript', body: '// Isolated input fixture.' }));
      const errors = [];
      const launch = async (page, seed = 3) => {
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => !!window.__e2e?.gs);
        await page.evaluate(async ({ role, seed }) => {
          const gs = window.__e2e.gs;
          gs.duoRole = role;
          gs.duoRoomData = { tierId: 'tier0', modeId: 'standard', puzzleSeed: seed, status: 'playing', hostId: 'fixture-host', hostAlias: 'Host', guestId: 'fixture-guest', guestAlias: 'Guest', hostProgress: 0, guestProgress: 0, hostFinishTime: null, guestFinishTime: null };
          await (await import('/src/features/duo/duoGame.ts')).launchDuoGame();
        }, { role, seed });
        await page.locator('.game-container').waitFor({ state: 'visible' });
      };
      let page = await context.newPage();
      await launch(page);
      const { idx, correct, wrong } = await page.evaluate(() => {
        const gs = window.__e2e.gs;
        const idx = gs.cellsData.findIndex(cell => !cell.fixed);
        const correct = gs.currentLevel.solution[idx];
        return { idx, correct, wrong: correct % 9 + 1 };
      });
      await page.locator(`[data-idx="${idx}"]`).tap();
      await page.locator('#note-toggle').tap();
      await page.locator('.num-btn').nth(correct - 1).tap();
      await page.locator('#note-toggle').tap();
      await page.locator('.num-btn').nth(wrong - 1).tap();
      const immediate = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_duo_round_v1')));
      assert.equal(immediate.cells[idx].value, 0);
      assert.deepEqual(immediate.cells[idx].notes, [correct]);
      assert.equal(immediate.errors, 1);
      assert.equal(immediate.moves.at(-1).ok, false);
      // Close without running beforeunload: the input itself must already be durable.
      await page.close();
      page = await context.newPage();
      await launch(page);
      const restored = await page.evaluate(idx => ({ cell: window.__e2e.gs.cellsData[idx], errors: window.__e2e.gs.errors }), idx);
      assert.equal(restored.cell.value, 0);
      assert.deepEqual(restored.cell.notes, [correct]);
      assert.equal(restored.errors, 1);
      await page.locator(`[data-idx="${idx}"]`).tap();
      await page.locator('.num-btn').nth(correct - 1).tap();
      const afterCorrect = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_duo_round_v1')));
      assert.equal(afterCorrect.cells[idx].value, correct);
      assert.equal(afterCorrect.moves.at(-1).ok, true);
      await page.locator('#erase-btn').tap();
      const afterErase = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_duo_round_v1')));
      assert.equal(afterErase.cells[idx].value, 0);
      assert.equal(afterErase.moves.at(-1).val, 0);
      await page.screenshot({ path: path.join(output, `${name}-${role}-restored.png`) });
      await page.evaluate(async () => {
        const gs = window.__e2e.gs;
        gs.duoRoomData.puzzleSeed = 4;
        await (await import('/src/features/duo/duoGame.ts')).launchDuoGame();
      });
      assert(await page.evaluate(() => window.__e2e.gs.cellsData.every(cell => cell.notes.length === 0)), 'rematch must not restore old notes');
      assert.equal(await page.evaluate(() => window.__e2e.gs.errors), 0);
      assert.deepEqual(errors, []);
      results.push({ browser: name, role, immediateSnapshot: true, hardCloseRecovery: true, notesPreserved: true, correctAndEraseSaved: true, rematchIsolated: true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
