// Phase 1 房間狀態機測試 —— 模擬兩個玩家跑完整生命週期。
//
// 本機（先 `npm run dev`，另開終端機）：
//   node src/sim-test.mjs
// 對線上 worker：
//   node src/sim-test.mjs wss://duo-party.<你的子網域>.workers.dev
//
// 每次跑用隨機 roomId（DO 會持久化狀態，避免撞到上一輪殘留）。

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8787';
const PARTY = 'game-room';
const ROOM = 'test-' + Math.random().toString(36).slice(2, 10);

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  cond ? passed++ : failed++;
}

class Client {
  constructor(label) {
    this.label = label;
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`${HOST}/parties/${PARTY}/${ROOM}`);
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
  waitFor(pred, ms = 6000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label} 等待超時`)), ms);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  last(type) {
    return [...this.msgs].reverse().find((m) => m.type === type);
  }
  close() {
    this.ws.close();
  }
}

const stateIs = (status) => (m) => m.type === 'roomState' && m.state.status === status;
const guestJoined = (m) => m.type === 'roomState' && m.state.guest?.id === 'g1';

async function main() {
  console.log(`\nPhase 1 房間生命週期測試 @ ${HOST}  room=${ROOM}\n`);

  // 1. Host 建房
  const host = new Client('host');
  await host.open();
  host.send({
    type: 'create',
    room: { tierId: 'tierI', modeId: 'standard' },
    player: { id: 'h1', alias: 'Host', title: null, wins: 3 },
  });
  const hs = await host.waitFor(stateIs('waiting'));
  check('建房後 status=waiting', hs.state.status === 'waiting');
  check('host 身分正確 (you=host)', host.last('roomState').you === 'host' && hs.state.host?.id === 'h1');
  check('puzzleSeed 已生成', typeof hs.state.puzzleSeed === 'number');

  // 2. 重複建房應被拒
  host.send({ type: 'create', room: { tierId: 'x', modeId: 'y' }, player: { id: 'h1', alias: 'H', title: null, wins: 0 } });
  const dup = await host.waitFor((m) => m.type === 'error');
  check('重複建房被拒 (room_exists)', dup.code === 'room_exists');

  // 3. Guest 加入
  const guest = new Client('guest');
  await guest.open();
  guest.send({ type: 'join', player: { id: 'g1', alias: 'Guest', title: null, wins: 1 } });
  const gs = await guest.waitFor(guestJoined);
  check('guest 加入後出現在 state', gs.state.guest?.id === 'g1');
  check('guest 身分正確 (you=guest)', guest.last('roomState').you === 'guest');
  const hostSeesGuest = await host.waitFor(guestJoined);
  check('host 收到 guest 加入廣播', !!hostSeesGuest.state.guest);

  // 4. 雙方 ready → countdown
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  const cd = await host.waitFor(stateIs('countdown'));
  check('雙方 ready 後進 countdown', cd.state.status === 'countdown');
  check('countdown 帶 server startAt', typeof cd.state.startAt === 'number');

  // 5. server 權威倒數結束 → playing（不靠 client 計時）
  const started = await guest.waitFor((m) => m.type === 'started', 8000);
  check('收到 server 權威 started 事件', started.type === 'started');
  const playing = await guest.waitFor(stateIs('playing'));
  check('status → playing', playing.state.status === 'playing');

  // 6. 持久化：全新連線進來應拿到 playing 狀態
  const rejoin = new Client('rejoin');
  await rejoin.open();
  const persisted = await rejoin.waitFor((m) => m.type === 'roomState');
  check('DO 持久化：新連線拿到 playing 狀態', persisted.state.status === 'playing');
  rejoin.close();

  // 7. closeResult → finished
  host.send({ type: 'closeResult' });
  const fin = await host.waitFor(stateIs('finished'));
  check('closeResult → finished', fin.state.status === 'finished');

  host.close();
  guest.close();
  console.log(`\n結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('測試錯誤:', e.message);
  process.exit(1);
});
