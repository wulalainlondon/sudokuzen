/**
 * World Mode Playthrough — standalone Playwright script.
 * Enters World mode, plays encounters, logs progression until X-Wing.
 *
 * Run: npx tsx scripts/world-playthrough.mts
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const MAX_ENCOUNTERS = 80;

interface EncounterLog {
  round: number;
  technique: string;
  rarity: string;
  displayName: string;
  iqBefore: number;
  iqAfter: number;
  issues: string[];
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`);
  });

  console.log('Navigating to app...');
  await page.goto(BASE_URL);

  // Wait for app init
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 15_000 });
  console.log('App loaded.');

  // Clear game data for fresh start
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 15_000 });

  // Go to level screen
  await page.evaluate(() => (window as unknown).showLevelScreen());
  await page.locator('#level-screen').waitFor({ state: 'visible', timeout: 10_000 });
  console.log('Level screen visible.');

  // Open Wild lobby
  await page.locator('.world-entry-btn').click();
  await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });
  console.log('Wild lobby opened.');

  await page.screenshot({ path: 'test-results/world-pt-lobby.png' });

  // Read initial profile
  const getProfile = () => page.evaluate(() => {
    const raw = localStorage.getItem('sudoku_wild_profile');
    return raw ? JSON.parse(raw) : { iqLevel: 1, totalExp: 0, puzzlesCompleted: 0, totalEncounters: 0, bestiary: {} };
  });

  const initProfile = await getProfile();
  console.log(`\nInitial: Lv.${initProfile.iqLevel}, EXP: ${initProfile.totalExp}`);

  // Click Enter World
  await page.locator('#wild-enter-btn').click();
  // Wait for encounter transition + game load
  await page.waitForTimeout(3500);

  const logs: EncounterLog[] = [];
  let foundXWing = false;

  for (let round = 1; round <= MAX_ENCOUNTERS; round++) {
    const issues: string[] = [];

    // Wait for grid
    try {
      await page.locator('#grid').waitFor({ state: 'visible', timeout: 10_000 });
    } catch {
      console.log(`Round ${round}: Grid not visible!`);
      await page.screenshot({ path: `test-results/world-pt-stuck-r${round}.png` });

      // Try recovery
      const onLobby = await page.locator('#wild-lobby:not(.hidden)').isVisible().catch(() => false);
      if (onLobby) {
        console.log('  -> Back on lobby, re-entering...');
        await page.locator('#wild-enter-btn').click();
        await page.waitForTimeout(3500);
        continue;
      }
      console.log('  -> Cannot recover. Stopping.');
      break;
    }

    // Get encounter info
    const info = await page.evaluate(() => {
      const gs = (window as unknown).gs;
      return {
        technique: gs?.currentLevel?.maxTechnique || 'unknown',
        displayName: gs?.currentLevel?.displayName || '',
        hasSolution: !!(gs?.currentLevel?.solution?.length === 81),
      };
    });

    const profileBefore = await getProfile();
    const iqBefore = profileBefore.iqLevel;

    // Get rarity from DOM
    const rarity = await page.evaluate(() => {
      const c = document.querySelector('.game-container');
      if (!c) return 'unknown';
      if (c.classList.contains('rarity-mythic')) return 'mythic';
      if (c.classList.contains('rarity-legendary')) return 'legendary';
      if (c.classList.contains('rarity-rare')) return 'rare';
      return 'common';
    });

    const prefix = `[R${String(round).padStart(2, '0')}] Lv.${iqBefore}`;
    console.log(`${prefix} | ${info.technique} (${rarity}) | ${info.displayName}`);

    // CHECK FOR X-WING
    if (info.technique === 'x_wing') {
      console.log('\n  *** X-WING FOUND! ***');
      foundXWing = true;
      await page.screenshot({ path: 'test-results/world-pt-xwing.png' });

      const puzzleData = await page.evaluate(() => {
        const gs = (window as unknown).gs;
        return { puzzle: gs?.currentLevel?.puzzle, solution: gs?.currentLevel?.solution };
      });
      console.log(`  Puzzle data saved.`);

      logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter: iqBefore, issues: ['TARGET FOUND'] });
      break;
    }

    if (!info.hasSolution) {
      issues.push('no solution data');
      console.log(`  WARNING: No solution data!`);
      break;
    }

    // Check grid integrity
    const cellCount = await page.locator('#grid > .cell').count();
    if (cellCount !== 81) {
      issues.push(`grid has ${cellCount} cells`);
    }

    // SOLVE: Fill all cells via evaluate, leaving last empty cell for UI trigger
    const lastEmpty = await page.evaluate(() => {
      const gs = (window as unknown).gs;
      const solution = gs.currentLevel.solution;
      const puzzle = gs.currentLevel.puzzle;

      // Find last empty cell
      let lastIdx = -1;
      for (let i = 80; i >= 0; i--) {
        if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
          lastIdx = i;
          break;
        }
      }

      // Fill all empty cells EXCEPT the last one
      for (let i = 0; i < 81; i++) {
        if (i === lastIdx) continue;
        if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
          gs.cellsData[i].value = solution[i];
          gs.cellsData[i].notes = [];
          gs.cellsData[i].isError = false;
          // Update DOM
          const cellEl = gs.gridEl?.children[i];
          if (cellEl) {
            cellEl.textContent = String(solution[i]);
            cellEl.className = 'cell';
          }
        }
      }

      return lastIdx >= 0 ? { idx: lastIdx, digit: solution[lastIdx] } : null;
    });

    if (!lastEmpty) {
      issues.push('no empty cells to fill');
      console.log(`  WARNING: Puzzle already solved?`);
      break;
    }

    // Fill last cell via UI to trigger checkWin
    await page.locator(`#grid > .cell:nth-child(${lastEmpty.idx + 1})`).click();
    await page.waitForTimeout(80);
    await page.locator(`.num-btn:nth-child(${lastEmpty.digit})`).click();

    // Wait for win overlay
    let winAppeared = false;
    try {
      await page.locator('.zen-overlay').waitFor({ state: 'visible', timeout: 5000 });
      winAppeared = true;
    } catch {
      // Try alternate selector
      try {
        await page.locator('[class*="win"]').first().waitFor({ state: 'visible', timeout: 2000 });
        winAppeared = true;
      } catch {
        issues.push('win overlay not shown');
      }
    }

    if (!winAppeared) {
      console.log(`  WARNING: Win overlay did not appear`);
      await page.screenshot({ path: `test-results/world-pt-nowin-r${round}.png` });

      // Check for game over
      const gameOver = await page.evaluate(() => {
        const store = (window as unknown).__e2e?.gameOverStore;
        return store?.getState?.()?.visible || false;
      });
      if (gameOver) {
        issues.push('game over triggered');
        console.log(`  -> Game Over! Recovering...`);
        // Dismiss and re-enter
        await page.evaluate(() => {
          (window as unknown).showLevelScreen?.();
        });
        await page.waitForTimeout(500);
        await page.locator('.world-entry-btn').click();
        await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });
        await page.locator('#wild-enter-btn').click();
        await page.waitForTimeout(3500);

        const profileAfter = await getProfile();
        logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter: profileAfter.iqLevel, issues });
        continue;
      }

      // Try to force continue
      await page.evaluate(() => {
        (window as unknown).continueWild?.();
      });
      await page.waitForTimeout(3500);

      const profileAfter = await getProfile();
      logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter: profileAfter.iqLevel, issues });
      continue;
    }

    // Read post-win profile
    await page.waitForTimeout(300);
    const profileAfter = await getProfile();
    const iqAfter = profileAfter.iqLevel;

    if (iqAfter > iqBefore) {
      console.log(`  LEVEL UP! Lv.${iqBefore} -> Lv.${iqAfter}`);
    }

    logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter, issues });

    // Periodic screenshot
    if (round % 10 === 0 || iqAfter > iqBefore) {
      await page.screenshot({ path: `test-results/world-pt-r${round}.png` });
    }

    // Continue to next encounter
    // Click continue button in win overlay
    try {
      const continueBtn = page.locator('.win-actions button').first();
      await continueBtn.waitFor({ state: 'visible', timeout: 3000 });
      await continueBtn.click();
    } catch {
      // Fallback: direct call
      await page.evaluate(() => (window as unknown).continueWild?.());
    }

    // Wait for transition + new encounter
    await page.waitForTimeout(3000);
  }

  // ─── SUMMARY ───
  console.log('\n========================================');
  console.log('         PLAYTHROUGH SUMMARY');
  console.log('========================================');
  console.log(`Total rounds: ${logs.length}`);
  console.log(`Found X-Wing: ${foundXWing}`);

  // Technique distribution
  const techCounts: Record<string, number> = {};
  for (const log of logs) {
    techCounts[log.technique] = (techCounts[log.technique] || 0) + 1;
  }
  console.log('\nTechnique distribution:');
  for (const [tech, count] of Object.entries(techCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tech}: ${count}`);
  }

  // Level progression
  if (logs.length > 0) {
    const first = logs[0];
    const last = logs[logs.length - 1];
    console.log(`\nLevel: Lv.${first.iqBefore} -> Lv.${last.iqAfter}`);
  }

  // Rarity distribution
  const rarityCounts: Record<string, number> = {};
  for (const log of logs) {
    rarityCounts[log.rarity] = (rarityCounts[log.rarity] || 0) + 1;
  }
  console.log('\nRarity distribution:');
  for (const [r, c] of Object.entries(rarityCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: ${c}`);
  }

  // Issues
  const issueEntries = logs.filter(l => l.issues.length > 0);
  if (issueEntries.length > 0) {
    console.log('\nIssues:');
    for (const e of issueEntries) {
      console.log(`  R${e.round} (${e.technique}): ${e.issues.join(', ')}`);
    }
  }

  // Console errors
  if (consoleErrors.length > 0) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    for (const err of consoleErrors.slice(0, 15)) {
      console.log(`  ${err}`);
    }
  }

  // Final profile
  const finalProfile = await getProfile();
  console.log('\nFinal profile:', JSON.stringify({
    iqLevel: finalProfile.iqLevel,
    totalExp: finalProfile.totalExp,
    puzzlesCompleted: finalProfile.puzzlesCompleted,
    totalEncounters: finalProfile.totalEncounters,
    bestiarySize: Object.keys(finalProfile.bestiary || {}).length,
  }, null, 2));

  await page.screenshot({ path: 'test-results/world-pt-final.png' });

  await browser.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
