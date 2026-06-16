// Phase 1 獨立 QA 測試 —— 模擬玩家真實操作場景。
// 每個場景用全新隨機 roomId（DO 會持久化狀態）。
//
//   node src/qa-test.mjs ws://localhost:8790

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8790';
const PARTY = 'game-room';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail) {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (cond) passed++;
  else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
  }
}

const rid = () => 'qa-' + Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(label, room) {
    this.label = label;
    this.room = room;
    this.msgs = [];
    this.waiters = [];
    this.closed = false;
    this.ws = new WebSocket(`${HOST}/parties/${PARTY}/${room}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
    this.ws.on('close', () => { this.closed = true; });
  }
  open() {
    return new Promise((res, rej) => {
      this.ws.on('open', res);
      this.ws.on('error', rej);
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  waitFor(pred, ms = 6000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label} 等待超時`)), ms);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  // 等待一段時間，斷言「沒有」收到符合 pred 的訊息
  expectNone(pred, ms) {
    return new Promise((resolve) => {
      const found = this.msgs.find(pred);
      if (found) return resolve(found);
      const w = { pred, resolve: (m) => resolve(m) };
      this.waiters.push(w);
      setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        resolve(null);
      }, ms);
    });
  }
  last(type) { return [...this.msgs].reverse().find((m) => m.type === type); }
  countType(type) { return this.msgs.filter((m) => m.type === type).length; }
  close() { this.ws.close(); }
}

const stateIs = (status) => (m) => m.type === 'roomState' && m.state.status === status;
const PL = (id, alias = id) => ({ id, alias, title: null, wins: 0 });

async function createRoom(room, hostId = 'h1') {
  const host = new Client('host', room);
  await host.open();
  host.send({ type: 'create', room: { tierId: 'tierI', modeId: 'standard' }, player: PL(hostId, 'Host') });
  await host.waitFor(stateIs('waiting'));
  return host;
}
async function joinRoom(room, guestId = 'g1', label = 'guest') {
  const guest = new Client(label, room);
  await guest.open();
  guest.send({ type: 'join', player: PL(guestId, 'Guest') });
  return guest;
}

// ───────────────────────────────────────────────────────────────
// 場景 a：guest 中途關掉分頁 → host 端應看到座位釋出、status 退回 waiting
async function scenarioA() {
  console.log('\n[a] guest 連上後直接斷線 → host 看到座位釋出');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.id === 'g1');
  check('host 先看到 guest 入座', !!host.last('roomState').state.guest);

  guest.close();
  // 等 host 收到 guest=null 的 roomState
  let released = null;
  try {
    released = await host.waitFor((m) => m.type === 'roomState' && m.state.guest === null && m.state.status === 'waiting', 4000);
  } catch (e) { /* timeout */ }
  check('guest 斷線後 host 看到座位釋出 (guest=null)', !!released, '4 秒內未收到釋出廣播');
  check('狀態退回 waiting', released?.state.status === 'waiting');
  host.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 b：倒數中一方反悔 → 取消倒數退回 waiting，且不會再收到 started
