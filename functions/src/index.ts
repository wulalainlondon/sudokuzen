import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();
const db = admin.firestore();
const DUO_ROOMS = 'duo_rooms';
const DUO_STALE_HEARTBEAT_MS = 60_000;
const DUO_ROOM_WAITING_TTL_MS = 15 * 60_000;       // waiting 房間 15 分鐘後清理
const DUO_ROOM_FINISHED_RETENTION_MS = 6 * 60 * 60_000; // finished 房間 6 小時後刪除
const DUO_ROOM_COUNTDOWN_STALE_MS = 3 * 60_000;    // countdown 超過 3 分鐘視為卡死
const DUO_PLAYING_BOTH_OFFLINE_MS = 2 * 60_000;    // 雙方都離線超過 2 分鐘 → forfeit

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

// ── duoWatchdog ──────────────────────────────────────────────────────

export const duoWatchdog = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async (_context) => {
    const now = Date.now();
    const FieldValue = admin.firestore.FieldValue;

    const GUEST_CLEAR = {
      guestId: null,
      guestAlias: null,
      guestTitle: null,
      guestReady: false,
      guestProgress: 0,
      guestFinishTime: null,
      guestStars: null,
      guestDuoWins: null,
      guestHeartbeatAtMs: null,
      guestOnline: false,
    };

    // ── Task 1：重置卡死 countdown 房間 ─────────────────────────────
    try {
      const countdownStaleAt = new Date(now - DUO_ROOM_COUNTDOWN_STALE_MS);
      const snap = await db.collection(DUO_ROOMS)
        .where('status', '==', 'countdown')
        .where('countdownStartedAt', '<', countdownStaleAt)
        .get();

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: 'waiting',
          startAt: null,
          countdownStartedAt: null,
          hostReady: false,
          guestReady: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      if (!snap.empty) await batch.commit();
      console.log(`[watchdog] task1 reset ${snap.size} stale countdown room(s)`);
    } catch (e) {
      console.error('[watchdog] task1 failed:', e);
    }

    // ── Task 2：踢出心跳死亡的 guest（waiting 狀態）─────────────────
    try {
      const snap = await db.collection(DUO_ROOMS)
        .where('status', '==', 'waiting')
        .where('guestId', '!=', null)
        .get();

      const batch = db.batch();
      let count = 0;
      snap.docs.forEach((doc) => {
        const room = doc.data() as DuoRoomData;
        const hbMs = room.guestHeartbeatAtMs;
        if (hbMs && hbMs > 0 && now - hbMs > DUO_STALE_HEARTBEAT_MS) {
          batch.update(doc.ref, {
            ...GUEST_CLEAR,
            updatedAt: FieldValue.serverTimestamp(),
          });
          count++;
        }
      });
      if (count > 0) await batch.commit();
      console.log(`[watchdog] task2 kicked ${count} stale guest(s)`);
    } catch (e) {
      console.error('[watchdog] task2 failed:', e);
    }

    // ── Task 3：清理 waiting 房間 TTL ───────────────────────────────
    try {
      const waitingExpiredAt = new Date(now - DUO_ROOM_WAITING_TTL_MS);
      const snap = await db.collection(DUO_ROOMS)
        .where('status', '==', 'waiting')
        .where('updatedAt', '<', waitingExpiredAt)
        .limit(30)
        .get();

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: 'idle',
          ...GUEST_CLEAR,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      if (!snap.empty) await batch.commit();
      console.log(`[watchdog] task3 idled ${snap.size} expired waiting room(s)`);
    } catch (e) {
      console.error('[watchdog] task3 failed:', e);
    }

    // ── Task 4：刪除舊 finished 房間 ────────────────────────────────
    try {
      const finishedExpiredAt = new Date(now - DUO_ROOM_FINISHED_RETENTION_MS);
      const snap = await db.collection(DUO_ROOMS)
        .where('status', '==', 'finished')
        .where('updatedAt', '<', finishedExpiredAt)
        .limit(30)
        .get();

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      if (!snap.empty) await batch.commit();
      console.log(`[watchdog] task4 deleted ${snap.size} old finished room(s)`);
    } catch (e) {
      console.error('[watchdog] task4 failed:', e);
    }

    // ── Task 5：強制結束雙方都離線的 playing 房間 ───────────────────
    try {
      const snap = await db.collection(DUO_ROOMS)
        .where('status', '==', 'playing')
        .limit(20)
        .get();

      const batch = db.batch();
      let count = 0;
      snap.docs.forEach((doc) => {
        const room = doc.data() as DuoRoomData;
        const hostHb = room.hostHeartbeatAtMs;
        const guestHb = room.guestHeartbeatAtMs;
        const hostOffline = hostHb && hostHb > 0 && now - hostHb > DUO_PLAYING_BOTH_OFFLINE_MS;
        const guestOffline = guestHb && guestHb > 0 && now - guestHb > DUO_PLAYING_BOTH_OFFLINE_MS;

        if (hostOffline && guestOffline) {
          const update: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (room.hostFinishTime === null || room.hostFinishTime === undefined) {
            update.hostFinishTime = 9999;
            update.hostStars = 0;
          }
          if (room.guestFinishTime === null || room.guestFinishTime === undefined) {
            update.guestFinishTime = 9999;
            update.guestStars = 0;
          }
          batch.update(doc.ref, update);
          count++;
        }
      });
      if (count > 0) await batch.commit();
      console.log(`[watchdog] task5 force-finished ${count} both-offline playing room(s)`);
    } catch (e) {
      console.error('[watchdog] task5 failed:', e);
    }
  });

