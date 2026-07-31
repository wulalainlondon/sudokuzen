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
    await page.screenshot({ path: 'output/v16-duo-outcomes/local-complete.png', fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/src/features/duo/duoFinishMoment.ts');
      mod.showDuoFinishMoment('opponent', 'Steven 已完成', '最後追趕 · 完成你的棋盤');
    });
    await expect(page.locator('#duo-finish-moment.opponent')).toBeVisible();
    await page.waitForTimeout(260);
    await page.screenshot({ path: 'output/v16-duo-outcomes/opponent-complete.png', fullPage: true });

    const resultMount = page.waitForFunction(
      () => document.querySelector('.duo-result-panel.outcome-close-win h2')?.textContent === '險勝',
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
        outcomeTier: 'close-win',
        timeDiffSec: 6,
        gapRatio: 6 / 94,
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
    await expect(page.locator('.duo-result-panel.outcome-close-win h2')).toHaveText('險勝');
    await expect(page.locator('.duo-result-panel.victory .confetti')).toHaveCount(46);
    await expect(page.locator('.duo-result-panel.victory .duo-result-outcome-icon')).toHaveText('⚔️');
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'output/v16-duo-outcomes/close-win.png', fullPage: true });
  });

  test('all seven time-based outcomes have distinct headings and visual tiers', async ({ page }) => {
    const outcomes = [
      { tier: 'dominant-win', title: '大勝', confetti: 72, icon: '🏆', diff: 45, ratio: 0.3 },
      { tier: 'close-win', title: '險勝', confetti: 46, icon: '⚔️', diff: 4, ratio: 0.04 },
      { tier: 'win', title: '勝利', confetti: 52, icon: '🏆', diff: 18, ratio: 0.12 },
      { tier: 'draw', title: '平手', confetti: 34, icon: '⚔️', diff: 0, ratio: 0 },
      { tier: 'close-loss', title: '惜敗', confetti: 0, icon: '⚔️', diff: 4, ratio: 0.04 },
      { tier: 'loss', title: '落敗', confetti: 0, icon: '◇', diff: 18, ratio: 0.12 },
      { tier: 'dominant-loss', title: '慘敗', confetti: 0, icon: '◆', diff: 45, ratio: 0.3 },
    ] as const;

    for (const outcome of outcomes) {
      await page.evaluate(async (item) => {
        const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
        useDuoResultStore.getState().open({
          contentHtml: `
            <div class="duo-result-cards">
              <div class="duo-result-card winner"><div class="duo-result-crown">👑</div><div class="duo-result-alias">S10Ezu4g</div><div class="duo-result-time">01:30</div></div>
              <div class="duo-result-card"><div class="duo-result-crown"></div><div class="duo-result-alias">玩家9233</div><div class="duo-result-time">02:15</div></div>
            </div>
            <div class="duo-result-tier-mode">初心 · 標準</div>
            <div class="duo-result-diff">時間差 00:${String(item.diff).padStart(2, '0')}</div>
            <div class="duo-result-record">歷史戰績：<span>4W 1L 0D</span></div>
          `,
          iWon: item.tier.endsWith('win'),
          isDraw: item.tier === 'draw',
          outcomeTier: item.tier,
          timeDiffSec: item.diff,
          gapRatio: item.ratio,
          levelId: 1,
          hostMoves: [],
          guestMoves: [],
          hostAlias: 'S10Ezu4g',
          guestAlias: '玩家9233',
          puzzle: [],
        });
      }, outcome);

      const panel = page.locator(`.duo-result-panel.outcome-${outcome.tier}`);
      await expect(panel.locator('h2')).toHaveText(outcome.title);
      await expect(panel.locator('.duo-result-outcome-icon')).toHaveText(outcome.icon);
      await expect(panel.locator('.confetti')).toHaveCount(outcome.confetti);
      await page.waitForTimeout(120);
      await page.screenshot({
        path: `output/v16-duo-outcomes/${outcome.tier}.png`,
        fullPage: true,
      });
      await page.evaluate(async () => {
        const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
        useDuoResultStore.getState().close();
      });
      await expect(page.locator('#duo-result-modal')).toHaveCount(0);
    }
  });

  test('production result flow classifies a real 60-second gap as a dominant win', async ({ page }) => {
    await page.evaluate(async () => {
      const { gs } = await import('/src/game/state.ts');
      const { showDuoResult } = await import('/src/features/duo/duoGame.ts');
      gs.duoRole = 'host';
      gs.isDuoMode = true;
      showDuoResult({
        levelId: 1,
        tierId: 'tierI',
        modeId: 'standard',
        puzzleSeed: 1601,
        status: 'finished',
        hostId: 'host',
        hostAlias: 'S10Ezu4g',
        hostTitle: null,
        hostReady: true,
        hostProgress: 100,
        hostFinishTime: 90,
        hostStars: 3,
        guestId: 'guest',
        guestAlias: '玩家9233',
        guestTitle: null,
        guestReady: true,
        guestProgress: 100,
        guestFinishTime: 150,
        guestStars: 3,
        startAt: null,
        countdownStartedAt: null,
        updatedAt: null,
      });
    });

    const panel = page.locator('.duo-result-panel.outcome-dominant-win');
    await expect(panel.locator('h2')).toHaveText('大勝');
    await expect(panel.locator('#duo-result-diff')).toContainText('領先 01:00');
    await expect(panel.locator('.confetti')).toHaveCount(72);
  });

  test('forfeit and double abandonment never render as a time-gap defeat', async ({ page }) => {
    const outcomes = [
      { tier: 'forfeit-win', title: '勝利', icon: '🏆' },
      { tier: 'forfeit-loss', title: '已認輸', icon: '◇' },
      { tier: 'abandoned', title: '對局中止', icon: '◌' },
    ] as const;

    for (const outcome of outcomes) {
      await page.evaluate(async (item) => {
        const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
        useDuoResultStore.getState().open({
          contentHtml: '<div class="duo-result-diff">本局沒有可比較的時間差</div>',
          iWon: item.tier === 'forfeit-win',
          isDraw: false,
          outcomeTier: item.tier,
          timeDiffSec: 0,
          gapRatio: 0,
          levelId: 1,
          hostMoves: [],
          guestMoves: [],
          hostAlias: 'A',
          guestAlias: 'B',
          puzzle: [],
        });
      }, outcome);
      const panel = page.locator(`.duo-result-panel.outcome-${outcome.tier}`);
      await expect(panel.locator('h2')).toHaveText(outcome.title);
      await expect(panel.locator('.duo-result-outcome-icon')).toHaveText(outcome.icon);
      await expect(panel).not.toHaveClass(/outcome-dominant-loss/);
      await page.evaluate(async () => {
        const { useDuoResultStore } = await import('/src/react/duoresult/duoResultStore.ts');
        useDuoResultStore.getState().close();
      });
    }
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
        outcomeTier: 'win',
        timeDiffSec: 18,
        gapRatio: 0.12,
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
    await expect(page.locator('#achievement-toast')).toBeVisible({ timeout: 2_000 });

    await page.evaluate(async () => {
      const { gs } = await import('/src/game/state.ts');
      gs.isDuoMode = false;
    });
  });
});
