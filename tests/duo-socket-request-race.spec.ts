// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRoomState } from '../src/features/duo/duoWsProtocol';

const sockets: ImmediateReplySocket[] = [];
const tokenControl = vi.hoisted(() => ({
  beforeResolve: null as (() => void) | null,
}));

function roomState(role: 'host' | 'guest'): PublicRoomState {
  const now = Date.now();
  return {
    roomId: 'room-test',
    tierId: 'tierII',
    modeId: 'standard',
    puzzleSeed: 123,
    status: 'waiting',
    host: {
      id: 'player-1',
      alias: 'Steven',
      title: '',
      wins: 0,
      ready: false,
      progress: 0,
      finishTime: null,
      stars: null,
      online: true,
      moves: null,
    },
    guest:
      role === 'guest'
        ? {
            id: 'player-1',
            alias: 'Steven',
            title: '',
            wins: 0,
            ready: false,
            progress: 0,
            finishTime: null,
            stars: null,
            online: true,
            moves: null,
          }
        : null,
    startAt: null,
    countdownStartedAt: null,
    updatedAt: now,
    specBoardState: null,
    specBoardVersion: null,
    specBombAt: null,
    specBombCells: null,
    cc: null,
  };
}

class ImmediateReplySocket extends EventTarget {
  readyState = 1;
  reconnectCount = 0;
  dropNextRequest = false;

  constructor() {
    super();
    sockets.push(this);
  }

  send(raw: string): void {
    const request = JSON.parse(raw) as { type: string; role?: 'host' | 'guest' };
    if (request.type === 'ping' || request.type === 'leave') return;
    if (this.dropNextRequest) {
      this.dropNextRequest = false;
      return;
    }
    const role = request.type === 'join' ? 'guest' : request.role || 'host';
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: role, state: roomState(role) }),
      }),
    );
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }

  reconnect(): void {
    this.reconnectCount++;
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  simulateNetworkReconnect(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
    this.reconnect();
  }

  preconfirmSeatBeforeRequest(role: 'host' | 'guest'): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: role, state: roomState(role) }),
      }),
    );
    this.dropNextRequest = true;
  }
}

vi.mock('partysocket', () => ({ PartySocket: ImmediateReplySocket }));
vi.mock('../src/firebase/client', () => ({
  getPlayerIdentity: () => ({ playerId: 'player-1', alias: 'Steven' }),
}));
vi.mock('../src/firebase/runtime', () => ({
  getFirebaseIdToken: async () => {
    tokenControl.beforeResolve?.();
    tokenControl.beforeResolve = null;
    return 'token';
  },
}));
vi.mock('../src/features/titles', () => ({
  getEquippedTitleDisplay: () => '',
}));
vi.mock('../src/features/duo/duoProfile', () => ({
  loadDuoProfile: () => ({ wins: 0 }),
}));
vi.mock('../src/features/duo/duoGame', () => ({
  handleDuoSnapshot: vi.fn(),
}));
vi.mock('../src/features/duo/duoTransport', () => ({
  getDuoWsHost: () => 'example.test',
}));
vi.mock('../src/features/duo/duoLobby', () => ({
  setDuoLobbyConnectionState: vi.fn(),
}));
vi.mock('../src/ui/feedback', () => ({ showFeedback: vi.fn() }));
vi.mock('../src/i18n/t', () => ({ t: (key: string) => key }));

describe('duo WebSocket direct response ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenControl.beforeResolve = null;
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { duoWsDisconnect } = await import('../src/features/duo/duoSocket');
    duoWsDisconnect();
    sockets.length = 0;
  });

  it('enters a newly created room even when the server replies synchronously inside send()', async () => {
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');

    await expect(duoWsCreateRoom('tierII', 'standard')).resolves.toMatch(/^r_/);
  });

  it('adopts the authoritative host seat when iOS delivers roomState before the request waiter', async () => {
    vi.useFakeTimers();
    tokenControl.beforeResolve = () => sockets.at(-1)?.preconfirmSeatBeforeRequest('host');
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');

    const result = duoWsCreateRoom('tierII', 'standard');
    await vi.advanceTimersByTimeAsync(8_100);

    await expect(result).resolves.toMatch(/^r_/);
    expect(sockets.at(-1)?.readyState).toBe(1);
  });

  it('joins and resumes when their acknowledgements arrive synchronously', async () => {
    const { duoWsDisconnect, duoWsJoinRoom, duoWsResumeRoom } = await import('../src/features/duo/duoSocket');

    await expect(duoWsJoinRoom('room-join')).resolves.toBe(true);
    duoWsDisconnect();
    await expect(duoWsResumeRoom('room-resume', 'host')).resolves.toBe(true);
  });

  it('completes a reconnect reclaim when hello is acknowledged synchronously', async () => {
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');
    const { setDuoLobbyConnectionState } = await import('../src/features/duo/duoLobby');
    await expect(duoWsCreateRoom('tierII', 'standard')).resolves.toMatch(/^r_/);

    const socket = sockets.at(-1);
    expect(socket).toBeDefined();
    socket?.simulateNetworkReconnect();

    await vi.waitFor(() => {
      expect(setDuoLobbyConnectionState).toHaveBeenCalledWith('connected');
    });
    expect(socket?.reconnectCount).toBe(1);
  });
});
