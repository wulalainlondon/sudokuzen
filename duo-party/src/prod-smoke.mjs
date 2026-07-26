import WebSocket from 'ws';

const HOSTING_CONFIG_URL = 'https://sudokuzen-f2aa3.web.app/firebase-config.js';
const WS_HOST = 'wss://duo-party.wulalainlondon.workers.dev';
const PARTY = 'game-room';

function configValue(source, key) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Firebase config is missing ${key}`);
  return match[1];
}

async function anonymousSession(apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Anonymous sign-in failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body.idToken || !body.localId) throw new Error('Anonymous sign-in returned incomplete credentials');
  return { idToken: body.idToken, localId: body.localId };
}

async function deleteAnonymousSession(apiKey, idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) throw new Error(`Anonymous account cleanup failed: HTTP ${response.status}`);
}

class Client {
  constructor(roomId, label) {
    this.label = label;
    this.messages = [];
    this.waiters = [];
    this.socket = new WebSocket(`${WS_HOST}/parties/${PARTY}/${roomId}`);
    this.socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.messages.push(message);
      this.waiters = this.waiters.filter((waiter) => {
        if (!waiter.predicate(message)) return true;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return false;
      });
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate, timeoutMs = 12_000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          const summary = this.messages
            .slice(-6)
            .map(
              (message) =>
                `${message.type}${message.code ? `:${message.code}` : ''}` +
                `${message.state?.status ? `:${message.state.status}` : ''}` +
                `${message.state?.host?.finishTime != null ? `:hostDone=${message.state.host.finishTime}` : ''}` +
                `${message.state?.guest?.finishTime != null ? `:guestDone=${message.state.guest.finishTime}` : ''}`,
            )
            .join(',');
          reject(new Error(`${this.label} timed out waiting for server state; received=${summary || 'none'}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  close() {
    this.socket.terminate();
  }
}

async function main() {
  const configUrl = `${HOSTING_CONFIG_URL}?smoke=${Date.now()}`;
  const configSource = await fetch(configUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Firebase config unavailable: HTTP ${response.status}`);
    return response.text();
  });
  const apiKey = configValue(configSource, 'apiKey');
  const projectId = configValue(configSource, 'projectId');
  if (projectId !== 'sudokuzen-f2aa3') throw new Error(`Unexpected Firebase project: ${projectId}`);

  const sessions = [];
  const clients = [];
  try {
    sessions.push(await anonymousSession(apiKey), await anonymousSession(apiKey));
    const roomId = `prod-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const host = new Client(roomId, 'host');
    clients.push(host);
    await host.open();
    host.send({
      type: 'create',
      room: { tierId: 'tierI', modeId: 'standard' },
      player: { id: sessions[0].localId, alias: 'Player A', title: null, wins: 0 },
      idToken: sessions[0].idToken,
    });
    await host.waitFor((message) => message.type === 'roomState' && message.you === 'host');
    console.log('production_duo_smoke_stage=HOST_CREATED');

    const guest = new Client(roomId, 'guest');
    clients.push(guest);
    await guest.open();
    guest.send({
      type: 'join',
      player: { id: sessions[1].localId, alias: 'Player B', title: null, wins: 0 },
      idToken: sessions[1].idToken,
    });
    await guest.waitFor((message) => message.type === 'roomState' && message.you === 'guest');
    console.log('production_duo_smoke_stage=GUEST_JOINED');

    host.send({ type: 'ready', ready: true });
    guest.send({ type: 'ready', ready: true });
    await host.waitFor(
      (message) => message.type === 'roomState' && message.state?.status === 'playing',
      15_000,
    );
    console.log('production_duo_smoke_stage=PLAYING');

    host.send({ type: 'progress', filled: 81 });
    guest.send({ type: 'progress', filled: 81 });
    host.send({ type: 'finish', timeSec: 60, stars: 3, moves: [] });
    await host.waitFor(
      (message) =>
        message.type === 'roomState' &&
        message.state?.status === 'playing' &&
        message.state?.host?.finishTime != null,
      8_000,
    );
    host.send({ type: 'closeResult' });
    await host.waitFor(
      (message) => message.type === 'roomState' && message.state?.status === 'finished',
      8_000,
    );
    console.log('production_duo_smoke=PASS auth=create/join lifecycle=playing/host-finish/finished');
  } finally {
    clients.forEach((client) => client.close());
    const cleanupResults = await Promise.allSettled(
      sessions.map((session) => deleteAnonymousSession(apiKey, session.idToken)),
    );
    const failedCleanups = cleanupResults.filter((result) => result.status === 'rejected');
    if (failedCleanups.length > 0) {
      throw new Error(`Anonymous account cleanup failed for ${failedCleanups.length} session(s)`);
    }
  }
}

main().catch((error) => {
  console.error(`production_duo_smoke=FAIL ${error.message}`);
  process.exitCode = 1;
});
