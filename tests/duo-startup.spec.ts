// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const openDuoLobby = vi.hoisted(() => vi.fn(async () => {}));
const getActiveDuoRoomId = vi.hoisted(() => vi.fn(() => 'room-active'));
const getFirebaseIdToken = vi.hoisted(() => vi.fn(async () => 'token'));

vi.mock('../src/platform/nativeApp', () => ({ isNativeApp: () => false }));
vi.mock('../src/features/duo/duoLobby', () => ({ openDuoLobby }));
vi.mock('../src/features/duo/duoRoom', () => ({ getActiveDuoRoomId }));
vi.mock('../src/firebase/runtime', () => ({ getFirebaseIdToken }));

describe('Duo PWA cold-start resume', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  it('prewarms auth and automatically returns a standalone PWA to its stored room after first paint', async () => {
    localStorage.setItem('sudoku_duo_active_room_id', 'room-active');
    localStorage.setItem('sudoku_duo_active_role', 'host');
    const { notifyLevelScreenReady, scheduleDuoAutoResume } = await import('../src/features/duo/duoStartup');

    scheduleDuoAutoResume();
    await vi.waitFor(() => expect(getFirebaseIdToken).toHaveBeenCalledTimes(1));
    expect(openDuoLobby).not.toHaveBeenCalled();

    notifyLevelScreenReady();
    await vi.waitFor(() => expect(openDuoLobby).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.getElementById('duo-resume-title')?.textContent).toBe('已恢復對局'));
    expect(document.getElementById('duo-resume-overlay')?.classList.contains('connected')).toBe(true);
  });

  it('does not interrupt startup when there is no complete stored seat', async () => {
    localStorage.setItem('sudoku_duo_active_room_id', 'room-active');
    const { notifyLevelScreenReady, scheduleDuoAutoResume } = await import('../src/features/duo/duoStartup');

    scheduleDuoAutoResume();
    notifyLevelScreenReady();
    await Promise.resolve();

    expect(getFirebaseIdToken).not.toHaveBeenCalled();
    expect(openDuoLobby).not.toHaveBeenCalled();
    expect(document.getElementById('duo-resume-overlay')).toBeNull();
  });
});
