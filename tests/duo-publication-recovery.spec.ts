// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase/client', () => ({ getPlayerIdentity: () => ({ playerId: 'host', alias: 'Host' }) }));
vi.mock('../src/firebase/runtime', () => ({ getAuthUid: () => 'owner', firebaseServerTimestamp: () => Date.now() }));

describe('bounded lobby publication and late-write reconciliation', () => {
  let gs: (typeof import('../src/game/state'))['gs'];
  let mirror: typeof import('../src/features/duo/duoLobbyMirror');
  let server: Map<string, Record<string, unknown>>;
  const set = vi.fn();
  const remove = vi.fn();
  const update = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    server = new Map();
    document.body.innerHTML = '<div id="duo-room-publication-state" class="hidden"></div>';
    set.mockReset().mockImplementation(async (id: string, data: Record<string, unknown>) => {
      server.set(id, data);
    });
    remove.mockReset().mockImplementation(async (id: string) => {
      server.delete(id);
    });
    update.mockReset().mockResolvedValue(undefined);
    ({ gs } = await import('../src/game/state'));
    gs.firebaseReady = true;
    gs.db = {
      collection: () => ({
        doc: (id: string) => ({
          set: (data: unknown) => set(id, data),
          delete: () => remove(id),
          update: (data: unknown) => update(id, data),
        }),
      }),
    } as never;
    mirror = await import('../src/features/duo/duoLobbyMirror');
  });

  afterEach(async () => {
    mirror.unpublishWsLobbyRoom();
    await vi.runAllTimersAsync();
    gs.firebaseReady = false;
    gs.db = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function delayFirstPublish(): () => void {
    let finish = () => {};
    set.mockImplementationOnce(
      (id: string, data: Record<string, unknown>) =>
        new Promise<void>((resolve) => {
          finish = () => {
            server.set(id, data);
            resolve();
          };
        }),
    );
    return () => finish();
  }

  it('coalesces snapshots, releases a stuck write after four seconds and retries successfully', async () => {
    delayFirstPublish();
    const first = mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++)
      mirror.syncWsLobbyRoom(
        { status: 'waiting', guestId: null, tierId: 'tier0', modeId: 'standard' } as never,
        'room',
      );
    expect(set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    await first;
    expect(mirror.getWsLobbyMirrorDebugState().publicationState).toBe('retrying');
    expect(document.getElementById('duo-room-publication-state')?.textContent).toContain('重試');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(set).toHaveBeenCalledTimes(2);
    expect(server.has('room')).toBe(true);
    expect(mirror.getWsLobbyMirrorDebugState().publicationState).toBe('published');
  });

  it('does not delete a healthy retry when the original publish arrives late', async () => {
    const finish = delayFirstPublish();
    void mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    await vi.advanceTimersByTimeAsync(5_000);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).not.toHaveBeenCalled();
    expect(server.get('room')?.hostHeartbeatAtMs).toBe(Date.now());
    expect(mirror.getWsLobbyMirrorDebugState().publicationState).toBe('published');
  });

  it('cleans a late publish even if pagehide occurred before the room became public', async () => {
    const finish = delayFirstPublish();
    void mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(4_000);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.has('room')).toBe(false);
    expect(mirror.getWsLobbyMirrorDebugState().desiredVisible).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('publishes a different room without waiting behind an old stuck room', async () => {
    const finish = delayFirstPublish();
    void mirror.publishWsLobbyRoom('old', 'tier0', 'standard');
    await vi.advanceTimersByTimeAsync(0);
    await mirror.publishWsLobbyRoom('new', 'tier0', 'standard');
    expect(server.has('new')).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.has('old')).toBe(false);
    expect(server.has('new')).toBe(true);
    expect(remove.mock.calls.every(([id]) => id === 'old')).toBe(true);
  });

  it('keeps the latest room settings when an older incarnation arrives after republishing', async () => {
    const finish = delayFirstPublish();
    void mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    await vi.advanceTimersByTimeAsync(0);
    mirror.unpublishWsLobbyRoom();
    const latest = mirror.publishWsLobbyRoom('room', 'tierII', 'ironWall');
    await vi.advanceTimersByTimeAsync(4_000);
    await latest;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.get('room')?.modeId).toBe('ironWall');
    expect(server.get('room')?.tierId).toBe('tierII');
    expect(remove).not.toHaveBeenCalled();
  });

  it('recovers if a previously timed-out deletion removes a newly republished room', async () => {
    await mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    let finish = () => {};
    remove.mockImplementationOnce(
      (id: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            server.delete(id);
            resolve();
          };
        }),
    );
    mirror.unpublishWsLobbyRoom();
    await vi.advanceTimersByTimeAsync(4_000);
    await mirror.publishWsLobbyRoom('room', 'tierII', 'standard');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.get('room')?.tierId).toBe('tierII');
  });

  it('retries a stalled heartbeat through a fresh publish', async () => {
    await mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    update.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(2);
    expect(mirror.getWsLobbyMirrorDebugState().publicationState).toBe('published');
  });

  it('retries a failed cleanup instead of leaving a fresh ghost room behind', async () => {
    await mirror.publishWsLobbyRoom('room', 'tier0', 'standard');
    remove.mockRejectedValueOnce(new Error('offline'));
    mirror.unpublishWsLobbyRoom();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(server.has('room')).toBe(false);
  });
});
