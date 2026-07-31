// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDuoRoom = vi.fn();
const listWaitingDuoRooms = vi.fn();

vi.mock('../src/features/duo/duoRoom', () => ({
  createDuoRoom,
  listWaitingDuoRooms,
  leaveDuoRoom: vi.fn(),
}));

describe('duo lobby create-room UI flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWaitingDuoRooms.mockResolvedValue([]);
    document.body.innerHTML = `
      <div id="level-screen"></div>
      <div class="level-screen-header"></div>
      <div class="alias-config"></div>
      <div id="stage-view"></div>
      <div id="tier-view"></div>
      <div id="wild-lobby"></div>
      <div id="duo-lobby">
        <button class="duo-lobby-create">
          <span id="duo-create-btn-text">建立房間</span>
        </button>
        <div id="duo-room-list">
          <button class="duo-room-item" data-room="room-created">Steven</button>
        </div>
      </div>
      <div id="duo-room-view" class="hidden">
        <div id="duo-room-tier-mode"></div>
      </div>
    `;
  });

  it('disables duplicate taps, then hides the lobby and opens the room after create succeeds', async () => {
    let finishCreate: ((roomId: string) => void) | undefined;
    createDuoRoom.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishCreate = resolve;
      }),
    );
    const { createDuoRoomFromLobby } = await import('../src/features/duo/duoLobby');

    const transition = createDuoRoomFromLobby();
    await vi.waitFor(() => {
      expect(document.getElementById('duo-create-btn-text')?.textContent).toBe('...');
    });
    expect(document.querySelector<HTMLButtonElement>('.duo-lobby-create')?.disabled).toBe(true);

    finishCreate?.('room-created');
    await transition;

    expect(createDuoRoom).toHaveBeenCalledTimes(1);
    expect(document.getElementById('duo-lobby')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('duo-room-view')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('.duo-lobby-create')?.disabled).toBe(false);
    expect(document.getElementById('duo-create-btn-text')?.textContent).toBe('建立房間');
    // A stale list row cannot be exposed after success because the lobby must
    // no longer be the active view—the exact failure shown in the player video.
    expect(document.querySelector('.duo-room-item')?.closest('#duo-lobby')?.classList.contains('hidden')).toBe(true);
  });

  it('keeps the lobby visible and restores the button when create is rejected', async () => {
    createDuoRoom.mockResolvedValueOnce(null);
    const { createDuoRoomFromLobby } = await import('../src/features/duo/duoLobby');

    await createDuoRoomFromLobby();

    expect(document.getElementById('duo-lobby')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('duo-room-view')?.classList.contains('hidden')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.duo-lobby-create')?.disabled).toBe(false);
    expect(document.getElementById('duo-create-btn-text')?.textContent).toBe('建立房間');
  });

  it('makes the visible refresh button bypass stale room cache by default', async () => {
    const { refreshDuoLobbyRoom } = await import('../src/features/duo/duoLobby');

    await refreshDuoLobbyRoom();

    expect(listWaitingDuoRooms).toHaveBeenCalledWith(20, { force: true });
  });
});
