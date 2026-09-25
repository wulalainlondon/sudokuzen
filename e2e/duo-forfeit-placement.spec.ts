import { expect, test } from '@playwright/test';

test('opponent-finished surrender stays beside the title and leaves number keys touchable', async ({ page }) => {
  await page.setViewportSize({ width: 411, height: 780 });
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as unknown as { openDuoLobby?: unknown }).openDuoLobby === 'function',
  );
  // The level-screen fallback runs after first paint; let it settle before opening an isolated board.
  await page.waitForTimeout(1300);

  await page.evaluate(async () => {
    const { gs } = await import('/src/game/state.ts');
    const duo = await import('/src/features/duo/duoGame.ts');
    gs.duoRole = 'guest';
    gs.duoRoomData = {
      tierId: 'tier0',
      modeId: 'standard',
      puzzleSeed: 3,
      status: 'playing',
      hostId: 'p_host',
      hostAlias: '對手',
      guestId: 'p_guest',
      guestAlias: '測試玩家',
      hostProgress: 0,
      guestProgress: 0,
      hostFinishTime: null,
      guestFinishTime: null,
    } as never;
    await duo.launchDuoGame();
    duo.handleDuoSnapshot({ ...gs.duoRoomData, hostProgress: 45, hostFinishTime: 90, hostStars: 3 } as never);
  });

  const button = page.locator('#duo-forfeit-btn');
  await expect(button).toBeVisible();
  const layout = await page.evaluate(() => {
    const title = document.getElementById('game-title')!.getBoundingClientRect();
    const action = document.getElementById('duo-forfeit-btn')!;
    const buttonRect = action.getBoundingClientRect();
    const numpad = document.getElementById('numpad')!.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(buttonRect.right, numpad.right) - Math.max(buttonRect.left, numpad.left));
    const overlapHeight = Math.max(
      0,
      Math.min(buttonRect.bottom, numpad.bottom) - Math.max(buttonRect.top, numpad.top),
    );
    const digits = [...document.querySelectorAll<HTMLElement>('#numpad .num-btn')];
    return {
      inTitleWrap: action.parentElement?.classList.contains('game-title-wrap'),
      rightOfTitle: buttonRect.left >= title.right,
      insideViewport: buttonRect.right <= innerWidth && buttonRect.bottom <= innerHeight,
      overlapsNumpad: overlapWidth > 0 && overlapHeight > 0,
      numberKeysTouchable: ['5', '8'].every((label) => {
        const digit = digits.find((item) => item.textContent?.trim() === label);
        if (!digit) return false;
        const rect = digit.getBoundingClientRect();
        return (
          document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.num-btn') ===
          digit
        );
      }),
    };
  });

  expect(layout).toEqual({
    inTitleWrap: true,
    rightOfTitle: true,
    insideViewport: true,
    overlapsNumpad: false,
    numberKeysTouchable: true,
  });
});
