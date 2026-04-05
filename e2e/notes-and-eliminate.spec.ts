import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: Notes mode + auto-elimination
 * Toggle notes → add/remove candidates → fill correct digit → peer notes auto-eliminate
 */

async function waitForE2E(page: Page) {
  await page.waitForFunction(() => !!(window as unknown).__e2e?.gs, { timeout: 10_000 });
}

async function clearGameData(page: Page) {
  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
}

test.describe('notes-and-eliminate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForE2E(page);
    await clearGameData(page);
    await page.evaluate(() => {
      (window as unknown).__e2e.gs.isSpeedrunMode = false;
      (window as unknown).__e2e.initGame(1, true);
    });
    await page.locator('.game-container').waitFor({ state: 'visible' });
  });

  test('toggle notes mode adds candidates to cell', async ({ page }) => {
    const emptyIdx = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      return e2e.gs.currentLevel.puzzle.findIndex((v: number) => v === 0);
    });

    // Enable notes mode
    await page.evaluate(() => { (window as unknown).__e2e.gs.isNotesMode = true; });

    // Add candidates 1, 3, 5
    await page.evaluate((idx) => {
      const e2e = (window as unknown).__e2e;
      e2e.selectCell(idx);
      e2e.handleInput(1);
      e2e.handleInput(3);
      e2e.handleInput(5);
    }, emptyIdx);

    const notes = await page.evaluate(
      (idx) => (window as unknown).__e2e.gs.cellsData[idx].notes.slice().sort(),
      emptyIdx,
    );
    expect(notes).toEqual([1, 3, 5]);

    // Cell value should still be 0
    const value = await page.evaluate(
      (idx) => (window as unknown).__e2e.gs.cellsData[idx].value,
      emptyIdx,
    );
    expect(value).toBe(0);
  });

  test('toggling same note digit removes it', async ({ page }) => {
    const emptyIdx = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      return e2e.gs.currentLevel.puzzle.findIndex((v: number) => v === 0);
    });

    await page.evaluate((idx) => {
      const e2e = (window as unknown).__e2e;
      e2e.gs.isNotesMode = true;
      e2e.selectCell(idx);
      e2e.handleInput(4);
      e2e.handleInput(7);
      e2e.handleInput(4); // remove 4
    }, emptyIdx);

    const notes = await page.evaluate(
      (idx) => (window as unknown).__e2e.gs.cellsData[idx].notes,
      emptyIdx,
    );
    expect(notes).toEqual([7]);
  });

  test('filling a cell auto-eliminates that digit from peer notes', async ({ page }) => {
    // Setup: add notes to several cells in same row/col/box, then fill one
    const result = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;

      // Find an empty cell and a peer in the same row that's also empty
      let targetIdx = -1;
      let peerIdx = -1;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] !== 0) continue;
        const row = Math.floor(i / 9);
        // Find peer in same row
        for (let c = 0; c < 9; c++) {
          const j = row * 9 + c;
          if (j !== i && puzzle[j] === 0) {
            targetIdx = i;
            peerIdx = j;
            break;
          }
        }
        if (targetIdx >= 0) break;
      }

      if (targetIdx < 0) return { skip: true };

      const correctDigit = solution[targetIdx];

      // Add the target's correct digit as a note in the peer cell
      e2e.gs.isNotesMode = true;
      e2e.selectCell(peerIdx);
      e2e.handleInput(correctDigit);

      // Verify note was added
      const notesBefore = e2e.gs.cellsData[peerIdx].notes.slice();

      // Now fill the target cell correctly (non-notes mode)
      e2e.gs.isNotesMode = false;
      e2e.selectCell(targetIdx);
      e2e.handleInput(correctDigit);

      // Check if the peer's notes had the digit removed
      const notesAfter = e2e.gs.cellsData[peerIdx].notes.slice();

      return {
        skip: false,
        targetIdx,
        peerIdx,
        correctDigit,
        notesBefore,
        notesAfter,
        peerHadDigit: notesBefore.includes(correctDigit),
        peerStillHas: notesAfter.includes(correctDigit),
      };
    });

    if (result.skip) {
      test.skip();
      return;
    }

    expect(result.peerHadDigit).toBe(true);
    expect(result.peerStillHas).toBe(false);
  });

  test('auto-eliminate records eliminate actions in history', async ({ page }) => {
    // Fill a cell that will trigger eliminate on peers with notes
    await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;

      // Find empty cell and add notes to peers
      const targetIdx = puzzle.findIndex((v: number) => v === 0);
      const correctDigit = solution[targetIdx];
      const row = Math.floor(targetIdx / 9);

      // Add notes with the target digit to same-row peers
      e2e.gs.isNotesMode = true;
      for (let c = 0; c < 9; c++) {
        const j = row * 9 + c;
        if (j !== targetIdx && puzzle[j] === 0) {
          e2e.selectCell(j);
          e2e.handleInput(correctDigit);
        }
      }

      // Fill the target
      e2e.gs.isNotesMode = false;
      e2e.selectCell(targetIdx);
      e2e.handleInput(correctDigit);
    });

    const eliminateActions = await page.evaluate(() =>
      (window as unknown).__e2e.gs.actionHistory.filter((a: unknown) => a.type === 'eliminate'),
    );
    expect(eliminateActions.length).toBeGreaterThan(0);

    // Each eliminate action should have cell index and digit
    for (const action of eliminateActions) {
      expect(action.idx).toBeGreaterThanOrEqual(0);
      expect(action.val).toBeGreaterThanOrEqual(1);
    }
  });

  test('notes are cleared when cell is filled', async ({ page }) => {
    const result = await page.evaluate(() => {
      const e2e = (window as unknown).__e2e;
      const { puzzle, solution } = e2e.gs.currentLevel;
      const emptyIdx = puzzle.findIndex((v: number) => v === 0);

      // Add notes
      e2e.gs.isNotesMode = true;
      e2e.selectCell(emptyIdx);
      e2e.handleInput(1);
      e2e.handleInput(2);
      const notesBefore = e2e.gs.cellsData[emptyIdx].notes.slice();

      // Fill correctly
      e2e.gs.isNotesMode = false;
      e2e.selectCell(emptyIdx);
      e2e.handleInput(solution[emptyIdx]);
      const notesAfter = e2e.gs.cellsData[emptyIdx].notes.slice();

      return { notesBefore, notesAfter };
    });

    expect(result.notesBefore.length).toBeGreaterThan(0);
    expect(result.notesAfter).toEqual([]);
  });
});
