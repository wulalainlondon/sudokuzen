import * as functions from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

// ── Billing Protection ───────────────────────────────────────────────
// Triggered by Pub/Sub budget alert → disables billing to stop all charges
export const stopBillingOnBudgetAlert = functions.pubsub.topic('billing-alerts').onPublish(async (message) => {
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

export const deletePlayerData = functions.https.onCall(async (data: unknown, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  const playerId =
    data && typeof data === 'object' && typeof (data as { playerId?: unknown }).playerId === 'string'
      ? (data as { playerId: string }).playerId
      : '';
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const legacyPlayerId = typeof payload.legacyPlayerId === 'string' ? payload.legacyPlayerId : '';
  const alias = typeof payload.alias === 'string' ? payload.alias.trim() : '';
  if (!/^p_[a-z0-9_]{8,64}$/i.test(playerId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid player ID.');
  }

  const db = getFirestore();

  if (legacyPlayerId && /^p_[a-z0-9_]{8,64}$/i.test(legacyPlayerId) && legacyPlayerId !== playerId && alias) {
    const legacyRef = db.collection('player_profiles').doc(legacyPlayerId);
    const legacy = await legacyRef.get();
    const legacyData = legacy.data();
    if (legacy.exists && !legacyData?.ownerUid && legacyData?.alias === alias) {
      const legacyLevelIds = Object.keys(
        legacyData?.records && typeof legacyData.records === 'object' ? legacyData.records : {},
      ).filter((id) => /^\d+$/.test(id));
      await db.recursiveDelete(legacyRef);
      const writer = db.bulkWriter();
      writer.delete(db.collection('presence').doc(legacyPlayerId));
      legacyLevelIds.forEach((levelId) =>
        writer.delete(db.collection('level_first_clears').doc(levelId).collection('players').doc(legacyPlayerId)),
      );
      const aliasKey = alias.toLowerCase();
      if (aliasKey) {
        const aliasRef = db.collection('alias_player_index').doc(aliasKey);
        const aliasDoc = await aliasRef.get();
        if (aliasDoc.data()?.playerId === legacyPlayerId) writer.delete(aliasRef);
      }
      await writer.close();

      const legacyRooms = await db.collection('duo_ws_rooms').where('hostId', '==', legacyPlayerId).get();
      const roomWriter = db.bulkWriter();
      legacyRooms.docs.forEach((doc) => roomWriter.delete(doc.ref));
      await roomWriter.close();
    }
  }

  const profileRef = db.collection('player_profiles').doc(playerId);
  const profile = await profileRef.get();
  if (profile.exists && profile.data()?.ownerUid !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'This profile belongs to another account.');
  }

  if (profile.exists) await db.recursiveDelete(profileRef);

  const ownedQueries = [
    db.collection('presence').where('ownerUid', '==', context.auth.uid),
    db.collection('duo_ws_rooms').where('hostOwnerUid', '==', context.auth.uid),
    db.collectionGroup('players').where('ownerUid', '==', context.auth.uid),
  ];
  for (const query of ownedQueries) {
    const snapshot = await query.get();
    const writer = db.bulkWriter();
    snapshot.docs.forEach((doc) => writer.delete(doc.ref));
    await writer.close();
  }

  await getAuth().deleteUser(context.auth.uid);
  return { ok: true };
});
