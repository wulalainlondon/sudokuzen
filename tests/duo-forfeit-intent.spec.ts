// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gs, type DuoRoomData } from '../src/game/state';
import { resetDuoState, showDuoResult, surrenderDuo } from '../src/features/duo/duoGame';
import { useDuoResultStore } from '../src/react/duoresult/duoResultStore';

const mocks = vi.hoisted(() => ({ surrender: vi.fn(), record: vi.fn() }));
vi.mock('../src/features/duo/duoTransport', () => ({ isDuoWsEnabled: () => true }));
vi.mock('../src/features/duo/duoSocket', () => ({ duoWsSurrender: mocks.surrender, duoWsDisconnect: vi.fn() }));
vi.mock('../src/features/duo/duoLobbyMirror', () => ({ unpublishWsLobbyRoom: vi.fn() }));
vi.mock('../src/features/duo/duoProfile', () => {
  const profile = { wins: 7, losses: 2, draws: 1, currentStreak: 0 };
  return {
    loadDuoProfile: () => profile,
    getLifetimeDuoProfile: () => profile,
    checkNewUnlocks: () => ({ newTiers: [], newModes: [] }),
    markDuoRoomResultRecorded: () => true,
    recordDuoMatch: mocks.record.mockReturnValue(profile),
  };
});

function room(): DuoRoomData {
  return {
    levelId: 0,
    tierId: 'tier0',
    modeId: 'standard',
    puzzleSeed: 23,
    status: 'finished',
    hostId: 'h',
    hostAlias: 'Host',
    hostTitle: null,
    hostReady: true,
    hostProgress: 81,
    hostFinishTime: 120,
    hostStars: 3,
    guestId: 'g',
    guestAlias: 'Guest',
    guestTitle: null,
    guestReady: true,
    guestProgress: 20,
    guestFinishTime: null,
    guestStars: null,
    startAt: null,
    countdownStartedAt: null,
    updatedAt: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetDuoState();
  useDuoResultStore.getState().close();
  vi.clearAllMocks();
  gs.duoRole = 'guest';
  gs.isDuoMode = true;
  document.body.innerHTML = '<button id="duo-forfeit-btn">Forfeit</button>';
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Duo forfeit intent and interrupted results', () => {
  it('cancelled confirmation keeps the attempt and surrender action available', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await surrenderDuo();
    expect(mocks.surrender).not.toHaveBeenCalled();
    expect(document.getElementById('duo-forfeit-btn')).not.toBeNull();
    vi.mocked(window.confirm).mockReturnValue(true);
    await surrenderDuo();
    expect(mocks.surrender).toHaveBeenCalledOnce();
  });

  it('confirmed surrender is submitted once, including duplicate clicks', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await surrenderDuo();
    await surrenderDuo();
    expect(confirmation).toHaveBeenCalledOnce();
    expect(mocks.surrender).toHaveBeenCalledOnce();
    expect(document.getElementById('duo-forfeit-btn')).toBeNull();
  });

  it.each(['host', 'guest', 'both'] as const)('missing %s result cannot infer or record a loss', (missing) => {
    const d = room();
    d.guestFinishTime = 180;
    if (missing !== 'guest') d.hostFinishTime = null;
    if (missing !== 'host') d.guestFinishTime = null;
    showDuoResult(d);
    expect(mocks.record).not.toHaveBeenCalled();
    const result = useDuoResultStore.getState();
    expect(result.outcomeTier).toBe('abandoned');
    expect(result.iWon).toBe(false);
    expect(result.contentHtml).not.toContain('認輸');
    expect(result.contentHtml).toContain('本局不列入戰績');
  });

  it.each([
    ['disconnect', '斷線逾時'],
    ['left', '離開對局'],
    ['surrender', '認輸'],
  ] as const)('renders authoritative %s reason for a real forfeit', (reason, label) => {
    const d = room();
    d.guestFinishTime = 9999;
    d.guestEndReason = reason;
    showDuoResult(d);
    expect(mocks.record).toHaveBeenCalledOnce();
    expect(useDuoResultStore.getState().outcomeTier).toBe('forfeit-loss');
    expect(useDuoResultStore.getState().contentHtml).toContain(label);
  });
});
