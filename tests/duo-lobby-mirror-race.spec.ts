// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gs } from '../src/game/state';

const setDoc = vi.fn();
const deleteDoc = vi.fn();
const updateDoc = vi.fn();
const getRooms = vi.fn();

vi.mock('../src/firebase/client', () => ({
  getPlayerIdentity: () => ({ playerId: 'player-1', alias: 'Steven' }),
}));
vi.mock('../src/firebase/runtime', () => ({
  firebaseServerTimestamp: () => 123,
  getAuthUid: () => 'owner-1',
}));

describe('duo lobby mirror publish/unpublish ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteDoc.mockResolvedValue(undefined);
    updateDoc.mockResolvedValue(undefined);
    getRooms.mockResolvedValue({
      forEach: () => {},
    });
    gs.firebaseReady = true;
    (window as typeof window & { SUDOKU_FIREBASE_CONFIG: Record<string, string> }).SUDOKU_FIREBASE_CONFIG = {
      projectId: 'sudoku-test',
      apiKey: 'public-key',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ documents: [] }), { status: 200 }));
    gs.db = {
      collection: () =>
        ({
          doc: () => ({
            set: setDoc,
            delete: deleteDoc,
            update: updateDoc,
          }),
          orderBy: () => ({
            limit: () => ({
              get: getRooms,
            }),
          }),
        }) as never,
    } as never;
  });

  afterEach(async () => {
    const { unpublishWsLobbyRoom } = await import('../src/features/duo/duoLobbyMirror');
    unpublishWsLobbyRoom();
    gs.db = null;
    gs.firebaseReady = false;
    vi.restoreAllMocks();
  });

  it('deletes a late publish so leaving cannot resurrect the host room in the lobby', async () => {
    let finishPublish: (() => void) | undefined;
    setDoc.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishPublish = resolve;
      }),
    );
    const { publishWsLobbyRoom, unpublishWsLobbyRoom } = await import('../src/features/duo/duoLobbyMirror');

    const publishing = publishWsLobbyRoom('room-created', 'tierII', 'standard');
    await vi.waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    unpublishWsLobbyRoom();
    expect(deleteDoc).not.toHaveBeenCalled();
    finishPublish?.();
    await publishing;

    await vi.waitFor(() => expect(deleteDoc).toHaveBeenCalled());
  });

  it('bypasses the Firestore cache when the player forces a lobby refresh', async () => {
    const { listWaitingWsRooms } = await import('../src/features/duo/duoLobbyMirror');

    await listWaitingWsRooms(20, { force: true });

    expect(getRooms).toHaveBeenCalledWith({ source: 'server' });
  });

  it('allows the SDK cache during background lobby polling', async () => {
    const { listWaitingWsRooms } = await import('../src/features/duo/duoLobbyMirror');

    await listWaitingWsRooms(20);

    expect(getRooms).toHaveBeenCalledWith(undefined);
  });

  it('falls back to authoritative REST documents when a forced iOS SDK read is empty', async () => {
    const now = Date.now();
    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          documents: [
            {
              name: 'projects/sudoku-test/databases/(default)/documents/duo_ws_rooms/room-live',
              fields: {
                hostId: { stringValue: 'host-1' },
                hostAlias: { stringValue: 'S10Ezu4g' },
                tierId: { stringValue: 'tier0' },
                modeId: { stringValue: 'standard' },
                hostHeartbeatAtMs: { integerValue: String(now - 1_000) },
                updatedAt: { timestampValue: new Date(now - 500).toISOString() },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const { listWaitingWsRooms } = await import('../src/features/duo/duoLobbyMirror');

    const rooms = await listWaitingWsRooms(20, { force: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('duo-party.wulalainlondon.workers.dev/lobby?'),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(rooms).toEqual([
      expect.objectContaining({
        roomId: 'room-live',
        hostAlias: 'S10Ezu4g',
        tierId: 'tier0',
        modeId: 'standard',
      }),
    ]);
  });

  it('falls back when the SDK returns only rows too stale for the visible lobby', async () => {
    const now = Date.now();
    getRooms.mockResolvedValueOnce({
      forEach: (visit: (doc: unknown) => void) =>
        visit({
          id: 'room-stale-cache',
          data: () => ({
            hostId: 'host-stale',
            hostAlias: 'Old host',
            tierId: 'tier0',
            modeId: 'standard',
            hostHeartbeatAtMs: now - 90_000,
            updatedAt: { toDate: () => new Date(now - 90_000) },
          }),
          ref: { delete: vi.fn() },
        }),
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          documents: [
            {
              name: 'projects/sudoku-test/databases/(default)/documents/duo_ws_rooms/room-fresh-rest',
              fields: {
                hostId: { stringValue: 'host-fresh' },
                hostAlias: { stringValue: 'S10Ezu4g' },
                tierId: { stringValue: 'tier0' },
                modeId: { stringValue: 'standard' },
                hostHeartbeatAtMs: { integerValue: String(now - 1_000) },
                updatedAt: { timestampValue: new Date(now - 500).toISOString() },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const { listWaitingWsRooms } = await import('../src/features/duo/duoLobbyMirror');

    const rooms = await listWaitingWsRooms(20, { force: true });

    expect(rooms).toEqual([
      expect.objectContaining({
        roomId: 'room-fresh-rest',
        hostAlias: 'S10Ezu4g',
      }),
    ]);
  });
});
