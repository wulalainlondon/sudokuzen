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
});
