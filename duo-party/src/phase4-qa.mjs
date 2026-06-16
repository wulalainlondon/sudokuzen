// Phase 4 QA edge-case tests (independent QA, not part of standard suite).
import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8798';
const PARTY = 'game-room';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra != null && !cond ? `  -> ${extra}` : ''}`);
  cond ? passed++ : failed++;
}

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
    this.ws.send(JSON.stringify(obj));
  }
  waitFor(pred, ms = 8000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label} timeout`)), ms);
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

const HOST_P = { id: 'h1', alias: 'Host', title: null, wins: 5 };
const GUEST_P = { id: 'g1', alias: 'Guest', title: null, wins: 2 };
const rid = () => 'qa4-' + Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playTo() {
  const roomId = rid();
  const host = new Client(roomId, 'host');
  await host.open();
  host.send({ type: 'create', room: { tierId: 'tierI', modeId: 'standard' }, player: HOST_P });
  await host.waitFor((m) => m.type === 'roomState' && m.you === 'host');
  const guest = new Client(roomId, 'guest');
  await guest.open();
  guest.send({ type: 'join', player: GUEST_P });
  await guest.waitFor((m) => m.type === 'roomState' && m.you === 'guest');
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  await host.waitFor((m) => m.type === 'roomState' && m.state.status === 'playing', 9000);
  return { host, guest, roomId };
}

