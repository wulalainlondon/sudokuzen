#!/usr/bin/env node
/**
 * Duo Mode 2.0 — E2E two-player test via Playwright
 * Opens two isolated browser contexts (Player A = host, Player B = guest)
 * and walks through: lobby → create room → join → ready → countdown → play
 *
 * Usage: node scripts/duo-e2e-test.mjs [--headed]
 */

import { chromium } from 'playwright';

const HEADED = process.argv.includes('--headed');
const URL = 'http://localhost:5173/';
const NOTE20 = { width: 412, height: 915 };

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

async function waitForApp(page, tag) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Wait for stage map to render (app booted)
  await page.waitForFunction(() => {
    const stageMap = document.getElementById('stage-map');
    return stageMap && stageMap.children.length > 0;
  }, { timeout: 10000 });
  log(tag, 'App booted');
}

async function getPlayerAlias(page) {
  return page.evaluate(() => {
    const el = document.getElementById('alias-input');
    return el?.value || localStorage.getItem('sudoku_player_alias') || 'unknown';
  });
}

async function screenshot(page, name) {
  const path = `/tmp/duo-e2e-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  log('SNAP', path);
  return path;
}

(async () => {
  log('INIT', `Headed: ${HEADED}`);

  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 100 : 0 });

  // Two isolated contexts = two separate players
  const ctxA = await browser.newContext({ viewport: NOTE20, deviceScaleFactor: 2 });
  const ctxB = await browser.newContext({ viewport: NOTE20, deviceScaleFactor: 2 });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // ── Boot both apps ─────────────────────────────────────────────
  log('BOOT', 'Loading app for both players...');
  await Promise.all([waitForApp(pageA, 'A'), waitForApp(pageB, 'B')]);

  const aliasA = await getPlayerAlias(pageA);
  const aliasB = await getPlayerAlias(pageB);
  log('A', `Alias: ${aliasA}`);
  log('B', `Alias: ${aliasB}`);

  // ── Wait for Firebase ──────────────────────────────────────────
  log('FIREBASE', 'Waiting for Firebase ready...');
  const fbReady = async (page, tag) => {
    const ready = await page.evaluate(() => {
      const gs = (window).__e2e?.gs;
      return gs?.firebaseReady || false;
    });
    log(tag, `Firebase ready: ${ready}`);
    if (!ready) {
      // Wait a bit more
      await page.waitForTimeout(3000);
      const retry = await page.evaluate(() => (window).__e2e?.gs?.firebaseReady || false);
      log(tag, `Firebase ready (retry): ${retry}`);
      if (!retry) {
        log(tag, '⚠️  Firebase not ready — duo test requires Firebase. Aborting.');
        return false;
      }
    }
    return true;
  };

  const [fbA, fbB] = await Promise.all([fbReady(pageA, 'A'), fbReady(pageB, 'B')]);
  if (!fbA || !fbB) {
    log('ABORT', 'Firebase not ready on one or both players. Make sure Firebase is configured.');
    await browser.close();
    process.exit(1);
  }

  // ── Player A: open duo lobby & create room ─────────────────────
  log('A', 'Opening duo lobby...');
  await pageA.evaluate(() => window.openDuoLobby());
  await pageA.waitForTimeout(2000);
  await screenshot(pageA, '1-a-lobby');

  // Capture console errors
  const errorsA = [];
  pageA.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errorsA.push(msg.text()); });
  const errorsB = [];
  pageB.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errorsB.push(msg.text()); });

  log('A', 'Creating room (tierI, standard)...');
  await pageA.evaluate(async () => { await window.createDuoRoomFromLobby(); });
  await pageA.waitForTimeout(3000);
  await screenshot(pageA, '2-a-room-created');

  // Get the room ID
  const roomId = await pageA.evaluate(() => {
    const el = document.getElementById('duo-room-id-text');
    return el?.textContent || '';
  });
  log('A', `Room: ${roomId}`);

  // Debug: check gs state
  const gsStateA = await pageA.evaluate(() => {
    const gs = (window).__e2e?.gs;
    return { role: gs?.duoRole, roomData: gs?.duoRoomData ? 'exists' : 'null', fb: gs?.firebaseReady };
  });
  log('A', `gs state: ${JSON.stringify(gsStateA)}`);
  if (errorsA.length) log('A', `Console warnings/errors: ${errorsA.slice(0, 5).join(' | ')}`);

  // ── Player B: open duo lobby & join room ───────────────────────
  log('B', 'Opening duo lobby...');
  await pageB.evaluate(() => window.openDuoLobby());
  await pageB.waitForTimeout(2000);

  // Refresh to see the room
  await pageB.evaluate(() => window.refreshDuoLobbyRoom({ force: true }));
  await pageB.waitForTimeout(1500);
  await screenshot(pageB, '3-b-lobby-sees-room');

  // Click the first room item to join
  log('B', 'Joining room...');
  const joined = await pageB.evaluate(async () => {
    const items = document.querySelectorAll('.duo-room-item');
    if (items.length > 0) {
      (items[0]).click();
      return true;
    }
    return false;
  });

  if (!joined) {
    log('B', '⚠️  No room found to join. Trying direct join...');
    // Try joining via window function
    await pageB.evaluate(() => window.joinDuoRoomFromLobby());
  }
  await pageB.waitForTimeout(2000);
  await screenshot(pageB, '4-b-joined');

  // ── Both: check ready zone visible ─────────────────────────────
  const readyZoneA = await pageA.evaluate(() => {
    const z = document.getElementById('duo-ready-zone');
    return z && !z.classList.contains('hidden');
  });
  const readyZoneB = await pageB.evaluate(() => {
    const z = document.getElementById('duo-ready-zone');
    return z && !z.classList.contains('hidden');
  });
  log('A', `Ready zone visible: ${readyZoneA}`);
  log('B', `Ready zone visible: ${readyZoneB}`);

  // ── Both: toggle ready ─────────────────────────────────────────
  log('A', 'Toggling ready...');
  await pageA.evaluate(() => window.toggleDuoReady());
  await pageA.waitForTimeout(1000);

  log('B', 'Toggling ready...');
  await pageB.evaluate(() => window.toggleDuoReady());
  await pageB.waitForTimeout(1000);

  await screenshot(pageA, '5-a-both-ready');
  await screenshot(pageB, '5-b-both-ready');

  // ── Wait for countdown & game launch ───────────────────────────
  log('WAIT', 'Waiting for countdown + game launch (6s)...');
  await pageA.waitForTimeout(6000);

  const inGameA = await pageA.evaluate(() => {
    const gc = document.querySelector('.game-container');
    return gc && gc.style.display === 'flex';
  });
  const inGameB = await pageB.evaluate(() => {
    const gc = document.querySelector('.game-container');
    return gc && gc.style.display === 'flex';
  });
  log('A', `In game: ${inGameA}`);
  log('B', `In game: ${inGameB}`);

  await screenshot(pageA, '6-a-in-game');
  await screenshot(pageB, '6-b-in-game');

  // ── Quick gameplay: fill a few cells on Player A ───────────────
  if (inGameA) {
    log('A', 'Filling some cells...');
    await pageA.evaluate(() => {
      const gs = (window).__e2e?.gs;
      const handleInput = (window).__e2e?.handleInput;
      if (!gs || !handleInput) return;
      // Find empty cells and fill with solution
      const level = gs.currentLevel;
      if (!level) return;
      let filled = 0;
      for (let i = 0; i < 81 && filled < 5; i++) {
        if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
          const selectCell = (window).__e2e?.selectCell;
          if (selectCell) selectCell(i);
          gs.selectedIdx = i;
          handleInput(level.solution[i]);
          filled++;
        }
      }
    });
    await pageA.waitForTimeout(1500);
    await screenshot(pageA, '7-a-playing');
  }

  // Check duo progress UI
  const progressText = await pageA.evaluate(() => {
    return document.getElementById('duo-progress-text')?.textContent || '';
  });
  log('A', `Progress UI: ${progressText}`);

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('  Duo E2E Test Summary');
  console.log('═══════════════════════════════════════');
  console.log(`  Player A alias:  ${aliasA}`);
  console.log(`  Player B alias:  ${aliasB}`);
  console.log(`  Room created:    ${roomId ? '✅' : '❌'}`);
  console.log(`  B joined:        ${joined ? '✅' : '❌'}`);
  console.log(`  Ready zone A:    ${readyZoneA ? '✅' : '❌'}`);
  console.log(`  Ready zone B:    ${readyZoneB ? '✅' : '❌'}`);
  console.log(`  Game launched A: ${inGameA ? '✅' : '❌'}`);
  console.log(`  Game launched B: ${inGameB ? '✅' : '❌'}`);
  console.log(`  Progress UI:     ${progressText || '(none)'}`);
  console.log('═══════════════════════════════════════');

  const allPassed = roomId && joined && readyZoneA && readyZoneB && inGameA && inGameB;
  console.log(allPassed ? '\n✅ All checks passed!' : '\n⚠️  Some checks failed — see logs above.');

  if (HEADED) {
    log('WAIT', 'Headed mode — keeping browser open 30s for manual inspection...');
    await pageA.waitForTimeout(30000);
  }

  await browser.close();

  // Kill dev server
  process.exit(allPassed ? 0 : 1);
})();
