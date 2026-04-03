import { test, type Page } from '@playwright/test';

/**
 * World Mode Playthrough — automated QA session.
 *
 * Enters World mode, plays encounters by filling solutions via page.evaluate(),
 * logs progression (level, technique, rarity, EXP) until X-Wing is encountered.
 *
 * Run:  npx playwright test e2e/world-playthrough.spec.ts --headed --timeout 300000
 */

interface EncounterLog {
  round: number;
  technique: string;
  rarity: string;
  challengeMode: string;
  iqLevelBefore: number;
  iqLevelAfter: number;
  expGained: number;
  timeSeconds: number;
  issue?: string;
}

const MAX_ENCOUNTERS = 80; // safety cap

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e?.gs, { timeout: 15_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

/** Fill the entire puzzle using solution data via evaluate (instant). */
async function instantSolve(page: Page): Promise<{ emptyCells: number; solveOk: boolean }> {
  return page.evaluate(() => {
    const gs = (window as any).gs;
    if (!gs || !gs.currentLevel) return { emptyCells: 0, solveOk: false };

    const solution = gs.currentLevel.solution;
    if (!solution || solution.length !== 81) return { emptyCells: 0, solveOk: false };

    let emptyCells = 0;
    for (let i = 0; i < 81; i++) {
      if (gs.cellsData[i].value === 0) {
        emptyCells++;
      }
    }

    // Fill all empty cells with solution values
    for (let i = 0; i < 81; i++) {
      if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
        gs.cellsData[i].value = solution[i];
        gs.cellsData[i].notes = [];
        gs.cellsData[i].isError = false;
      }
    }

    // Re-render grid
    if (gs.gridEl) {
      for (let i = 0; i < 81; i++) {
        const cellEl = gs.gridEl.children[i] as HTMLElement;
        if (cellEl) {
          cellEl.textContent = String(gs.cellsData[i].value);
          cellEl.className = `cell ${gs.cellsData[i].fixed ? 'is-fixed' : ''}`;
        }
      }
    }

    return { emptyCells, solveOk: true };
  });
}

/** Trigger checkWin via the last cell fill through handleInput. */
async function triggerWinCheck(page: Page) {
  // Find a cell that was empty in the puzzle but now filled, and re-fill it via handleInput
  // to trigger the normal checkWin flow
  await page.evaluate(() => {
    const gs = (window as any).gs;
    if (!gs || !gs.currentLevel) return;

    const solution = gs.currentLevel.solution;
    const puzzle = gs.currentLevel.puzzle;

    // Reset ALL non-fixed cells first, then fill them one by one via the proper path
    // Actually, simpler: just call checkWin directly if it's exposed
    // Let's find the last empty cell and use handleInput
  });

  // Better approach: use the DOM click path for the last empty cell
  // Find last non-fixed cell index and its solution digit
  const lastCell = await page.evaluate(() => {
    const gs = (window as any).gs;
    const puzzle = gs.currentLevel.puzzle;
    const solution = gs.currentLevel.solution;
    // Find last non-fixed cell
    for (let i = 80; i >= 0; i--) {
      if (puzzle[i] === 0) {
        return { idx: i, digit: solution[i] };
      }
    }
    return null;
  });

  if (!lastCell) return;

  // Undo that cell, then fill via UI to trigger checkWin
  await page.evaluate((idx) => {
    const gs = (window as any).gs;
    gs.cellsData[idx].value = 0;
    gs.cellsData[idx].notes = [];
  }, lastCell.idx);

  // Select cell and press digit
  await page.locator(`#grid > .cell:nth-child(${lastCell.idx + 1})`).click();
  await page.waitForTimeout(100);
  await page.locator(`.num-btn:nth-child(${lastCell.digit})`).click();
}

