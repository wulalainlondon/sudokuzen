import { expect, test } from '@playwright/test';

test.describe('Duo result experience', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => typeof (window as Record<string, unknown>).openDuoLobby === 'function',
      undefined,
      { timeout: 30_000 },
    );
  });

  test('completion beats are immediate, non-blocking, and replaced by a fast victory result', async ({ page }) => {
    const localLatency = await page.evaluate(async () => {
      const mod = await import('/src/features/duo/duoFinishMoment.ts');
      const startedAt = performance.now();
      mod.showDuoFinishMoment('local', '挑戰完成', '成績已送出 · 等待最終裁定');
      return performance.now() - startedAt;
    });

    expect(localLatency).toBeLessThan(50);
    await expect(page.locator('#duo-finish-moment.local')).toBeVisible();
    await expect(page.locator('#duo-finish-moment.local')).toHaveCSS('pointer-events', 'none');
    await page.waitForTimeout(260);
    await page.screenshot({ path: 'output/v15-duo-result/local-complete.png', fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/src/features/duo/duoFinishMoment.ts');
      mod.showDuoFinishMoment('opponent', 'Steven 已完成', '最後追趕 · 完成你的棋盤');
    });
    await expect(page.locator('#duo-finish-moment.opponent')).toBeVisible();
    await page.waitForTimeout(260);
    await page.screenshot({ path: 'output/v15-duo-result/opponent-complete.png', fullPage: true });

    const resultMount = page.waitForFunction(
      () => document.querySelector('.duo-result-panel.victory h2')?.textContent === '勝利',
      undefined,
      { timeout: 1_000 },
    );
    const openedAt = Date.now();
    await page.evaluate(async () => {
      const finish = await import('/src/features/duo/duoFinishMoment.ts');
      const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
      finish.clearDuoFinishMoment();
      useDuoResultStore.getState().open({
        contentHtml: `
          <div class="duo-result-cards">
            <div class="duo-result-card winner">
              <div class="duo-result-label win">勝</div>
              <div class="duo-result-crown">👑</div>
              <div class="duo-result-alias">Steven</div>
              <div class="duo-result-time">01:28</div>
              <div class="duo-result-stars">★★★</div>
            </div>
            <div class="duo-result-card">
              <div class="duo-result-label lose">敗</div>
              <div class="duo-result-crown"></div>
              <div class="duo-result-alias">玩家9233</div>
              <div class="duo-result-time">01:34</div>
              <div class="duo-result-stars">★★★</div>
            </div>
          </div>
          <div class="duo-result-tier-mode">Tier 0 · 標準</div>
          <div class="duo-result-diff faster">Steven 快了 00:06</div>
          <div class="duo-result-record">歷史戰績：<span>4W 1L 0D</span></div>
        `,
        iWon: true,
        isDraw: false,
        levelId: 1,
        hostMoves: [],
        guestMoves: [],
        hostAlias: 'Steven',
        guestAlias: '玩家9233',
        puzzle: [],
      });
    });
    await resultMount;
    expect(Date.now() - openedAt).toBeLessThan(250);

    await expect(page.locator('#duo-finish-moment')).toHaveCount(0);
    await expect(page.locator('.duo-result-panel.victory h2')).toHaveText('勝利');
    await expect(page.locator('.duo-result-panel.victory .confetti')).toHaveCount(52);
    await expect(page.locator('.duo-result-panel.victory .duo-result-outcome-icon')).toHaveText('🏆');
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'output/v15-duo-result/victory.png', fullPage: true });
  });

  test('defeat and draw use distinct decisive headings without victory confetti', async ({ page }) => {
    const openResult = async (iWon: boolean, isDraw: boolean) => {
      await page.evaluate(
        async ({ won, draw }) => {
          const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
          useDuoResultStore.getState().open({
            contentHtml: '<div class="duo-result-cards"><div class="duo-result-card">result</div></div>',
            iWon: won,
            isDraw: draw,
            levelId: 1,
            hostMoves: [],
            guestMoves: [],
            hostAlias: 'A',
            guestAlias: 'B',
            puzzle: [],
          });
        },
        { won: iWon, draw: isDraw },
      );
    };

    await openResult(false, false);
    await expect(page.locator('.duo-result-panel.defeat h2')).toHaveText('惜敗');
    await expect(page.locator('.duo-result-panel.defeat .confetti')).toHaveCount(0);

    await page.evaluate(async () => {
      const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
      useDuoResultStore.getState().close();
    });
    await expect(page.locator('#duo-result-modal')).toHaveCount(0);

    await openResult(false, true);
    await expect(page.locator('.duo-result-panel h2.draw-title')).toHaveText('平手');
    await expect(page.locator('.duo-result-panel .confetti')).toHaveCount(34);
  });

  test('achievement toast waits until the Duo result reveal has settled', async ({ page }) => {
    await page.evaluate(async () => {
      const { gs } = await import('/src/game/state.ts');
      const { processAchievementToasts } = await import('/src/features/stats.ts');
      gs.isDuoMode = true;
      gs.achievementToastActive = false;
      gs.achievementToastQueue = [
        {
          id: 'qa_duo_result',
          icon: '🏅',
          name: '延後顯示',
          desc: 'QA',
        },
      ];
      processAchievementToasts();
    });

    await page.waitForTimeout(550);
    await expect(page.locator('#achievement-toast')).toHaveCount(0);

    await page.evaluate(async () => {
      const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
      useDuoResultStore.getState().open({
        contentHtml: '<div class="duo-result-cards"><div class="duo-result-card winner">result</div></div>',
        iWon: true,
        isDraw: false,
        levelId: 1,
        hostMoves: [],
        guestMoves: [],
        hostAlias: 'A',
        guestAlias: 'B',
        puzzle: [],
      });
    });

    await expect(page.locator('.duo-result-panel.victory h2')).toHaveText('勝利');
    await page.waitForTimeout(800);
    await expect(page.locator('#achievement-toast')).toHaveCount(0);
    await expect(page.locator('#achievement-toast')).toBeVisible({ timeout: 1_000 });

    await page.evaluate(async () => {
      const { gs } = await import('/src/game/state.ts');
      gs.isDuoMode = false;
    });
  });
});
