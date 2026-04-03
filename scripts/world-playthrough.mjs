/**
 * World Mode Playthrough — DOM-only approach (no window.gs dependency).
 * Uses onclick handlers from HTML + localStorage for profile data.
 *
 * Run: node scripts/world-playthrough.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const MAX_ENCOUNTERS = 80;

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } }); // iPhone XR size

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push('PAGE ERROR: ' + err.message.slice(0, 200));
  });

  console.log('Navigating to app...');
  await page.goto(BASE_URL);

  // Wait for level screen to appear (DOM-based check)
  await page.locator('#level-screen').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.world-entry-btn').waitFor({ state: 'attached', timeout: 10000 });

  // Debug: check window state
  const debug = await page.evaluate(() => {
    return {
      hasE2e: '__e2e' in window,
      hasShowLevel: typeof window.showLevelScreen,
      hasOpenWild: typeof window.openWildLobby,
      windowOwnKeys: Object.getOwnPropertyNames(window).filter(k =>
        ['showLevelScreen', 'openWildLobby', 'continueWild', 'exitWild', '__e2e', 'gs'].includes(k)
      ),
    };
  });
  console.log('Window state:', JSON.stringify(debug));

  // If functions aren't on window, there's a boot issue. Check for errors in console.
  if (debug.hasOpenWild === 'undefined') {
    console.log('WARNING: onclick handlers not bound to window. App might have boot error.');
    console.log('Checking page errors...');
    const pageContent = await page.evaluate(() => {
      const pre = document.querySelector('pre');
      return pre ? pre.textContent : 'no pre element found';
    });
    console.log('Pre element:', pageContent?.slice(0, 300));

    // Try waiting more
    await page.waitForTimeout(5000);
    const retry = await page.evaluate(() => typeof window.openWildLobby);
    console.log('After 5s wait, openWildLobby type:', retry);

    if (retry === 'undefined') {
      console.log('Functions still not available. Console errors so far:');
      for (const e of consoleErrors) console.log('  ', e);
      await browser.close();
      return;
    }
  }

  console.log('App loaded. Level screen visible.');

  // Clear game data for fresh start, but pre-skip mentor intro
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
    // Skip ALL mentor messages (they block with awaited dialogs)
    localStorage.setItem('sudoku_mentor_seen', JSON.stringify([
      'intro_complete', 'hint_continuous_fill', 'first_kill',
      'tier1_mastered', 'tier2_unlocked', 'tier3_unlocked', 'tier3_deep',
      'tier4_threshold', 'finale', 'mentor_goodbye',
    ]));
    // Pre-set studied skills to bypass Lv.20 gate
    // (Game requires all basic skills studied via Practice mode before Lv.21)
    const profile = {
      iqLevel: 1, totalExp: 0, puzzlesCompleted: 0, totalEncounters: 0,
      bestiary: {}, cooldowns: {}, currentSession: null, autoCastEnabled: true,
      studiedSkills: [
        'naked_single', 'hidden_single', 'locked_candidates',
        'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple',
      ],
    };
    localStorage.setItem('sudoku_wild_profile', JSON.stringify(profile));
  });
  await page.reload();
  await page.locator('#level-screen').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('Fresh start ready (mentor intro skipped).');

  await page.screenshot({ path: 'test-results/world-pt-start.png' });

  // Auto-dismiss mentor overlay whenever it appears
  setInterval(async () => {
    try {
      const mentorVisible = await page.locator('#mentor-overlay').isVisible();
      if (mentorVisible) {
        await page.evaluate(() => window.dismissMentor?.());
      }
    } catch { /* page might be navigating */ }
  }, 500);

  const getProfile = () => page.evaluate(() => {
    const raw = localStorage.getItem('sudoku_wild_profile');
    return raw ? JSON.parse(raw) : { iqLevel: 1, totalExp: 0, puzzlesCompleted: 0, totalEncounters: 0, bestiary: {} };
  });

  const initProfile = await getProfile();
  console.log(`\nInitial: Lv.${initProfile.iqLevel}, EXP: ${initProfile.totalExp}`);

  // Open Wild lobby via button click
  console.log('Opening Wild lobby...');
  await page.locator('.world-entry-btn').click();
  try {
    await page.locator('#wild-lobby:not(.hidden)').waitFor({ timeout: 8000 });
  } catch {
    // Maybe a page error prevented it — check console
    console.log('Lobby did not open. Console errors:');
    for (const e of consoleErrors) console.log('  ', e);
    // Try via evaluate
    await page.evaluate(() => window.openWildLobby?.());
    await page.waitForTimeout(1000);
    const visible = await page.locator('#wild-lobby:not(.hidden)').isVisible();
    if (!visible) {
      console.log('Still not visible. Screenshot and abort.');
      await page.screenshot({ path: 'test-results/world-pt-lobby-fail.png' });
      await browser.close();
      return;
    }
  }
  console.log('Wild lobby opened.');
  await page.screenshot({ path: 'test-results/world-pt-lobby.png' });

  // Enter World — call startPoolRandom() which is the onclick handler
  console.log('Entering World...');

  // Collect console messages during launch
  const launchLogs = [];
  const logListener = (msg) => launchLogs.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`);
  page.on('console', logListener);

  // Scroll the enter button into view and click it
  await page.evaluate(() => {
    const btn = document.getElementById('wild-enter-btn');
    if (btn) btn.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
  try {
    await page.locator('#wild-enter-btn').click({ force: true, timeout: 3000 });
  } catch {
    console.log('  Enter button click failed even with force, using evaluate...');
    await page.evaluate(() => {
      const btn = document.getElementById('wild-enter-btn');
      btn?.click();
    });
  }

  // Wait for game container to become visible (initGame sets display: flex)
  try {
    await page.locator('.game-container[style*="flex"]').waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // Fallback: wait and force-show
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const gc = document.querySelector('.game-container');
      const ls = document.getElementById('level-screen');
      if (gc) gc.style.display = 'flex';
      if (ls) ls.style.display = 'none';
    });
  }

  page.off('console', logListener);

  const gameState = await page.evaluate(() => {
    const gs = window.__e2e?.gs;
    return {
      hasLevel: !!gs?.currentLevel,
      technique: gs?.currentLevel?.maxTechnique || null,
      cellCount: gs?.cellsData?.length || 0,
    };
  });

  if (!gameState.hasLevel) {
    console.log('Game never loaded. Console logs:');
    for (const l of launchLogs) console.log('  ', l);
    await page.screenshot({ path: 'test-results/world-pt-timeout.png' });
    await browser.close();
    return;
  }
  console.log(`Game ready: technique=${gameState.technique}, cells=${gameState.cellCount}`);
  await page.waitForTimeout(500);

  const logs = [];
  let foundXWing = false;

  for (let round = 1; round <= MAX_ENCOUNTERS; round++) {
    const issues = [];

    // Wait for grid — force game-container visible if needed
    try {
      await page.locator('#grid').waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      // Grid might be hidden because game-container isn't shown yet
      const hasLevel = await page.evaluate(() => !!window.__e2e?.gs?.currentLevel);
      if (hasLevel) {
        // Force-show game container via style tag injection (guaranteed override)
        await page.addStyleTag({ content: '.game-container { display: flex !important; } #level-screen { display: none !important; }' });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `test-results/world-pt-debug-r${round}.png` });
        const debugGrid = await page.evaluate(() => {
          const grid = document.getElementById('grid');
          if (!grid) return 'no #grid element';
          const style = getComputedStyle(grid);
          return {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            width: style.width,
            height: style.height,
            childCount: grid.children.length,
            parentDisplay: grid.parentElement ? getComputedStyle(grid.parentElement).display : 'N/A',
            parentId: grid.parentElement?.id || grid.parentElement?.className || 'unknown',
          };
        });
        console.log('Grid debug:', JSON.stringify(debugGrid));
        const gridNow = await page.locator('#grid').isVisible().catch(() => false);
        if (gridNow) {
          console.log(`  Grid forced visible at round ${round}`);
        } else {
          console.log(`Round ${round}: Grid still not visible after force!`);
          break;
        }
      } else {
        console.log(`Round ${round}: No level data. Trying re-enter...`);
        await page.evaluate(() => {
          window.showLevelScreen?.();
        });
        await page.waitForTimeout(500);
        await page.evaluate(() => window.openWildLobby?.());
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          document.getElementById('wild-enter-btn')?.click();
        });
        await page.waitForTimeout(4000);
        continue;
      }
    }

    // Get encounter info via __e2e.gs (should work now that app has initialized)
    const info = await page.evaluate(() => {
      // Access gs through the module scope via __e2e or the game state
      const e2e = window.__e2e;
      const gs = e2e?.gs;
      if (gs?.currentLevel) {
        return {
          technique: gs.currentLevel.maxTechnique || 'unknown',
          displayName: gs.currentLevel.displayName || '',
          hasSolution: Array.isArray(gs.currentLevel.solution) && gs.currentLevel.solution.length === 81,
          puzzle: gs.currentLevel.puzzle,
          solution: gs.currentLevel.solution,
        };
      }
      // Fallback: read from game-title element
      const titleEl = document.getElementById('game-title');
      const levelNameEl = document.querySelector('.level-name, .game-level-name');
      return {
        technique: 'unknown',
        displayName: titleEl?.textContent || levelNameEl?.textContent || '',
        hasSolution: false,
        puzzle: null,
        solution: null,
      };
    });

    const profileBefore = await getProfile();
    const iqBefore = profileBefore.iqLevel;

    const rarity = await page.evaluate(() => {
      const c = document.querySelector('.game-container');
      if (!c) return 'unknown';
      if (c.classList.contains('rarity-mythic')) return 'mythic';
      if (c.classList.contains('rarity-legendary')) return 'legendary';
      if (c.classList.contains('rarity-rare')) return 'rare';
      return 'common';
    });

    const pad = String(round).padStart(2, '0');
    console.log(`[R${pad}] Lv.${iqBefore} | ${info.technique} (${rarity}) | ${info.displayName}`);

    // CHECK FOR X-WING
    if (info.technique === 'x_wing') {
      console.log('\n  *** X-WING FOUND! ***');
      foundXWing = true;
      await page.screenshot({ path: 'test-results/world-pt-xwing.png' });
      logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter: iqBefore, issues: ['TARGET FOUND'] });
      break;
    }

    // If we can't get solution from gs, try to get it from DOM data attributes or other means
    if (!info.hasSolution) {
      console.log('  WARNING: Cannot access game state (no __e2e.gs). Trying DOM-only solve...');

      // We need solution data. Try to get it from the wild save in localStorage
      const wildSave = await page.evaluate(() => {
        // The encounter data might be in the encounter save
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('save_') || key.includes('wild'))) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              if (data?.levelData?.solution || data?.solution) {
                return data.levelData || data;
              }
            } catch {}
          }
        }
        return null;
      });

      if (!wildSave) {
        issues.push('cannot access solution data');
        console.log('  -> No solution data available. Cannot solve. Stopping.');
        await page.screenshot({ path: `test-results/world-pt-nosolution-r${round}.png` });
        break;
      }
    }

    // SOLVE via __e2e.gs if available, otherwise via DOM
    if (info.hasSolution) {
      // Use evaluate to fill all cells except last empty one
      const lastEmpty = await page.evaluate(() => {
        const gs = window.__e2e?.gs;
        const solution = gs.currentLevel.solution;

        let lastIdx = -1;
        for (let i = 80; i >= 0; i--) {
          if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
            lastIdx = i;
            break;
          }
        }

        for (let i = 0; i < 81; i++) {
          if (i === lastIdx) continue;
          if (gs.cellsData[i].value === 0 && !gs.cellsData[i].fixed) {
            gs.cellsData[i].value = solution[i];
            gs.cellsData[i].notes = [];
            gs.cellsData[i].isError = false;
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
        // All cells filled — auto-solved. Force a cell re-fill to trigger checkWin.
        console.log('  Puzzle already complete (auto-solved). Triggering win...');
        await page.evaluate(() => {
          const gs = window.__e2e?.gs;
          // Unfix cell 0 temporarily
          gs.cellsData[0].fixed = false;
          const origVal = gs.cellsData[0].value;
          gs.cellsData[0].value = 0;
          // Refill via handleInput to trigger checkWin
          gs.selectedIdx = 0;
          const handleInput = window.__e2e?.handleInput;
          if (handleInput) handleInput(origVal);
        });
      } else {
        // Fill last cell via UI click to trigger checkWin
        await page.locator(`#grid > .cell:nth-child(${lastEmpty.idx + 1})`).click({ force: true });
        await page.waitForTimeout(100);
        await page.locator(`.num-btn:nth-child(${lastEmpty.digit})`).click({ force: true });
      }
    } else {
      // DOM-only: use solution from info.solution (passed from evaluate)
      // Fill cells one by one via DOM
      const solution = info.solution;
      if (!solution) {
        issues.push('no solution');
        break;
      }

      // Get current cell values from DOM
      const cells = await page.locator('#grid > .cell').all();
      for (let i = 0; i < 81; i++) {
        const cell = cells[i];
        const text = await cell.textContent();
        const isFixed = await cell.evaluate(el => el.classList.contains('is-fixed'));
        if (!isFixed && (!text || text.trim() === '' || text.includes('\n'))) {
          // Empty cell — fill it
          await cell.click();
          await page.waitForTimeout(30);
          await page.locator(`.num-btn:nth-child(${solution[i]})`).click();
          await page.waitForTimeout(30);
        }
      }
    }

    // Wait for win overlay (#win-celebration rendered by ZenOverlay)
    let winAppeared = false;
    try {
      await page.locator('#win-celebration').waitFor({ state: 'visible', timeout: 5000 });
      winAppeared = true;
    } catch {
      // Maybe mentor overlay is blocking — try dismissing it
      const mentorUp = await page.locator('#mentor-overlay').isVisible().catch(() => false);
      if (mentorUp) {
        await page.evaluate(() => window.dismissMentor?.());
        await page.waitForTimeout(500);
        try {
          await page.locator('#win-celebration').waitFor({ state: 'visible', timeout: 3000 });
          winAppeared = true;
        } catch {}
      }
      if (!winAppeared) issues.push('win overlay not shown');
    }

    if (!winAppeared) {
      console.log('  WARNING: Win overlay not shown');
      await page.screenshot({ path: `test-results/world-pt-nowin-r${round}.png` });

      // Force continue via evaluate
      try {
        await page.evaluate(() => {
          window.dismissMentor?.();
          window.continueWild?.();
        });
        await page.waitForTimeout(4000);
      } catch (e) {
        console.log('  -> Recovery failed:', e.message);
        break;
      }

      const pa = await getProfile();
      logs.push({ round, technique: info.technique, rarity, displayName: info.displayName, iqBefore, iqAfter: pa.iqLevel, issues });
      continue;
    }

    // Post-win profile
    await page.waitForTimeout(500);
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
    try {
      // Try clicking continue button in win overlay
      const btn = page.locator('#win-celebration button').first();
      await btn.waitFor({ state: 'visible', timeout: 2000 });
      await btn.click({ force: true });
    } catch {
      // Fallback: call continueWild directly
      await page.evaluate(() => window.continueWild?.());
    }

    // Wait for transition + new encounter
    await page.waitForTimeout(3500);
  }

  // ─── SUMMARY ───
  console.log('\n========================================');
  console.log('         PLAYTHROUGH SUMMARY');
  console.log('========================================');
  console.log(`Total rounds: ${logs.length}`);
  console.log(`Found X-Wing: ${foundXWing}`);

  const techCounts = {};
  for (const log of logs) {
    techCounts[log.technique] = (techCounts[log.technique] || 0) + 1;
  }
  console.log('\nTechnique distribution:');
  for (const [tech, count] of Object.entries(techCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tech}: ${count}`);
  }

  if (logs.length > 0) {
    console.log(`\nLevel: Lv.${logs[0].iqBefore} -> Lv.${logs[logs.length - 1].iqAfter}`);
  }

  const rarityCounts = {};
  for (const log of logs) {
    rarityCounts[log.rarity] = (rarityCounts[log.rarity] || 0) + 1;
  }
  console.log('\nRarity distribution:');
  for (const [r, c] of Object.entries(rarityCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: ${c}`);
  }

  const issueEntries = logs.filter(l => l.issues.length > 0);
  if (issueEntries.length > 0) {
    console.log('\nIssues:');
    for (const e of issueEntries) {
      console.log(`  R${e.round} (${e.technique}): ${e.issues.join(', ')}`);
    }
  }

  if (consoleErrors.length > 0) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    for (const err of consoleErrors.slice(0, 15)) {
      console.log(`  ${err}`);
    }
  }

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
