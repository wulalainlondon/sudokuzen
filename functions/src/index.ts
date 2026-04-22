import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();
const db = admin.firestore();
const DUO_ROOMS = 'duo_rooms';
const DUO_STALE_HEARTBEAT_MS = 60_000;

// ── Types ────────────────────────────────────────────────────────────

interface DuoRoomData {
  status: 'idle' | 'waiting' | 'countdown' | 'playing' | 'finished';
  hostId: string;
  hostAlias: string;
  hostReady: boolean;
  hostProgress: number;
  hostFinishTime: number | null;
  hostStars: number | null;
  guestId: string | null;
  guestAlias: string | null;
  guestReady: boolean;
  guestProgress: number;
  guestFinishTime: number | null;
  guestStars: number | null;
  hostHeartbeatAtMs: number | null;
  guestHeartbeatAtMs: number | null;
  hostOnline: boolean | null;
  guestOnline: boolean | null;
  countdownStartedAt: admin.firestore.Timestamp | null;
  startAt: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp | null;
}

// ── duoSubmitFinish ──────────────────────────────────────────────────

interface SubmitFinishRequest {
  roomId: string;
  timeSec: number;
  stars: number;
  progress: number;
}

export const duoSubmitFinish = functions.https.onCall(
  async (data: SubmitFinishRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to submit finish.'
      );
    }

    const { roomId, timeSec, stars, progress } = data;
    if (!roomId || typeof timeSec !== 'number' || typeof stars !== 'number' || typeof progress !== 'number') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'roomId, timeSec, stars, and progress are required.'
      );
    }

    const uid = context.auth.uid;
    const roomRef = db.collection(DUO_ROOMS).doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Room not found.');
      }

      const room = snap.data() as DuoRoomData;

      if (room.status !== 'playing') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Room is not in playing state (current: ${room.status}).`
        );
      }

      let role: 'host' | 'guest';
      if (uid === room.hostId) {
        role = 'host';
      } else if (uid === room.guestId) {
        role = 'guest';
      } else {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Caller is not a participant of this room.'
        );
      }

      const finishTimeField = role === 'host' ? 'hostFinishTime' : 'guestFinishTime';
      const currentFinishTime = role === 'host' ? room.hostFinishTime : room.guestFinishTime;

      if (currentFinishTime !== null && currentFinishTime !== undefined) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Finish already submitted for this player.'
        );
      }

      const starsField = role === 'host' ? 'hostStars' : 'guestStars';
      const progressField = role === 'host' ? 'hostProgress' : 'guestProgress';

      tx.update(roomRef, {
        [finishTimeField]: timeSec,
        [starsField]: stars,
        [progressField]: progress,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);

// ── duoAutoForfeitOpponent ───────────────────────────────────────────

interface AutoForfeitRequest {
  roomId: string;
}

export const duoAutoForfeitOpponent = functions.https.onCall(
  async (data: AutoForfeitRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to forfeit opponent.'
      );
    }

    const { roomId } = data;
    if (!roomId) {
      throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');
    }

    const uid = context.auth.uid;
    const roomRef = db.collection(DUO_ROOMS).doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Room not found.');
      }

      const room = snap.data() as DuoRoomData;

      let role: 'host' | 'guest';
      if (uid === room.hostId) {
        role = 'host';
      } else if (uid === room.guestId) {
        role = 'guest';
      } else {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Caller is not a participant of this room.'
        );
      }

      const myFinishTime = role === 'host' ? room.hostFinishTime : room.guestFinishTime;
      const opponentFinishTime = role === 'host' ? room.guestFinishTime : room.hostFinishTime;
      const opponentHeartbeatAtMs = role === 'host' ? room.guestHeartbeatAtMs : room.hostHeartbeatAtMs;

      // Condition 1: caller must have already finished
      if (myFinishTime === null || myFinishTime === undefined) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Caller has not finished yet.'
        );
      }

      // Condition 2: opponent must not have been forfeited yet (idempotency guard)
      if (opponentFinishTime !== null && opponentFinishTime !== undefined) {
        // Already handled — return silently (idempotent)
        return;
      }

      // Condition 3: server-side stale heartbeat check
      const now = Date.now();
      const heartbeatMs = opponentHeartbeatAtMs !== null && opponentHeartbeatAtMs !== undefined
        ? Number(opponentHeartbeatAtMs)
        : 0;
      const isStale = heartbeatMs > 0 && now - heartbeatMs > DUO_STALE_HEARTBEAT_MS;

      if (!isStale) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Opponent heartbeat is still fresh; cannot forfeit.'
        );
      }

      const opponentFinishTimeField = role === 'host' ? 'guestFinishTime' : 'hostFinishTime';
      const opponentStarsField = role === 'host' ? 'guestStars' : 'hostStars';

      tx.update(roomRef, {
        [opponentFinishTimeField]: 9999,
        [opponentStarsField]: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);

// ── duoSurrender ─────────────────────────────────────────────────────

interface SurrenderRequest {
  roomId: string;
}

export const duoSurrender = functions.https.onCall(
  async (data: SurrenderRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to surrender.'
      );
    }

    const { roomId } = data;
    if (!roomId) {
      throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');
    }

    const uid = context.auth.uid;
    const roomRef = db.collection(DUO_ROOMS).doc(roomId);

    const snap = await roomRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }

    const room = snap.data() as DuoRoomData;

    let role: 'host' | 'guest';
    if (uid === room.hostId) {
      role = 'host';
    } else if (uid === room.guestId) {
      role = 'guest';
    } else {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Caller is not a participant of this room.'
      );
    }

    const finishTimeField = role === 'host' ? 'hostFinishTime' : 'guestFinishTime';
    const currentFinishTime = role === 'host' ? room.hostFinishTime : room.guestFinishTime;

    if (currentFinishTime !== null && currentFinishTime !== undefined) {
      throw new functions.https.HttpsError(
        'already-exists',
        'Caller has already submitted a finish time.'
      );
    }

    const starsField = role === 'host' ? 'hostStars' : 'guestStars';

    await roomRef.update({
      [finishTimeField]: 9999,
      [starsField]: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
