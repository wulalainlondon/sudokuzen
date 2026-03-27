import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Replay end-to-end
 * Play a game → generate replay → open replay modal → step/play/speed/reset
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as any).__e2e, { timeout: 10_000 });
}

test.describe('replay-end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await page.evaluate(() => {
      const appVer = localStorage.getItem('sudoku_app_version');
      localStorage.clear();
      if (appVer) localStorage.setItem('sudoku_app_version', appVer);
      (window as any).__e2e.gs.isSpeedrunMode = false;
    });
  });

  test('complete a level and verify replay data is generated', async ({ page }) => {
    // Start level 1
    await page.evaluate(() => {
      (window as any).__e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });

    // Fill all empty cells programmatically
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const puzzle = e2e.gs.currentLevel.puzzle;
      const solution = e2e.gs.currentLevel.solution;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });

    // Win celebration should appear
    await expect(page.locator('#win-celebration')).toBeVisible({ timeout: 5000 });

    // Verify replay is persisted in records
    const replayHistory = await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = (window as any).__e2e.gs.currentLevel?.id;
      return records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory ?? [];
    });

    expect(replayHistory.length).toBeGreaterThan(0);

    // Verify action types are present
    const types = new Set(replayHistory.map((a: any) => a.type));
    expect(types.has('fill')).toBe(true);

    // Verify every action has required fields
    for (const action of replayHistory) {
      expect(action).toHaveProperty('t');
      expect(action).toHaveProperty('type');
      expect(action).toHaveProperty('detail');
    }
  });

  test('open replay modal and verify board renders', async ({ page }) => {
    // Play and win level 1 first
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const puzzle = e2e.gs.currentLevel.puzzle;
      const solution = e2e.gs.currentLevel.solution;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });
    await expect(page.locator('#win-celebration')).toBeVisible({ timeout: 5000 });

    // Open replay modal
    await page.evaluate(() => {
      // Re-init so replay has context
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });

    // Replay modal should be visible
    const replayModal = page.locator('#replay-modal');
    await expect(replayModal).toHaveClass(/show/, { timeout: 3000 });

    // Replay board should have 81 cells
    const replayBoard = page.locator('#replay-board');
    await expect(replayBoard.locator('.rb-cell')).toHaveCount(81);

    // Step info should show "步驟 0 / N"
    const stepInfo = page.locator('#replay-step-info');
    await expect(stepInfo).toContainText('步驟 0');
  });

  test('step forward advances replay and updates board', async ({ page }) => {
    // Setup: play, win, open replay
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const puzzle = e2e.gs.currentLevel.puzzle;
      const solution = e2e.gs.currentLevel.solution;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    // Get initial filled count (only fixed cells should have values)
    const initialFilled = await page.evaluate(() => {
      return (window as any).__e2e.gs.rbState.filter((c: any) => c.value !== 0).length;
    });

    // Step forward 5 times
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => (window as any).__e2e.replay.replayStepForward());
    }

    // Step index should be 5
    const stepIdx = await page.evaluate(() => (window as any).__e2e.gs.rbStepIdx);
    expect(stepIdx).toBe(5);

    // Board should have more filled cells than initial (fills add values)
    const afterFilled = await page.evaluate(() => {
      return (window as any).__e2e.gs.rbState.filter((c: any) => c.value !== 0).length;
    });
    expect(afterFilled).toBeGreaterThanOrEqual(initialFilled);

    // Step info should show "步驟 5"
    await expect(page.locator('#replay-step-info')).toContainText('步驟 5');
  });

  test('step back rewinds replay state correctly', async ({ page }) => {
    // Setup: play, win, open replay
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) { e2e.selectCell(i); e2e.handleInput(solution[i]); }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    // Step forward 5, then back 2
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => (window as any).__e2e.replay.replayStepForward());
    }
    const stateAt5 = await page.evaluate(() =>
      (window as any).__e2e.gs.rbState.map((c: any) => c.value),
    );

    await page.evaluate(() => (window as any).__e2e.replay.replayStepBack());
    await page.evaluate(() => (window as any).__e2e.replay.replayStepBack());

    const stepIdx = await page.evaluate(() => (window as any).__e2e.gs.rbStepIdx);
    expect(stepIdx).toBe(3);

    // Step forward 2 again — should match state at 5
    await page.evaluate(() => (window as any).__e2e.replay.replayStepForward());
    await page.evaluate(() => (window as any).__e2e.replay.replayStepForward());

    const stateAt5Again = await page.evaluate(() =>
      (window as any).__e2e.gs.rbState.map((c: any) => c.value),
    );
    expect(stateAt5Again).toEqual(stateAt5);
  });

  test('auto-play runs to completion and pauses', async ({ page }) => {
    // Setup: play a short game, open replay
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) { e2e.selectCell(i); e2e.handleInput(solution[i]); }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    const totalActions = await page.evaluate(() =>
      (window as any).__e2e.gs.actionHistory.length,
    );

    // Set speed to 4x for faster playback, then play
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.gs.rbSpeed = 4;
      e2e.replay.replayPlay();
    });

    // Wait for playback to complete (175ms per step at 4x)
    const waitMs = Math.ceil((totalActions * 175) + 2000);
    await page.waitForTimeout(Math.min(waitMs, 30_000));

    // Should have reached the end
    const finalStep = await page.evaluate(() => (window as any).__e2e.gs.rbStepIdx);
    expect(finalStep).toBe(totalActions);

    // Should have auto-paused
    const isPlaying = await page.evaluate(() => (window as any).__e2e.gs.rbIsPlaying);
    expect(isPlaying).toBe(false);
  });

  test('speed toggle cycles through 1x → 2x → 4x', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) { e2e.selectCell(i); e2e.handleInput(solution[i]); }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    // Initial speed is 1
    let speed = await page.evaluate(() => (window as any).__e2e.gs.rbSpeed);
    expect(speed).toBe(1);

    // Toggle to 2x
    await page.evaluate(() => (window as any).__e2e.replay.replayToggleSpeed());
    speed = await page.evaluate(() => (window as any).__e2e.gs.rbSpeed);
    expect(speed).toBe(2);

    // Toggle to 4x
    await page.evaluate(() => (window as any).__e2e.replay.replayToggleSpeed());
    speed = await page.evaluate(() => (window as any).__e2e.gs.rbSpeed);
    expect(speed).toBe(4);

    // Toggle back to 1x
    await page.evaluate(() => (window as any).__e2e.replay.replayToggleSpeed());
    speed = await page.evaluate(() => (window as any).__e2e.gs.rbSpeed);
    expect(speed).toBe(1);

    // Speed button text should reflect current speed
    await expect(page.locator('#rb-speed-btn')).toHaveText('1x');
  });

  test('reset returns to step 0', async ({ page }) => {
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) { e2e.selectCell(i); e2e.handleInput(solution[i]); }
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    // Step forward 10
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => (window as any).__e2e.replay.replayStepForward());
    }
    expect(await page.evaluate(() => (window as any).__e2e.gs.rbStepIdx)).toBe(10);

    // Reset
    await page.evaluate(() => (window as any).__e2e.replay.replayReset());

    // Should be at step 0
    expect(await page.evaluate(() => (window as any).__e2e.gs.rbStepIdx)).toBe(0);

    // Board should only show fixed cells
    const boardState = await page.evaluate(() =>
      (window as any).__e2e.gs.rbState.map((c: any) => ({ v: c.value, f: c.fixed })),
    );
    for (const cell of boardState) {
      if (!cell.f) expect(cell.v).toBe(0);
    }

    // Step info should show "步驟 0"
    await expect(page.locator('#replay-step-info')).toContainText('步驟 0');
  });

  test('replay filter shows only mistakes', async ({ page }) => {
    // Play with a deliberate mistake
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      e2e.initGame(1, true);
      const { puzzle, solution } = e2e.gs.currentLevel;

      // Find first empty cell and make a mistake
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0) {
          e2e.selectCell(i);
          const wrong = solution[i] === 9 ? 1 : solution[i] + 1;
          e2e.handleInput(wrong); // mistake
          break;
        }
      }

      // Then solve all remaining correctly
      // Need a small delay for the error flash to clear
    });
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0 && e2e.gs.cellsData[i].value === 0) {
          e2e.selectCell(i);
          e2e.handleInput(solution[i]);
        }
      }
    });
    await page.waitForTimeout(500);

    // Open replay
    await page.evaluate(() => {
      const e2e = (window as any).__e2e;
      const records = JSON.parse(localStorage.getItem('sudoku_records') || '{}');
      const levelId = e2e.gs.currentLevel?.id ?? 1;
      const hist = records[levelId]?.replayHistory ?? records[String(levelId)]?.replayHistory;
      e2e.replay.openHistoricalReplay(1, hist);
    });
    await page.locator('#replay-modal.show').waitFor({ timeout: 3000 });

    // Switch to mistake filter
    await page.evaluate(() => {
      (window as any).__e2e.replay.setReplayFilter('mistake');
    });

    // Replay list should only show mistake items
    const listItems = page.locator('#replay-list .replay-item');
    const count = await listItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // All visible items should be mistakes
    for (let i = 0; i < count; i++) {
      await expect(listItems.nth(i)).toHaveClass(/replay-item-mistake/);
    }
  });
});
