// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRoomState } from '../src/features/duo/duoWsProtocol';

const sockets: ImmediateReplySocket[] = [];
const tokenControl = vi.hoisted(() => ({
  beforeResolve: null as (() => void) | null,
}));

function roomState(role: 'host' | 'guest', roomId = 'room-test'): PublicRoomState {
  const now = Date.now();
  return {
    roomId,
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
  dropCreateAckAfterApply = false;
  rejectHello = false;
  holdHello = false;
  sentTypes: string[] = [];
  roomId: string;

  constructor(options?: { room?: string }) {
    super();
    this.roomId = options?.room || 'room-test';
    sockets.push(this);
  }

  send(raw: string): void {
    const request = JSON.parse(raw) as { type: string; role?: 'host' | 'guest' };
    if (request.type === 'ping' || request.type === 'leave') return;
    this.sentTypes.push(request.type);
    if (request.type === 'hello' && this.holdHello) return;
    if (request.type === 'finish') return;
    if (request.type === 'create' && this.dropCreateAckAfterApply) {
      this.dropCreateAckAfterApply = false;
      return;
    }
    if (request.type === 'hello' && this.rejectHello) {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'error', code: 'reclaim_failed', message: 'Seat no longer yours' }),
        }),
      );
      return;
    }
    if (this.dropNextRequest) {
      this.dropNextRequest = false;
      return;
    }
    const role = request.type === 'join' ? 'guest' : request.role || 'host';
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: role, state: roomState(role, this.roomId) }),
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

  announceUnclaimedRoom(role: 'host' | 'guest'): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: null, state: roomState(role, this.roomId) }),
      }),
    );
  }

  preconfirmSeatBeforeRequest(role: 'host' | 'guest'): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: role, state: roomState(role, this.roomId) }),
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
  getLifetimeDuoProfile: () => ({ wins: 0 }),
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

  it('keeps a finish queued until the reopened socket has reclaimed its seat', async () => {
    const { duoWsCreateRoom, duoWsFinish } = await import('../src/features/duo/duoSocket');
    await duoWsCreateRoom('tierII', 'standard');
    const socket = sockets.at(-1)!;
    socket.holdHello = true;
    socket.simulateNetworkReconnect();
    duoWsFinish(120, 3, []);
    await Promise.resolve();
    await Promise.resolve();
    expect(socket.sentTypes).not.toContain('finish');
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomState', you: 'host', state: roomState('host', socket.roomId) }),
      }),
    );
    await vi.waitFor(() => expect(socket.sentTypes).toContain('finish'));
  });

  it('ignores a late close from the previous room instead of blocking the current room', async () => {
    const { duoWsCreateRoom, duoWsFinish } = await import('../src/features/duo/duoSocket');
    await duoWsCreateRoom('tierII', 'standard');
    const previous = sockets.at(-1)!;
    await duoWsCreateRoom('tierII', 'standard');
    const current = sockets.at(-1)!;
    previous.dispatchEvent(new Event('close'));
    duoWsFinish(120, 3);
    expect(current.sentTypes).toContain('finish');
  });

  it.each(['host', 'guest'] as const)(
    'requires authenticated hello on a cold %s resume despite a public room snapshot',
    async (role) => {
      const { gs } = await import('../src/game/state');
      gs.duoRole = role;
      const { duoWsResumeRoom, duoWsFinish } = await import('../src/features/duo/duoSocket');
      tokenControl.beforeResolve = () => {
        const socket = sockets.at(-1)!;
        socket.announceUnclaimedRoom(role);
        duoWsFinish(120, 3);
        expect(socket.sentTypes).not.toContain('finish');
      };
      await expect(duoWsResumeRoom('cold-resume-' + role, role)).resolves.toBe(true);
      expect(sockets.at(-1)?.sentTypes).toContain('hello');
      duoWsFinish(120, 3);
      expect(sockets.at(-1)?.sentTypes).toContain('finish');
    },
  );

  it('enters a newly created room even when the server replies synchronously inside send()', async () => {
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');

    await expect(duoWsCreateRoom('tierII', 'standard')).resolves.toMatch(/^r_/);
  });

  it('adopts the authoritative host seat when iOS delivers roomState before the request waiter', async () => {
    tokenControl.beforeResolve = () => sockets.at(-1)?.preconfirmSeatBeforeRequest('host');
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');

    await expect(duoWsCreateRoom('tierII', 'standard')).resolves.toMatch(/^r_/);
    expect(sockets.at(-1)?.readyState).toBe(1);
  });

  it('reclaims the same host seat when create succeeded but its direct acknowledgement was lost', async () => {
    vi.useFakeTimers();
    tokenControl.beforeResolve = () => {
      const socket = sockets.at(-1);
      if (socket) socket.dropCreateAckAfterApply = true;
    };
    const { duoWsCreateRoom } = await import('../src/features/duo/duoSocket');

    const create = duoWsCreateRoom('tierII', 'standard');
    await vi.advanceTimersByTimeAsync(8_001);

    await expect(create).resolves.toMatch(/^r_/);
    expect(sockets.at(-1)?.sentTypes).toEqual(['create', 'hello']);
    expect(sockets.at(-1)?.readyState).toBe(1);
  });

  it('does not reuse a previous room snapshot for a different room id', async () => {
    const { duoWsCreateRoom, duoWsDisconnect } = await import('../src/features/duo/duoSocket');
    await expect(duoWsCreateRoom('tierII', 'standard')).resolves.toMatch(/^r_/);
    duoWsDisconnect();

    vi.useFakeTimers();
    tokenControl.beforeResolve = () => {
      const socket = sockets.at(-1);
      if (!socket) return;
      socket.dropNextRequest = true;
      socket.rejectHello = true;
    };
    const create = duoWsCreateRoom('tierII', 'standard');
    await vi.advanceTimersByTimeAsync(8_001);

    await expect(create).resolves.toBeNull();
    expect(sockets.at(-1)?.sentTypes).toEqual(['create', 'hello']);
    expect(sockets.at(-1)?.readyState).toBe(3);
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
