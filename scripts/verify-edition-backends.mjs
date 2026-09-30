import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
  terminate,
  setLogLevel,
} from 'firebase/firestore';

const require = createRequire(new URL('../duo-party/package.json', import.meta.url));
setLogLevel('silent');
const WebSocket = require('ws');
const config = (filename) => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox);
  return sandbox.window.SUDOKU_FIREBASE_CONFIG;
};
const editions = JSON.parse(fs.readFileSync('config/app-editions.json', 'utf8'));
const run = Date.now().toString(36);
const users = [];
const touched = [];
const sockets = [];
let assertions = 0;
async function denied(operation) {
  await assert.rejects(operation, (error) => error.code === 'permission-denied');
  assertions++;
}
async function player(edition, suffix) {
  const app = initializeApp(
    config(edition === 'ios' ? 'public/firebase-config.ios.js' : 'public/firebase-config.js'),
    `qa-${edition}-${suffix}-${run}`,
  );
  const auth = getAuth(app);
  const user = (await signInAnonymously(auth)).user;
  const client = { edition, app, user, uid: user.uid, token: await user.getIdToken(), db: getFirestore(app) };
  users.push(client);
  return client;
}
function path(client, relative) {
  return `editions/${client.edition}/${relative}`;
}
async function seed(client, relative, data) {
  const ref = doc(client.db, path(client, relative));
  await setDoc(ref, data);
  touched.push({ client, ref });
  return ref;
}
async function connect(edition, roomId) {
  const ws = new WebSocket(`wss://${editions[edition].duoHost}/parties/game-room/${roomId}`);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return (message) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off('message', listener);
        reject(new Error(`Worker timed out: ${edition}`));
      }, 15000);
      function listener(raw) {
        const value = JSON.parse(raw.toString());
        if (value.type !== 'error' && !(value.type === 'roomState' && value.you === 'host')) return;
        clearTimeout(timer);
        ws.off('message', listener);
        resolve(value);
      }
      ws.on('message', listener);
      ws.send(JSON.stringify(message));
    });
}
try {
  const pwa = await player('pwa', 'owner');
  const ios = await player('ios', 'owner');
  const stranger = await player('pwa', 'stranger');
  for (const client of [pwa, ios]) {
    const playerId = `p_${client.uid}`;
    const profile = await seed(client, `player_profiles/${playerId}`, {
      playerId,
      ownerUid: client.uid,
      alias: 'QA Tester',
      achievements: {},
      records: {},
    });
    await seed(client, `player_profiles/${playerId}/game_saves/sudoku_save_7`, {
      playerId,
      ownerUid: client.uid,
      key: 'sudoku_save_7',
      payload: { seconds: 12 },
    });
    await seed(client, `player_profiles/${playerId}/legacy_history/part_00000`, {
      playerId,
      ownerUid: client.uid,
      payload: '{"oldWins":7}',
    });
    assert.equal((await getDoc(profile)).exists(), true);
    assertions++;
    const wrongEdition = client.edition === 'pwa' ? 'ios' : 'pwa';
    await denied(() =>
      setDoc(doc(client.db, `editions/${wrongEdition}/player_profiles/${playerId}`), {
        playerId,
        ownerUid: client.uid,
        alias: 'QA Tester',
        achievements: {},
      }),
    );
    await denied(() => getDoc(doc(client.db, `editions/${wrongEdition}/player_profiles/${playerId}`)));
    await denied(() =>
      setDoc(doc(client.db, path(client, 'player_profiles/p_forged_owner')), {
        playerId: 'p_forged_owner',
        ownerUid: client.uid,
        alias: 'QA Tester',
        achievements: {},
      }),
    );
    const boardKey = `classic_7_${'0'.repeat(81)}`;
    const score = doc(client.db, path(client, `level_first_clears/${boardKey}/players/${playerId}`));
    const catalog = doc(client.db, path(client, `score_owners/${playerId}/entries/${boardKey}`));
    const row = {
      playerId,
      ownerUid: client.uid,
      alias: 'QA Tester',
      edition: client.edition,
      boardKey,
      mode: 'classic',
      firstTimeSec: 60,
      firstStars: 3,
      firstSubmissions: 0,
    };
    await denied(() => setDoc(score, row)); // Owner cleanup catalog is mandatory.
    const batch = writeBatch(client.db);
    batch.set(score, row);
    batch.set(catalog, { playerId, ownerUid: client.uid, boardKey });
    await batch.commit();
    touched.push({ client, ref: score }, { client, ref: catalog });
    assert.equal((await getDoc(score)).data().firstTimeSec, 60);
    assertions++;
    await denied(() => setDoc(score, { ...row, firstTimeSec: 20 }));
    // The multi-field index needed by speed leaderboards must really be ready.
    await getDocs(
      query(
        collection(client.db, path(client, `level_first_clears/speed_7_${'0'.repeat(81)}/players`)),
        orderBy('firstSubmissions'),
        orderBy('firstTimeSec'),
        limit(3),
      ),
    );
    assertions++;
  }
  const pwaProfile = `editions/pwa/player_profiles/p_${pwa.uid}`;
  await denied(() => getDoc(doc(stranger.db, pwaProfile)));
  await denied(() =>
    setDoc(doc(stranger.db, pwaProfile), {
      playerId: `p_${pwa.uid}`,
      ownerUid: stranger.uid,
      alias: 'Forged',
      achievements: {},
    }),
  );
  await denied(() => getDocs(collection(stranger.db, `${pwaProfile}/legacy_history`)));
  await denied(() => writeBatch(stranger.db).delete(doc(stranger.db, pwaProfile)).commit());
  // Foreign-project ID tokens are rejected even for the correct edition path.
  const foreign = await fetch(
    `https://firestore.googleapis.com/v1/projects/${editions.ios.projectId}/databases/(default)/documents/editions/ios/player_profiles/p_${ios.uid}`,
    { headers: { Authorization: `Bearer ${pwa.token}` } },
  );
  assert([401, 403].includes(foreign.status));
  assertions++;
  const roomId = `r_realmqa${run}`;
  for (const [client, foreignClient] of [
    [pwa, ios],
    [ios, pwa],
  ]) {
    const request = await connect(client.edition, roomId);
    const message = {
      type: 'create',
      player: { id: `p_${client.uid}`, alias: 'QA Tester', title: null, wins: 0 },
      room: { tierId: 'tier0', modeId: 'standard' },
      edition: client.edition,
      protocolVersion: 2,
    };
    const deniedToken = await request({ ...message, idToken: foreignClient.token });
    assert.equal(deniedToken.code, 'auth_invalid');
    assertions++;
    const deniedEdition = await request({ ...message, edition: foreignClient.edition, idToken: client.token });
    assert.equal(deniedEdition.code, 'edition_mismatch');
    assertions++;
    const created = await request({ ...message, idToken: client.token });
    assert.equal(created.state.edition, client.edition);
    assert.equal(created.you, 'host');
    assertions += 2;
  }
  // Lobby endpoints each read their edition collection, never legacy roots.
  for (const edition of ['pwa', 'ios']) {
    const lobby = await fetch(`https://${editions[edition].duoHost}/lobby?limit=5`);
    assert.equal(lobby.status, 200);
    assertions++;
  }
  fs.mkdirSync('output/edition-isolation', { recursive: true });
  fs.writeFileSync(
    'output/edition-isolation/backend-verification.json',
    JSON.stringify({ pass: true, assertions, checkedAt: new Date().toISOString(), editions }, null, 2),
  );
  console.log(
    JSON.stringify({ pass: true, assertions, checkedProjects: Object.values(editions).map((e) => e.projectId) }),
  );
} finally {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
    socket.close();
  }
  for (const client of users) {
    const batch = writeBatch(client.db);
    for (const item of touched.filter((item) => item.client === client)) batch.delete(item.ref);
    try {
      await batch.commit();
    } finally {
      await deleteUser(client.user);
      await terminate(client.db);
      await deleteApp(client.app);
    }
  }
}
