import { describe, expect, it, vi } from 'vitest';
import { handleLobbyMutationRequest } from '../duo-party/src/lobbyMutation';

const roomId = 'r_abcdefgh12345678';
const endpoint = `https://duo-party.example/lobby/${roomId}`;
const verify = vi.fn().mockResolvedValue({ uid: 'owner' });

function request(method: string, body?: object, token = 'id-token'): Request {
  return new Request(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Duo Worker lobby mutations', () => {
  it('rejects unauthenticated and forged host publication before contacting Firestore', async () => {
    const upstream = vi.fn();
    const withoutToken = await handleLobbyMutationRequest(
      new Request(endpoint, { method: 'PUT' }),
      'sudokuzen-f2aa3',
      new Headers(),
      verify,
      upstream,
    );
    expect(withoutToken.status).toBe(401);
    const forged = await handleLobbyMutationRequest(
      request('PUT', { hostId: 'p_someone_else', hostAlias: 'Host', tierId: 'tier0', modeId: 'standard' }),
      'sudokuzen-f2aa3',
      new Headers(),
      verify,
      upstream,
    );
    expect(forged.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards publication, heartbeat and cleanup using the verified Firebase token', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const publish = await handleLobbyMutationRequest(
      request('PUT', { hostId: 'p_owner', hostAlias: 'Host', tierId: 'tier0', modeId: 'standard' }),
      'sudokuzen-f2aa3',
      new Headers(),
      verify,
      upstream,
    );
    expect(publish.status).toBe(204);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toContain(`/documents/duo_ws_rooms/${roomId}`);
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer id-token');
    const document = JSON.parse(init.body);
    expect(document.fields.hostOwnerUid.stringValue).toBe('owner');
    expect(document.fields.status.stringValue).toBe('waiting');
    expect(document.fields.hostHeartbeatAtMs.integerValue).toMatch(/^\d+$/);

    const heartbeat = await handleLobbyMutationRequest(
      request('PATCH'),
      'sudokuzen-f2aa3',
      new Headers(),
      verify,
      upstream,
    );
    expect(heartbeat.status).toBe(204);
    expect(upstream.mock.calls[1][0]).toContain('currentDocument.exists=true');
    expect(Object.keys(JSON.parse(upstream.mock.calls[1][1].body).fields)).toEqual(['hostHeartbeatAtMs', 'updatedAt']);

    const cleanup = await handleLobbyMutationRequest(
      request('DELETE'),
      'sudokuzen-f2aa3',
      new Headers(),
      verify,
      upstream,
    );
    expect(cleanup.status).toBe(204);
    expect(upstream.mock.calls[2][1].method).toBe('DELETE');
  });
});
