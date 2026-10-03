// Regression QA for round exits and authoritative forfeiture reasons.
// Run against a local Worker with AUTH_REQUIRED:false and FORFEIT_GRACE_MS:1500.
// npm run qa:phase3 includes this suite after the existing lifecycle tests.

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8798';
const PARTY = 'game-room';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(roomId, label) {
    this.label = label;
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`${HOST}/parties/${PARTY}/${roomId}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
  }
  open() {
    return new Promise((res, rej) => {
      this.ws.on('open', res);
      this.ws.on('error', rej);
    });
  }
  send(obj) {
    if (process.env.QA_EDITION && ['create', 'join', 'hello'].includes(obj.type)) {
      obj = { ...obj, edition: process.env.QA_EDITION, protocolVersion: 2 };
    }
    this.ws.send(JSON.stringify(obj));
  }
  waitFor(pred, ms = 8000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label} 等待超時`)), ms);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  latest() {
    return [...this.msgs].reverse().find((m) => m.type === 'roomState')?.state ?? null;
  }
  close() {
    this.ws.close();
  }
}

const report = [];
async function setup(label) {
  const room = 'investigation-' + label + '-' + Date.now();
  const host = new Client(room, 'host'),
    guest = new Client(room, 'guest');
  await Promise.all([host.open(), guest.open()]);
  host.send({
    type: 'create',
    room: { tierId: 'tier0', modeId: 'standard' },
    player: { id: 'h', alias: 'QA Steven', wins: 0 },
  });
  await host.waitFor((m) => m.type === 'roomState' && m.you === 'host');
  guest.send({ type: 'join', player: { id: 'g', alias: 'QA mm', wins: 0 } });
  await guest.waitFor((m) => m.type === 'roomState' && m.you === 'guest');
  const fingerprint = 'p81:' + Array(81).fill(1).join('');
  host.send({ type: 'ready', ready: true, puzzleFingerprint: fingerprint });
  guest.send({ type: 'ready', ready: true, puzzleFingerprint: fingerprint });
  await host.waitFor((m) => m.type === 'roomState' && m.state.status === 'playing');
  return { room, host, guest };
}

import assert from 'node:assert/strict';
const clients = [];
try {
  for (const role of ['host', 'guest']) {
    // Accepted finisher can leave; solver remains in the same playing round.
    const a = await setup('finished-' + role);
    clients.push(a.host, a.guest);
    const winner = a[role],
      loser = a[role === 'host' ? 'guest' : 'host'];
    winner.send({ type: 'finish', timeSec: 120, stars: 3 });
    await loser.waitFor((m) => m.type === 'roomState' && m.state[role]?.finishTime === 120);
    winner.send({ type: 'closeResult' });
    await winner.waitFor((m) => m.type === 'error' && m.code === 'bad_state');
    assert.equal(loser.latest().status, 'playing');
    winner.send({ type: 'leave' });
    await sleep(2300);
    assert.equal(loser.latest().status, 'playing');
    assert.equal(loser.latest()[role].finishTime, 120);
    assert.equal(loser.latest()[role === 'host' ? 'guest' : 'host'].finishTime, null);
    loser.send({ type: 'finish', timeSec: 180, stars: 3 });
    await loser.waitFor((m) => m.type === 'roomState' && m.state.status === 'finished');
    assert.equal(loser.latest()[role].finishTime, 120);
    assert.equal(loser.latest()[role === 'host' ? 'guest' : 'host'].finishTime, 180);
    loser.send({ type: 'closeResult' });
    loser.send({ type: 'ping' });
    await sleep(100);
    assert.equal(loser.latest().status, 'finished');
    report.push({ scenario: role + ' finished then closes/leaves', passed: true });
    loser.close();
    // Unfinished departure marks only its own attempt, retaining both seats.
    const b = await setup('unfinished-' + role);
    clients.push(b.host, b.guest);
    b[role].send({ type: 'leave' });
    const opponent = b[role === 'host' ? 'guest' : 'host'];
    await opponent.waitFor((m) => m.type === 'roomState' && m.state[role]?.endReason === 'left');
    assert.equal(opponent.latest().status, 'playing');
    assert.equal(opponent.latest()[role].finishTime, 9999);
    assert.equal(opponent.latest()[role === 'host' ? 'guest' : 'host'].finishTime, null);
    opponent.send({ type: 'finish', timeSec: 180, stars: 3 });
    await opponent.waitFor((m) => m.type === 'roomState' && m.state.status === 'finished');
    assert.equal(opponent.latest()[role].endReason, 'left');
    opponent.send({ type: 'rematch' });
    await opponent.waitFor(
      (m) => m.type === 'roomState' && m.state.status === 'waiting' && m.state[role]?.endReason === null,
    );
    for (const seat of ['host', 'guest']) {
      assert.equal(opponent.latest()[seat].finishTime, null);
      assert.equal(opponent.latest()[seat].endReason, null);
    }
    opponent.send({ type: 'closeResult' });
    await opponent.waitFor((m) => m.type === 'error' && m.code === 'bad_state');
    assert.equal(opponent.latest().status, 'waiting');
    report.push({ scenario: role + ' unfinished leaves; rematch retains seats and clears reasons', passed: true });
    opponent.close();
  }
  const s = await setup('surrender-reason');
  clients.push(s.host, s.guest);
  s.host.send({ type: 'finish', timeSec: 120, stars: 3 });
  s.guest.send({ type: 'surrender' });
  await s.host.waitFor((m) => m.type === 'roomState' && m.state.status === 'finished');
  assert.equal(s.host.latest().guest.endReason, 'surrender');
  s.host.close();
  s.guest.close();
  const d = await setup('disconnect-reason');
  clients.push(d.host, d.guest);
  d.host.send({ type: 'finish', timeSec: 120, stars: 3 });
  await d.guest.waitFor((m) => m.type === 'roomState' && m.state.host.finishTime === 120);
  d.guest.close();
  await d.host.waitFor((m) => m.type === 'roomState' && m.state.guest?.endReason === 'disconnect');
  assert.equal(d.host.latest().host.finishTime, 120);
  assert.equal(d.host.latest().guest.finishTime, 9999);
  d.host.close();
  report.push({ scenario: 'explicit surrender and disconnect have distinct authoritative reasons', passed: true });
  console.log(JSON.stringify(report));
} finally {
  for (const client of clients) client.close();
}