// ── duoToggleReady ────────────────────────────────────────────────────

interface ToggleReadyRequest {
  roomId: string;
}

export const duoToggleReady = functions.https.onCall(
  async (data: ToggleReadyRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
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
        throw new functions.https.HttpsError('permission-denied', 'Caller is not a participant of this room.');
      }

      const newReady = !(role === 'host' ? room.hostReady : room.guestReady);
      const update: Record<string, unknown> = {
        [`${role}Ready`]: newReady,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const hostReady = role === 'host' ? newReady : room.hostReady;
      const guestReady = role === 'guest' ? newReady : room.guestReady;
      if (hostReady && guestReady && room.guestId && room.status === 'waiting') {
        update.status = 'countdown';
        update.countdownStartedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      tx.update(roomRef, update);
    });

    return { success: true };
  }
);

// ── duoSetPlaying ─────────────────────────────────────────────────────

interface SetPlayingRequest {
  roomId: string;
}

export const duoSetPlaying = functions.https.onCall(
  async (data: SetPlayingRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
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
        throw new functions.https.HttpsError('permission-denied', 'Caller is not a participant of this room.');
      }

      if (room.status === 'playing') return;

      if (role === 'host') {
        tx.update(roomRef, {
          status: 'playing',
          hostProgress: 0,
          guestProgress: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(roomRef, {
          status: 'playing',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true };
  }
);

// ── duoAbortGame ──────────────────────────────────────────────────────

interface AbortGameRequest {
  roomId: string;
}

export const duoAbortGame = functions.https.onCall(
  async (data: AbortGameRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
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
      throw new functions.https.HttpsError('permission-denied', 'Caller is not a participant of this room.');
    }

    if (role === 'host') {
      await roomRef.update({
        status: 'waiting',
        startAt: null,
        countdownStartedAt: null,
        hostReady: false,
        guestReady: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await roomRef.update({
        guestReady: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { success: true };
  }
);

// ── duoLeaveRoom ──────────────────────────────────────────────────────

interface LeaveRoomRequest {
  roomId: string;
}

export const duoLeaveRoom = functions.https.onCall(
  async (data: LeaveRoomRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const { roomId } = data;
    if (!roomId) {
      throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');
    }
    const uid = context.auth.uid;
    const roomRef = db.collection(DUO_ROOMS).doc(roomId);

    const snap = await roomRef.get();
    if (!snap.exists) {
      return { success: true };
    }
    const room = snap.data() as DuoRoomData;

    let role: 'host' | 'guest' | null = null;
    if (uid === room.hostId) {
      role = 'host';
    } else if (uid === room.guestId) {
      role = 'guest';
    } else {
      return { success: true };
    }

    if (role === 'host') {
      await roomRef.update({
        status: 'idle',
        countdownStartedAt: null,
        startAt: null,
        hostReady: false,
        guestReady: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await roomRef.update({
        guestId: null,
        guestAlias: null,
        guestTitle: null,
        guestReady: false,
        guestProgress: 0,
        guestFinishTime: null,
        guestStars: null,
        guestDuoWins: null,
        guestHeartbeatAtMs: null,
        guestOnline: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { success: true };
  }
);

// ── duoCloseResult ────────────────────────────────────────────────────

interface CloseResultRequest {
  roomId: string;
}

export const duoCloseResult = functions.https.onCall(
  async (data: CloseResultRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const { roomId } = data;
    if (!roomId) {
      throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');
    }
    const uid = context.auth.uid;
    const roomRef = db.collection(DUO_ROOMS).doc(roomId);

    const snap = await roomRef.get();
    if (!snap.exists) {
      return { success: true };
    }
    const room = snap.data() as DuoRoomData;

    if (uid !== room.hostId && uid !== room.guestId) {
      return { success: true };
    }

    await roomRef.update({
      status: 'finished',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ── Billing Protection ───────────────────────────────────────────────
// Triggered by Pub/Sub budget alert → disables billing to stop all charges
export const stopBillingOnBudgetAlert = functions.pubsub
  .topic('billing-alerts')
  .onPublish(async (message) => {
    const data = message.json as { costAmount: number; budgetAmount: number };
    if (data.costAmount <= data.budgetAmount) return; // 未超預算，不動作

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-billing'] });
    const client = await auth.getClient();
    const projectId = process.env.GCLOUD_PROJECT!;

    const billingUrl = `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`;
    await client.request({
      url: billingUrl,
      method: 'PUT',
      data: { billingAccountName: '' }, // 空字串 = 停用計費
    });

    console.log(`[BillingProtection] 超過預算 $${data.budgetAmount}，已停用計費。`);
  });
