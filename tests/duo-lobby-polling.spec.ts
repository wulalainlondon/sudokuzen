// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listRooms = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../src/features/duo/duoRoom', () => ({
  listWaitingDuoRooms: listRooms,
  resumeDuoRoomIfAny: async () => false,
  cleanupStaleDuoRooms: vi.fn(),
  getActiveDuoRoomId: () => null,
}));
vi.mock('../src/firebase/client', () => ({ whenFirebaseReady: async () => true }));
vi.mock('../src/firebase/runtime', () => ({ initAnonymousAuth: async () => 'player' }));
vi.mock('../src/features/journey', () => ({ canOpenJourneyMode: () => true }));

import { openDuoLobby, closeDuoLobby } from '../src/features/duo/duoLobby';

describe('PWA lobby discovery lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '<div id="duo-lobby" class="hidden"><div id="duo-room-list"></div></div>';
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    closeDuoLobby();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps fetching fresh rooms every six seconds after a minute in the lobby', async () => {
    await openDuoLobby();
    expect(listRooms).toHaveBeenLastCalledWith(20, { force: true });
    for (let poll = 0; poll < 10; poll++) {
      await vi.advanceTimersByTimeAsync(6_000);
      await vi.dynamicImportSettled();
    }
    expect(listRooms).toHaveBeenCalledTimes(11);
    closeDuoLobby();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(listRooms).toHaveBeenCalledTimes(11);
  });

  it('refreshes immediately on foreground and reconnect, but stops after closing', async () => {
    await openDuoLobby();
    vi.mocked(listRooms).mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(listRooms).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(listRooms).toHaveBeenCalledTimes(2);
    closeDuoLobby();
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(listRooms).toHaveBeenCalledTimes(2);
  });
});