async function scenarioB() {
  console.log('\n[b] 倒數中反悔 ready=false → 取消倒數，不開賽');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  await host.waitFor(stateIs('countdown'));
  check('雙方 ready 進 countdown', true);

  // host 反悔
  host.send({ type: 'ready', ready: false });
  await sleep(600);
  const back = host.last('roomState');
  check('反悔後退回 waiting', back.state.status === 'waiting', `實際=${back.state.status}`);
  check('startAt 已清空', back.state.startAt === null);

  // 確認 5 秒內不會冒出 started（alarm 沒殘留）
  const started = await host.expectNone((m) => m.type === 'started', 5000);
  check('5 秒內無 started 事件 (alarm 已取消)', started === null, '殘留 alarm 把房間硬推進 playing');
  const finalState = host.last('roomState').state.status;
  check('最終 status 仍為 waiting', finalState === 'waiting', `實際=${finalState}`);
  host.close(); guest.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 c：第三個玩家插隊 → room_full
async function scenarioC() {
  console.log('\n[c] 第三條連線 join 已滿房 → room_full');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');

  const third = new Client('third', room);
  await third.open();
  third.send({ type: 'join', player: PL('g2', 'Third') });
  const err = await third.waitFor((m) => m.type === 'error', 4000);
  check('第三人收到 error', err?.type === 'error');
  check('error code = room_full', err?.code === 'room_full', `實際=${err?.code}`);
  host.close(); guest.close(); third.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 d：沒 join 就 ready → error，房間不進入怪狀態
async function scenarioD() {
  console.log('\n[d] 沒 join 直接 ready=true → error，不破壞房間');
  const room = rid();
  const host = await createRoom(room);

  const rogue = new Client('rogue', room);
  await rogue.open();
  await rogue.waitFor((m) => m.type === 'roomState'); // 收到既有房間狀態
  rogue.send({ type: 'ready', ready: true });
  const err = await rogue.waitFor((m) => m.type === 'error', 4000);
  check('收到 error', err?.type === 'error');
  check('error code = no_role', err?.code === 'no_role', `實際=${err?.code}`);

  // host 端確認房間沒被推進 countdown
  const noCd = await host.expectNone(stateIs('countdown'), 1500);
  check('房間未被推進 countdown', noCd === null);
  const st = host.last('roomState').state.status;
  check('房間仍 waiting', st === 'waiting', `實際=${st}`);
  host.close(); rogue.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 e：join 一個沒人建的房 → no_room
async function scenarioE() {
  console.log('\n[e] join 不存在的房 → no_room');
  const room = rid();
  const lonely = new Client('lonely', room);
  await lonely.open();
  lonely.send({ type: 'join', player: PL('g1') });
  const err = await lonely.waitFor((m) => m.type === 'error', 4000);
  check('收到 error', err?.type === 'error');
  check('error code = no_room', err?.code === 'no_room', `實際=${err?.code}`);
  lonely.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 f：host 中途 leave → finished，guest 收到廣播
async function scenarioF() {
  console.log('\n[f] host leave → finished，guest 收到廣播');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');

  host.send({ type: 'leave' });
  const finGuest = await guest.waitFor(stateIs('finished'), 4000).catch(() => null);
  check('guest 收到 finished 廣播', finGuest?.state.status === 'finished', 'guest 未收到房間結束通知');
  host.close(); guest.close();
}

// 場景 f2：waiting 階段（無 guest）host leave → finished
async function scenarioF2() {
  console.log('\n[f2] waiting 無 guest 時 host leave → finished');
  const room = rid();
  const host = await createRoom(room);
  host.send({ type: 'leave' });
  // host 連線會被 close()，先抓 finished 廣播（可能在 close 前送達）
  const fin = await host.waitFor(stateIs('finished'), 2000).catch(() => null);
  // 用新連線確認持久化狀態
  await sleep(300);
  const probe = new Client('probe', room);
  await probe.open();
  const st = await probe.waitFor((m) => m.type === 'roomState', 4000).catch(() => null);
  check('持久化狀態為 finished', st?.state.status === 'finished', `實際=${st?.state.status}`);
  probe.close();
}

// ───────────────────────────────────────────────────────────────
// 場景 g：countdown 中 abort → 退回 waiting，清掉雙方 ready
async function scenarioG() {
  console.log('\n[g] countdown 中 abort → waiting，清掉 ready');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  await host.waitFor(stateIs('countdown'));

  host.send({ type: 'abort' });
  // 等 abort 後的「settled」廣播：避免 waitFor 命中倒數前的舊 waiting state
  await sleep(600);
  const back = host.last('roomState');
  check('abort 後退回 waiting', back.state.status === 'waiting', `實際=${back.state.status}`);
  check('host ready 被清空', back.state.host?.ready === false);
  check('guest ready 被清空', back.state.guest?.ready === false, `實際=${back.state.guest?.ready}`);
  const started = await host.expectNone((m) => m.type === 'started', 5000);
  check('5 秒內無 started (alarm 已取消)', started === null);
  host.close(); guest.close();
}

// ───────────────────────────────────────────────────────────────
// 擔心點 1：countdown 中 guest 斷線 → 是否殘留 alarm 把空房推進 playing
async function concernAlarmLeak() {
  console.log('\n[擔心1] countdown 中 guest 斷線，alarm 是否殘留');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  await host.waitFor(stateIs('countdown'));

  guest.close(); // countdown 中 guest 關分頁
  const back = await host.waitFor((m) => m.type === 'roomState' && m.state.guest === null, 4000).catch(() => null);
  check('guest 斷線後座位釋出', !!back, '未釋出');
  check('狀態退回 waiting', back?.state.status === 'waiting', `實際=${back?.state.status}`);
  // 等超過 COUNTDOWN_MS(4s)，確認殘留 alarm 沒把空房推進 playing
  const started = await host.expectNone((m) => m.type === 'started', 5500);
  check('5.5 秒內無 started (空房沒被推進 playing)', started === null, 'alarm 殘留把空房推進 playing！');
  const st = host.last('roomState').state.status;
  check('最終 status 仍 waiting', st === 'waiting', `實際=${st}`);
  host.close();
}

// ───────────────────────────────────────────────────────────────
// 擔心點 2：重複送 ready=true 多次，會不會重設 alarm 造成開賽時間飄移
async function concernReadySpam() {
  console.log('\n[擔心2] 重複 ready=true 是否重設 alarm / startAt 飄移');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  const cd = await host.waitFor(stateIs('countdown'));
  const firstStartAt = cd.state.startAt;

  // 在倒數中狂送 ready=true
  await sleep(800);
  for (let i = 0; i < 5; i++) { host.send({ type: 'ready', ready: true }); guest.send({ type: 'ready', ready: true }); }
  await sleep(500);
  const latest = host.last('roomState');
  check('startAt 未因重複 ready 漂移', latest.state.startAt === firstStartAt, `first=${firstStartAt} latest=${latest.state.startAt}`);

  // 確認最終確實在原定 startAt 附近開賽
  const started = await host.waitFor((m) => m.type === 'started', 6000);
  const drift = Math.abs(started.startAt - firstStartAt);
  check('實際開賽時間貼近原定 startAt (±500ms)', drift < 500, `drift=${drift}ms`);
  host.close(); guest.close();
}

// ───────────────────────────────────────────────────────────────
// 擔心點 3：you 欄位對每條連線是否正確
async function concernYouField() {
  console.log('\n[擔心3] you 欄位 host=host / guest=guest');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await guest.waitFor((m) => m.type === 'roomState' && m.state.guest?.id === 'g1');
  await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.id === 'g1');

  // 觸發一次廣播讓雙方都拿到最新 roomState
  host.send({ type: 'ready', ready: true });
  await sleep(400);
  host.send({ type: 'ready', ready: false });
  await sleep(400);

  check('host 端 you=host', host.last('roomState').you === 'host', `實際=${host.last('roomState').you}`);
  check('guest 端 you=guest', guest.last('roomState').you === 'guest', `實際=${guest.last('roomState').you}`);
  host.close(); guest.close();
}

// ───────────────────────────────────────────────────────────────
// 擔心點 4：同一玩家用兩條連線（重連）
async function concernReconnect() {
  console.log('\n[擔心4] 同玩家兩條連線（重連場景）');
  const room = rid();
  const host = await createRoom(room);
  const guest = await joinRoom(room);
  await host.waitFor((m) => m.state?.guest?.id === 'g1');

  // guest 用第二條連線重連（同 playerId）
  const guest2 = new Client('guest2', room);
  await guest2.open();
  const st = await guest2.waitFor((m) => m.type === 'roomState', 4000);
  check('重連連線拿到房間狀態', !!st);
  check('重連連線 you=null (未 setState 前)', st.you === null || st.you === undefined, `實際=${st.you}`);

  // guest2 嘗試 join 同 id（房間已滿）
  guest2.send({ type: 'join', player: PL('g1') });
  const err = await guest2.waitFor((m) => m.type === 'error', 4000).catch(() => null);
  check('重連 join 同 id 收到 room_full', err?.code === 'room_full', `實際=${err?.code}`);

  // 關鍵：第一條 guest 連線此時若斷線會發生什麼？
  guest.close();
  // releaseGuest 會把座位清掉 → 但 guest2 自以為應該還在房裡（其實它沒有 role）
  const afterClose = await host.waitFor((m) => m.type === 'roomState' && m.state.guest === null, 4000).catch(() => null);
  check('原 guest 斷線後座位釋出', !!afterClose, '座位未釋出');
  host.close(); guest2.close();
}

async function main() {
  console.log(`\n=== Phase 1 QA 場景測試 @ ${HOST} ===`);
  await scenarioA();
  await scenarioB();
  await scenarioC();
  await scenarioD();
  await scenarioE();
  await scenarioF();
  await scenarioF2();
  await scenarioG();
  await concernAlarmLeak();
  await concernReadySpam();
  await concernYouField();
  await concernReconnect();

  console.log(`\n=== 結果：${passed} 通過 / ${failed} 失敗 ===`);
  if (failures.length) {
    console.log('失敗項目：');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('測試錯誤:', e.message, e.stack); process.exit(1); });
