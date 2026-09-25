import { verifyFirebaseIdToken } from './auth';

type VerifyToken = typeof verifyFirebaseIdToken;
type LobbyFields = { hostId?: unknown; hostAlias?: unknown; tierId?: unknown; modeId?: unknown };

const ROOM_ID = /^r_[a-z0-9]{8,30}$/;
const ALIAS = /^[^<>&"\\']{1,24}$/;
const CONFIG_ID = /^[a-zA-Z0-9_-]{1,32}$/;

export async function handleLobbyMutationRequest(
  request: Request,
  projectId: string,
  headers: Headers,
  verify: VerifyToken = verifyFirebaseIdToken,
  upstreamFetch: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'PUT, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return new Response(null, { status: 204, headers });
  }
  if (!['PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    headers.set('Allow', 'PUT, PATCH, DELETE, OPTIONS');
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
  }
  const roomId = new URL(request.url).pathname.slice('/lobby/'.length);
  if (!ROOM_ID.test(roomId)) return Response.json({ error: 'invalid_room' }, { status: 400, headers });
  if (!projectId) return Response.json({ error: 'project_not_configured' }, { status: 503, headers });
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!bearer) return Response.json({ error: 'auth_required' }, { status: 401, headers });
  const token = bearer[1];
  const identity = await verify(token, projectId);
  if (!identity) return Response.json({ error: 'auth_invalid' }, { status: 401, headers });

  let fields: LobbyFields = {};
  if (request.method === 'PUT') {
    try {
      const raw = await request.text();
      if (raw.length > 2048) return Response.json({ error: 'invalid_payload' }, { status: 400, headers });
      fields = JSON.parse(raw) as LobbyFields;
    } catch {
      return Response.json({ error: 'invalid_payload' }, { status: 400, headers });
    }
    if (
      !fields ||
      fields.hostId !== `p_${identity.uid}` ||
      typeof fields.hostAlias !== 'string' ||
      !ALIAS.test(fields.hostAlias) ||
      typeof fields.tierId !== 'string' ||
      !CONFIG_ID.test(fields.tierId) ||
      typeof fields.modeId !== 'string' ||
      !CONFIG_ID.test(fields.modeId)
    ) {
      return Response.json({ error: 'invalid_payload' }, { status: 400, headers });
    }
  }

  const now = Date.now();
  const heartbeat = { integerValue: String(now) };
  const updated = { timestampValue: new Date(now).toISOString() };
  const document =
    request.method === 'PUT'
      ? {
          fields: {
            roomId: { stringValue: roomId },
            hostId: { stringValue: fields.hostId as string },
            hostOwnerUid: { stringValue: identity.uid },
            hostAlias: { stringValue: fields.hostAlias as string },
            tierId: { stringValue: fields.tierId as string },
            modeId: { stringValue: fields.modeId as string },
            status: { stringValue: 'waiting' },
            transport: { stringValue: 'ws' },
            hostHeartbeatAtMs: heartbeat,
            updatedAt: updated,
          },
        }
      : { fields: { hostHeartbeatAtMs: heartbeat, updatedAt: updated } };
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/duo_ws_rooms/${roomId}`;
  const url =
    request.method === 'PATCH'
      ? `${endpoint}?updateMask.fieldPaths=hostHeartbeatAtMs&updateMask.fieldPaths=updatedAt&currentDocument.exists=true`
      : endpoint;
  try {
    const upstream = await upstreamFetch(url, {
      method: request.method === 'DELETE' ? 'DELETE' : 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: request.method === 'DELETE' ? undefined : JSON.stringify(document),
    });
    // Firestore Security Rules can return 403 (instead of 404) when deleting
    // an already-absent document. Confirm absence before treating it as an
    // idempotent cleanup; an existing room owned by someone else stays denied.
    if (request.method === 'DELETE' && upstream.status === 403) {
      const existing = await upstreamFetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (existing.status === 404) return new Response(null, { status: 204, headers });
    }
    if (!upstream.ok && !(request.method === 'DELETE' && upstream.status === 404)) {
      console.error(
        JSON.stringify({ event: 'lobby_mutation_failed', method: request.method, status: upstream.status }),
      );
      return Response.json({ error: 'lobby_unavailable' }, { status: 502, headers });
    }
    return new Response(null, { status: 204, headers });
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'lobby_mutation_fetch_failed', method: request.method, error: String(error) }),
    );
    return Response.json({ error: 'lobby_unavailable' }, { status: 502, headers });
  }
}