/** Get current encounter info from wildController. */
async function getEncounterInfo(page: Page) {
  return page.evaluate(() => {
    const win = window as any;
    const profile = win.__e2e?.wildController?.getWildProfile?.()
      || JSON.parse(localStorage.getItem('sudoku_wild_profile') || '{}');
    const gs = win.gs;

    return {
      technique: gs?.currentLevel?.maxTechnique || 'unknown',
      displayName: gs?.currentLevel?.displayName || '',
      iqLevel: profile?.iqLevel || 1,
      totalExp: profile?.totalExp || 0,
      puzzlesCompleted: profile?.puzzlesCompleted || 0,
      totalEncounters: profile?.totalEncounters || 0,
    };
  });
}

/** Wait for the wild win overlay to appear. */
async function waitForWinOverlay(page: Page, timeout = 8000) {
  try {
    // The win celebration is a React portal — look for the overlay
    await page.locator('.zen-overlay').waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Dismiss win overlay and continue to next encounter. */
async function continueToNext(page: Page) {
  // Click the "continue" button in the win overlay
  // The button text varies, try several selectors
  const continueBtn = page.locator('.win-actions button').first();
  try {
    await continueBtn.waitFor({ state: 'visible', timeout: 3000 });
    await continueBtn.click();
  } catch {
    // Fallback: call continueWild directly
    await page.evaluate(() => {
      const win = window as any;
      win.continueWild?.();
    });
  }
  // Wait for transition overlay to finish and game grid to be ready
  await page.waitForTimeout(2500);
}

/** Check for common issues during gameplay. */
async function detectIssues(page: Page): Promise<string[]> {
  const issues: string[] = [];

  // Check for console errors (captured separately)
  // Check for visible error states
  const errorCells = await page.locator('.cell.error').count();
  if (errorCells > 0) {
    issues.push(`${errorCells} cells in error state`);
  }

  // Check game container is visible
  const gameVisible = await page.locator('.game-container').isVisible();
  if (!gameVisible) {
    issues.push('game-container not visible');
  }

  // Check grid has 81 cells
  const cellCount = await page.locator('#grid > .cell').count();
  if (cellCount !== 81) {
    issues.push(`grid has ${cellCount} cells (expected 81)`);
  }

  return issues;
}

test.describe('World Playthrough', () => {
  test('play world mode until X-Wing', async ({ page }) => {
    // Extend timeout for long playthrough
    test.setTimeout(300_000);

    const encounterLogs: EncounterLog[] = [];
    const consoleErrors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Navigate and clear data for fresh start
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    await page.reload();
    await waitForE2E(page);

    // Go to level screen
    await page.evaluate(() => (window as any).showLevelScreen());
    await page.locator('#level-screen').waitFor({ state: 'visible', timeout: 10_000 });

    // Open Wild lobby
    await page.locator('.world-entry-btn').click();
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });

    console.log('=== WORLD PLAYTHROUGH START ===');
    console.log('Goal: Play until X-Wing encounter');
    console.log('');

    // Take screenshot of lobby
    await page.screenshot({ path: 'test-results/world-playthrough-lobby.png' });

    // Read initial profile
    const initProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('sudoku_wild_profile');
      return raw ? JSON.parse(raw) : null;
    });
    console.log(`Initial profile: Lv.${initProfile?.iqLevel || 1}, EXP: ${initProfile?.totalExp || 0}`);

    // Click "Enter World" button
    const enterBtn = page.locator('#wild-enter-btn');
    await enterBtn.waitFor({ state: 'visible', timeout: 5000 });
    await enterBtn.click();

    // Wait for encounter transition to finish and game to load
    await page.waitForTimeout(3000);

    let foundXWing = false;

    for (let round = 1; round <= MAX_ENCOUNTERS; round++) {
      // Wait for grid to be ready
      try {
        await page.locator('#grid').waitFor({ state: 'visible', timeout: 10_000 });
      } catch {
        console.log(`Round ${round}: Grid not visible, taking screenshot...`);
        await page.screenshot({ path: `test-results/world-playthrough-stuck-r${round}.png` });

        // Try to recover: check if we're on lobby, win overlay, etc.
        const onLobby = await page.locator('#wild-lobby:not(.hidden)').isVisible().catch(() => false);
        if (onLobby) {
          console.log('  → Back on lobby, re-entering...');
          await page.locator('#wild-enter-btn').click();
          await page.waitForTimeout(3000);
          continue;
        }

        // Check if transition overlay is still showing
        const hasTransition = await page.locator('.encounter-transition').isVisible().catch(() => false);
        if (hasTransition) {
          console.log('  → Transition overlay stuck, waiting longer...');
          await page.waitForTimeout(3000);
          continue;
        }

        console.log('  → Cannot recover, stopping.');
        break;
      }

      // Get encounter info
      const info = await getEncounterInfo(page);
      const iqBefore = info.iqLevel;

      console.log(`--- Round ${round} ---`);
      console.log(`  Technique: ${info.technique}`);
      console.log(`  Display: ${info.displayName}`);
      console.log(`  IQ Level: Lv.${iqBefore}`);

      // Check if this is X-Wing!
      if (info.technique === 'x_wing') {
        console.log('');
        console.log('🎯 X-WING ENCOUNTERED!');
        foundXWing = true;
        await page.screenshot({ path: 'test-results/world-playthrough-xwing.png' });

        // Log the puzzle data for reference
        const puzzleData = await page.evaluate(() => {
          const gs = (window as any).gs;
          return {
            puzzle: gs?.currentLevel?.puzzle,
            solution: gs?.currentLevel?.solution,
            displayName: gs?.currentLevel?.displayName,
          };
        });
        console.log(`  Puzzle: ${JSON.stringify(puzzleData.puzzle)}`);

        encounterLogs.push({
          round,
          technique: info.technique,
          rarity: info.displayName,
          challengeMode: 'standard',
          iqLevelBefore: iqBefore,
          iqLevelAfter: iqBefore,
          expGained: 0,
          timeSeconds: 0,
          issue: 'TARGET FOUND - X-Wing!',
        });
        break;
      }

      // Detect any issues
      const issues = await detectIssues(page);
      if (issues.length > 0) {
        console.log(`  Issues: ${issues.join(', ')}`);
      }

      // Get rarity info from encounter
      const encounterRarity = await page.evaluate(() => {
        const container = document.querySelector('.game-container');
        if (!container) return 'unknown';
        if (container.classList.contains('rarity-mythic')) return 'mythic';
        if (container.classList.contains('rarity-legendary')) return 'legendary';
        if (container.classList.contains('rarity-rare')) return 'rare';
        return 'common';
      });
      console.log(`  Rarity: ${encounterRarity}`);

      // Instant solve: fill all cells with solution
      const solveResult = await instantSolve(page);
      if (!solveResult.solveOk) {
        console.log('  ⚠️ Could not solve — no solution data');
        encounterLogs.push({
          round,
          technique: info.technique,
          rarity: encounterRarity,
          challengeMode: 'standard',
          iqLevelBefore: iqBefore,
          iqLevelAfter: iqBefore,
          expGained: 0,
          timeSeconds: 0,
          issue: 'No solution data available',
        });
        break;
      }

      console.log(`  Filled ${solveResult.emptyCells} cells`);

      // Trigger win via the last cell handleInput
      await triggerWinCheck(page);

      // Wait for win overlay
      const winShown = await waitForWinOverlay(page);
      if (!winShown) {
        console.log('  ⚠️ Win overlay did not appear');
        await page.screenshot({ path: `test-results/world-playthrough-nowin-r${round}.png` });

        // Check if maybe we triggered game over instead
        const gameOverVisible = await page.locator('.game-over-overlay, .gameover-overlay').isVisible().catch(() => false);
        if (gameOverVisible) {
          console.log('  → Game Over triggered instead of Win!');
          encounterLogs.push({
            round,
            technique: info.technique,
            rarity: encounterRarity,
            challengeMode: 'standard',
            iqLevelBefore: iqBefore,
            iqLevelAfter: iqBefore,
            expGained: 0,
            timeSeconds: 0,
            issue: 'Game Over instead of Win',
          });
          // Try to recover
          await page.evaluate(() => {
            const win = window as any;
            win.showLevelScreen?.();
          });
          await page.waitForTimeout(500);
          await page.locator('.world-entry-btn').click();
          await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 5000 });
          await page.locator('#wild-enter-btn').click();
          await page.waitForTimeout(3000);
          continue;
        }

        // Maybe win happened but overlay was quick — check if we're in a good state
        // Try continuing anyway
      }

      // Read post-win profile
      const postProfile = await page.evaluate(() => {
        const raw = localStorage.getItem('sudoku_wild_profile');
        return raw ? JSON.parse(raw) : null;
      });
      const iqAfter = postProfile?.iqLevel || iqBefore;
      const expNow = postProfile?.totalExp || 0;
      const expBefore = initProfile?.totalExp || 0;

      if (iqAfter > iqBefore) {
        console.log(`  📈 LEVEL UP! Lv.${iqBefore} → Lv.${iqAfter}`);
      }

      encounterLogs.push({
        round,
        technique: info.technique,
        rarity: encounterRarity,
        challengeMode: 'standard',
        iqLevelBefore: iqBefore,
        iqLevelAfter: iqAfter,
        expGained: expNow - expBefore,
        timeSeconds: 0,
        issue: issues.length > 0 ? issues.join('; ') : undefined,
      });

      // Take periodic screenshots
      if (round % 10 === 0 || iqAfter > iqBefore) {
        await page.screenshot({ path: `test-results/world-playthrough-r${round}.png` });
      }

      // Continue to next encounter
      await continueToNext(page);

      // Update reference profile for next delta calc
      if (postProfile) {
        initProfile.totalExp = postProfile.totalExp;
      }
    }

    // Final summary
    console.log('');
    console.log('=== PLAYTHROUGH SUMMARY ===');
    console.log(`Total rounds: ${encounterLogs.length}`);
    console.log(`Found X-Wing: ${foundXWing}`);

    // Technique distribution
    const techCounts: Record<string, number> = {};
    for (const log of encounterLogs) {
      techCounts[log.technique] = (techCounts[log.technique] || 0) + 1;
    }
    console.log('Technique distribution:');
    for (const [tech, count] of Object.entries(techCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${tech}: ${count}`);
    }

    // Level progression
    if (encounterLogs.length > 0) {
      const first = encounterLogs[0];
      const last = encounterLogs[encounterLogs.length - 1];
      console.log(`Level progression: Lv.${first.iqLevelBefore} → Lv.${last.iqLevelAfter}`);
    }

    // Issues
    const issueEntries = encounterLogs.filter((l) => l.issue);
    if (issueEntries.length > 0) {
      console.log('Issues encountered:');
      for (const entry of issueEntries) {
        console.log(`  Round ${entry.round} (${entry.technique}): ${entry.issue}`);
      }
    }

    // Console errors
    if (consoleErrors.length > 0) {
      console.log(`Console errors (${consoleErrors.length}):`);
      for (const err of consoleErrors.slice(0, 20)) {
        console.log(`  ${err}`);
      }
    }

    // Final profile
    const finalProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('sudoku_wild_profile');
      return raw ? JSON.parse(raw) : null;
    });
    console.log('');
    console.log('Final profile:', JSON.stringify({
      iqLevel: finalProfile?.iqLevel,
      totalExp: finalProfile?.totalExp,
      puzzlesCompleted: finalProfile?.puzzlesCompleted,
      totalEncounters: finalProfile?.totalEncounters,
      bestiarySize: Object.keys(finalProfile?.bestiary || {}).length,
    }, null, 2));

    await page.screenshot({ path: 'test-results/world-playthrough-final.png' });
  });
});
