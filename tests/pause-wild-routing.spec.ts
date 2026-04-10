// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gs } from '../src/game/state';
import { pauseGame, leaveWildFromPause, abandonWildFromPause } from '../src/game/core';

const { exitWildMock, emitNavigationMock, abandonWildEncounterMock } = vi.hoisted(() => ({
  exitWildMock: vi.fn(),
  emitNavigationMock: vi.fn(),
  abandonWildEncounterMock: vi.fn(),
}));

vi.mock('../src/features/wild/wildController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/features/wild/wildController')>();
  return {
    ...actual,
    exitWild: exitWildMock,
    abandonWildEncounter: abandonWildEncounterMock,
  };
});

vi.mock('../src/app/navigation/navigationBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/navigation/navigationBus')>();
  return {
    ...actual,
    emitNavigation: emitNavigationMock,
  };
});

describe('wild pause routing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="pause-screen" style="display:none">
        <h2 id="pause-level-name"></h2>
        <p id="pause-timer"></p>
        <div id="leaderboard-list"></div>
        <button class="resume-btn" id="pause-resume-btn"></button>
        <button class="back-btn back-btn-light" id="pause-leave-btn"></button>
        <button class="back-btn back-btn-light" id="pause-abandon-btn" style="display:none;"></button>
      </div>
      <div class="game-container" style="display:flex"></div>
    `;
    localStorage.clear();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    exitWildMock.mockClear().mockImplementation(() => {
      gs.wildChallengeMode = null;
    });
    emitNavigationMock.mockClear();
    abandonWildEncounterMock.mockClear();
    gs.timerInterval = null;
    gs.wildTimerInterval = null;
  });

  it('shows three pause actions for wild and keeps normal buttons unchanged', () => {
    gs.currentLevel = {
      id: -99,
      stars: 0,
      difficultyName: '世界',
      displayName: 'Wild Test',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
      source: 'wild',
    };
    gs.seconds = 12;

    pauseGame();

    expect((document.getElementById('pause-resume-btn') as HTMLButtonElement).textContent).toContain('繼續');
    expect((document.getElementById('pause-leave-btn') as HTMLButtonElement).textContent).toContain('暫離');
    expect((document.getElementById('pause-abandon-btn') as HTMLButtonElement).style.display).not.toBe('none');
    expect((document.getElementById('pause-abandon-btn') as HTMLButtonElement).textContent).toContain('退出對陣');
  });

  it('keeps normal mode pause actions unchanged', () => {
    gs.currentLevel = {
      id: 1,
      stars: 0,
      difficultyName: '一般',
      displayName: 'Normal Test',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
      source: 'normal',
    };
    gs.seconds = 12;

    pauseGame();

    expect((document.getElementById('pause-leave-btn') as HTMLButtonElement).textContent).toContain('放棄關卡');
    expect((document.getElementById('pause-abandon-btn') as HTMLButtonElement).style.display).toBe('none');
  });

  it('leaveWildFromPause exits wild and returns to level screen', async () => {
    gs.currentLevel = {
      id: -99,
      stars: 0,
      difficultyName: '世界',
      displayName: 'Wild Test',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
      source: 'wild',
    };
    gs.wildChallengeMode = 'timed';

    await leaveWildFromPause();

    expect(gs.wildChallengeMode).toBeNull();
    expect(emitNavigationMock).toHaveBeenCalledWith({ type: 'show-level-screen', returnToTier: true });
  });

  it('abandonWildFromPause clears the encounter and returns to level screen', async () => {
    gs.currentLevel = {
      id: -99,
      stars: 0,
      difficultyName: '世界',
      displayName: 'Wild Test',
      puzzle: Array(81).fill(0),
      solution: Array(81).fill(1),
      source: 'wild',
    };

    await abandonWildFromPause();

    expect(abandonWildEncounterMock).toHaveBeenCalledTimes(1);
    expect(emitNavigationMock).toHaveBeenCalledWith({ type: 'show-level-screen', returnToTier: true });
  });
});