async function main() {
  console.log(`\nPhase 4 QA edge-case tests @ ${HOST}\n`);

  // ── Item 2: moves over-cap + dirty data ──
  {
    const { host, guest } = await playTo();
    const moves = [];
    for (let i = 0; i < 2500; i++) moves.push({ t: i, cell: i % 81, val: (i % 9) + 1, ok: i % 2 === 0 });
    host.send({ type: 'finish', timeSec: 80, stars: 2, moves });
    const hf = await guest.waitFor((m) => m.type === 'roomState' && m.state.host?.moves != null);
    check('moves over-cap: truncated to 2000', hf.state.host.moves.length === 2000, hf.state.host.moves.length);

    // dirty data: out-of-range cell/val/negatives/strings
    guest.send({
      type: 'surrender',
      moves: [
        { t: -50, cell: 999, val: 99, ok: 'yes' },
        { t: 'x', cell: -5, val: -3, ok: 0 },
        { t: 10.9, cell: 80.7, val: 9.9, ok: true },
      ],
    });
    const gsnap = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.moves != null);
    const gm = gsnap.state.guest.moves;
    check('dirty cell clamped 0-80', gm[0].cell === 80 && gm[1].cell === 0, JSON.stringify(gm));
    check('dirty val clamped 0-9', gm[0].val === 9 && gm[1].val === 0, JSON.stringify(gm));
    check('dirty t floored>=0', gm[0].t === 0 && gm[1].t === 0 && gm[2].t === 10, JSON.stringify(gm));
    check('dirty ok coerced to bool', gm[0].ok === true && gm[1].ok === false, JSON.stringify(gm));
    check('floored cell 80.7->80, val 9.9->9', gm[2].cell === 80 && gm[2].val === 9, JSON.stringify(gm));
    host.close();
    guest.close();
  }

  // ── Item 6: finish then overwrite prevention ──
  {
    const { host, guest } = await playTo();
    host.send({ type: 'finish', timeSec: 50, stars: 3, moves: [{ t: 1, cell: 1, val: 1, ok: true }] });
    await guest.waitFor((m) => m.type === 'roomState' && m.state.host?.finishTime != null);
    // second finish attempt with different data
    host.send({ type: 'finish', timeSec: 999, stars: 0, moves: [{ t: 2, cell: 2, val: 2, ok: false }] });
    await sleep(200);
    const s = host.latest();
    check('double-finish ignored (time stays 50)', s.host.finishTime === 50, s.host.finishTime);
    check('double-finish ignored (stars stays 3)', s.host.stars === 3, s.host.stars);
    check('double-finish ignored (moves stays cell=1)', s.host.moves.length === 1 && s.host.moves[0].cell === 1, JSON.stringify(s.host.moves));
    // surrender after finish also ignored
    host.send({ type: 'surrender', moves: [{ t: 3, cell: 3, val: 3, ok: true }] });
    await sleep(200);
    check('surrender after finish ignored', host.latest().host.finishTime === 50, host.latest().host.finishTime);
    host.close();
    guest.close();
  }

  // ── Item 3: double bomb same-millisecond dedup risk ──
  {
    const { host, guest } = await playTo();
    guest.send({ type: 'bomb', cells: [1, 2] });
    guest.send({ type: 'bomb', cells: [3, 4] });
    // collect two distinct specBombAt? They may share Date.now() in same DO turn.
    await sleep(300);
    // gather all roomState specBombAt values host saw, in order
    const bombStates = host.msgs.filter((m) => m.type === 'roomState' && m.state.specBombAt != null).map((m) => m.state.specBombAt);
    const distinct = [...new Set(bombStates)];
    const lastCells = host.latest().specBombCells;
    check('second bomb applied (cells=[3,4])', JSON.stringify(lastCells) === '[3,4]', JSON.stringify(lastCells));
    check('two bombs produced distinct specBombAt timestamps', distinct.length >= 2, `distinct=${JSON.stringify(distinct)}`);
    host.close();
    guest.close();
  }

  // ── Item 6: non-playing state rejection ──
  {
    const roomId = rid();
    const host = new Client(roomId, 'host');
    await host.open();
    host.send({ type: 'create', room: { tierId: 'tierI', modeId: 'standard' }, player: HOST_P });
    await host.waitFor((m) => m.type === 'roomState' && m.you === 'host');
    // status = waiting. Try cc/specBoard/bomb.
    host.send({ type: 'cc', update: { ccActiveTurn: 'host', ccBoardVersion: 5 } });
    host.send({ type: 'specBoard', board: '[0,0,0]', version: 3 });
    host.send({ type: 'bomb', cells: [1, 2] });
    await sleep(250);
    const s = host.latest();
    check('cc ignored while waiting (cc null)', s.cc === null, JSON.stringify(s.cc));
    check('specBoard ignored while waiting', s.specBoardVersion === null, s.specBoardVersion);
    check('bomb ignored while waiting', s.specBombAt === null, s.specBombAt);
    host.close();
  }

  // ── Item 4: cc field-validation edge cases ──
  {
    const { host, guest } = await playTo();
    // init
    host.send({ type: 'cc', update: { ccActiveTurn: 'host', ccBoardState: '[1]', ccBoardVersion: 1, ccHostAccumMs: 100 } });
    await guest.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccBoardVersion === 1);
    // send invalid types: should NOT overwrite valid existing values
    host.send({
      type: 'cc',
      update: {
        ccActiveTurn: 'sideways', // invalid enum
        ccHostAccumMs: 'lots', // invalid type
        ccBoardState: 12345, // invalid type
        ccBoardVersion: 2, // valid, used as sync marker
      },
    });
    const cc = await guest.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccBoardVersion === 2);
    check('invalid ccActiveTurn rejected (stays host)', cc.state.cc.ccActiveTurn === 'host', cc.state.cc.ccActiveTurn);
    check('invalid ccHostAccumMs rejected (stays 100)', cc.state.cc.ccHostAccumMs === 100, cc.state.cc.ccHostAccumMs);
    check('invalid ccBoardState rejected (stays [1])', cc.state.cc.ccBoardState === '[1]', cc.state.cc.ccBoardState);

    // null is a legal value for nullable fields
    host.send({ type: 'cc', update: { ccActiveTurn: null, ccCurrentCellIdx: null, ccHostTotalMs: null, ccBoardVersion: 3 } });
    const cc2 = await guest.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccBoardVersion === 3);
    check('null ccActiveTurn accepted', cc2.state.cc.ccActiveTurn === null, cc2.state.cc.ccActiveTurn);
    host.close();
    guest.close();
  }

  // ── Item 4: cc uninitialized merge does not throw ──
  {
    const { host, guest } = await playTo();
    // very first cc is a partial update (no full init) -> server builds default then merges
    host.send({ type: 'cc', update: { ccHostAccumMs: 777 } });
    const cc = await guest.waitFor((m) => m.type === 'roomState' && m.state.cc != null);
    check('partial-first cc builds default + merges', cc.state.cc.ccHostAccumMs === 777 && cc.state.cc.ccBoardVersion === 0, JSON.stringify(cc.state.cc));
    host.close();
    guest.close();
  }

  // ── Item 3: specBoard length guard ──
  {
    const { host, guest } = await playTo();
    const tooLong = '[' + '1,'.repeat(1100) + '1]'; // > 2000 chars
    host.send({ type: 'specBoard', board: tooLong, version: 9 });
    await sleep(200);
    check('over-2000-char specBoard rejected', host.latest().specBoardVersion === null, host.latest().specBoardVersion);
    // valid board still works after
    host.send({ type: 'specBoard', board: '[0,0,1]', version: 10 });
    const s = await guest.waitFor((m) => m.type === 'roomState' && m.state.specBoardVersion === 10);
    check('valid specBoard after rejection works', s.state.specBoardState === '[0,0,1]', s.state.specBoardState);
    host.close();
    guest.close();
  }

  // ── Item 5: state bloat — moves carried in every broadcast ──
  {
    const { host, guest } = await playTo();
    const moves = [];
    for (let i = 0; i < 2000; i++) moves.push({ t: i, cell: i % 81, val: (i % 9) + 1, ok: true });
    host.send({ type: 'finish', timeSec: 80, stars: 2, moves });
    await guest.waitFor((m) => m.type === 'roomState' && m.state.host?.moves != null);
    // guest still playing, host finished. Now guest sends specBoard (being watched).
    guest.send({ type: 'specBoard', board: JSON.stringify(Array(81).fill(0)), version: 1 });
    const sb = await host.waitFor((m) => m.type === 'roomState' && m.state.specBoardVersion === 1);
    const sizeBytes = JSON.stringify(sb).length;
    check('post-finish broadcast still carries host.moves (bloat present)', sb.state.host.moves.length === 2000, sb.state.host.moves.length);
    console.log(`     [info] single broadcast size with 2000 moves: ~${(sizeBytes / 1024).toFixed(1)} KB`);
    host.close();
    guest.close();
  }

  console.log(`\nResult: ${passed} passed / ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('test error:', e.message);
  process.exit(1);
});
