import { type Page, expect } from '@playwright/test';

/**
 * Shared helpers for Sudoku Zen E2E tests.
 * All game interaction goes through the DOM — no module imports.
 */

/** Wait for the level screen (stage map) to be visible. */
export async function waitForLevelScreen(page: Page) {
  await page.locator('#level-screen').waitFor({ state: 'visible', timeout: 10_000 });
}

/** Click into a tier by name, then click a specific level card. */
export async function enterLevel(page: Page, tierName: string, levelId: number) {
  // Click tier card on stage map
  await page.locator(`.stage-card:has-text("${tierName}")`).click();
  await page.locator('#tier-view').waitFor({ state: 'visible' });

  // Click level item
  await page.locator(`#level-list .level-item[data-id="${levelId}"]`).click();
  await page.locator('#pre-level-modal').waitFor({ state: 'visible' });
}

/** Start a level from the pre-level modal (force reset). */
export async function startLevel(page: Page) {
  // Click the start button
  await page.locator('#pre-level-start-btn').click();
  // Wait for game grid to appear
  await page.locator('.game-container').waitFor({ state: 'visible' });
  await page.locator('#grid').waitFor({ state: 'visible' });
}

/** Start level 1 directly by navigating and using evaluate for a clean start. */
export async function startLevelById(page: Page, levelId: number) {
  await page.evaluate((id) => {
    const { initGame } = (window as any).__testHooks || {};
    if (initGame) initGame(id, true);
  }, levelId);
  await page.locator('.game-container').waitFor({ state: 'visible' });
}

/** Select a cell on the 9x9 grid by index (0-80). */
export async function selectCell(page: Page, idx: number) {
  await page.locator(`#grid > .cell:nth-child(${idx + 1})`).click();
}

/** Press a digit on the numpad. */
export async function pressDigit(page: Page, digit: number) {
  await page.locator(`.num-btn:nth-child(${digit})`).click();
}

/** Get the solution array from the current level via page context. */
export async function getSolution(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as any).gs?.currentLevel?.solution ?? []);
}

/** Get the puzzle array from the current level. */
export async function getPuzzle(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as any).gs?.currentLevel?.puzzle ?? []);
}

/** Get current cellsData values. */
export async function getCellValues(page: Page): Promise<number[]> {
  return page.evaluate(() => ((window as any).gs?.cellsData ?? []).map((c: any) => c.value));
}

/** Get the action history length. */
export async function getActionCount(page: Page): Promise<number> {
  return page.evaluate(() => ((window as any).gs?.actionHistory ?? []).length);
}

/** Get the error count. */
export async function getErrors(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).gs?.errors ?? 0);
}

/** Solve the puzzle by filling all empty cells with correct values. */
export async function solveAllCells(page: Page) {
  const solution = await getSolution(page);
  const puzzle = await getPuzzle(page);

  for (let i = 0; i < 81; i++) {
    if (puzzle[i] === 0) {
      await selectCell(page, i);
      await pressDigit(page, solution[i]);
      // Small delay to let UI update
      await page.waitForTimeout(50);
    }
  }
}

/** Check if the win celebration is visible. */
export async function isWinVisible(page: Page): Promise<boolean> {
  const el = page.locator('#win-celebration');
  return el.isVisible();
}

/** Get records from localStorage. */
export async function getRecords(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('sudoku_records');
    return raw ? JSON.parse(raw) : {};
  });
}
