import assert from 'node:assert/strict';
import WebSocket from 'ws';

const endpoints = { pwa: process.argv[2] || 'ws://localhost:8795', ios: process.argv[3] || 'ws://localhost:8796' };
const room = `r_editionqa${Date.now().toString(36)}`;
const sockets = [];
async function connect(edition) {
  const ws = new WebSocket(`${endpoints[edition]}/parties/game-room/${room}`);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    request(message, predicate) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', onMessage);
          reject(new Error(`Timeout: ${edition} ${message.type}`));
        }, 9000);
        function onMessage(raw) {
          const result = JSON.parse(raw.toString());
          if (!predicate(result)) return;
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(result);
        }
        ws.on('message', onMessage);
        ws.send(JSON.stringify(message));
      });
    },
  };
}
const player = (edition, role) => ({ id: `${edition}-${role}`, alias: `${edition} ${role}`, title: null, wins: 0 });
const envelope = (edition) => ({ edition, protocolVersion: 2 });
let assertions = 0;
try {
  const hosts = {};
  for (const edition of ['pwa', 'ios']) {
    const host = await connect(edition);
    hosts[edition] = host;
    for (const metadata of [
      {},
      { edition: edition === 'pwa' ? 'ios' : 'pwa', protocolVersion: 2 },
      { edition, protocolVersion: 1 },
    ]) {
      const result = await host.request(
        { type: 'create', room: { tierId: 'tier0', modeId: 'standard' }, player: player(edition, 'host'), ...metadata },
        (m) => m.type === 'error',
      );
      assert.equal(result.code, 'edition_mismatch');
      assertions++;
    }
    const result = await host.request(
      {
        type: 'create',
        room: { tierId: 'tier0', modeId: 'standard' },
        player: player(edition, 'host'),
        ...envelope(edition),
      },
      (m) => m.type === 'roomState' && m.you === 'host',
    );
    assert.equal(result.state.edition, edition);
    assert.equal(result.state.protocolVersion, 2);
    assertions += 2;
  }
  // The identical room ID exists independently in both Durable Object namespaces.
  for (const edition of ['pwa', 'ios']) {
    const guest = await connect(edition);
    const other = edition === 'pwa' ? 'ios' : 'pwa';
    for (const type of ['join', 'hello']) {
      const denied = await guest.request(
        { type, player: player(other, 'guest'), role: 'guest', ...envelope(other) },
        (m) => m.type === 'error',
      );
      assert.equal(denied.code, 'edition_mismatch');
      assertions++;
    }
    const joined = await guest.request(
      { type: 'join', player: player(edition, 'guest'), ...envelope(edition) },
      (m) => m.type === 'roomState' && m.you === 'guest',
    );
    assert.equal(joined.state.host.alias, `${edition} host`);
    assert.equal(joined.state.guest.alias, `${edition} guest`);
    assertions += 2;
    await hosts[edition].request(
      { type: 'ready', ready: true, puzzleFingerprint: `p81:${'0'.repeat(81)}` },
      (m) => m.type === 'roomState' && m.state.host.ready,
    );
    await guest.request(
      { type: 'ready', ready: true, puzzleFingerprint: `p81:${'0'.repeat(81)}` },
      (m) => m.type === 'roomState' && m.state.status === 'playing',
    );
    await hosts[edition].request(
      { type: 'finish', timeSec: 30, stars: 3 },
      (m) => m.type === 'roomState' && m.state.host.finishTime === 30,
    );
    const finished = await guest.request(
      { type: 'finish', timeSec: 42, stars: 2 },
      (m) => m.type === 'roomState' && m.state.status === 'finished',
    );
    assert.equal(finished.state.edition, edition);
    assert.equal(finished.state.host.finishTime, 30);
    assert.equal(finished.state.guest.finishTime, 42);
    assertions += 3;
  }
  console.log(JSON.stringify({ pass: true, assertions, sameRoomIdInSeparateNamespaces: true }));
} finally {
  for (const ws of sockets) ws.close();
}
