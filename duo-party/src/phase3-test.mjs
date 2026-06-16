// Phase 3 測試：進度同步 / 完成結算 / 斷線離線 / 沒收 / 重連認領。
//
// 需用短寬限期啟動伺服器：
//   ./node_modules/.bin/wrangler dev --port 8793 --var FORFEIT_GRACE_MS:1500 --var WAITING_CLOSE_GRACE_MS:1500
// 然後：
//   node src/phase3-test.mjs ws://localhost:8793

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8793';
const PARTY = 'game-room';

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  cond ? passed++ : failed++;
}
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

const HOST_P = { id: 'h1', alias: 'Host', title: null, wins: 5 };
const GUEST_P = { id: 'g1', alias: 'Guest', title: null, wins: 2 };
const rid = () => 'p3-' + Math.random().toString(36).slice(2, 10);

// 建房 + 加入 + 雙方 ready + 等開賽，回傳 {host, guest, roomId}
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
  console.log(`\nPhase 3 對局同步 + 在線測試 @ ${HOST}\n`);

  // ── 進度 / 完成 / 雙完成 ──
  {
    const { host, guest } = await playTo();
    host.send({ type: 'progress', filled: 17 });
    const ps = await guest.waitFor((m) => m.type === 'roomState' && m.state.host?.progress === 17);
    check('進度同步：guest 看到 host.progress=17', ps.state.host.progress === 17);

    guest.send({ type: 'finish', timeSec: 123, stars: 3 });
    const gf = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.finishTime === 123);
    check('完成同步：host 看到 guest.finishTime=123, stars=3', gf.state.guest.finishTime === 123 && gf.state.guest.stars === 3);

    guest.send({ type: 'finish', timeSec: 50, stars: 1 }); // 重複提交應被忽略
    await sleep(300);
    check('防重複提交：guest.finishTime 維持 123', host.latest().guest.finishTime === 123);

    host.send({ type: 'finish', timeSec: 99, stars: 2 });
    const both = await host.waitFor((m) => m.type === 'roomState' && m.state.host?.finishTime === 99);
    check('雙方完成：兩邊 finishTime 都有值', both.state.host.finishTime === 99 && both.state.guest.finishTime === 123);

    host.send({ type: 'closeResult' });
    const fin = await host.waitFor((m) => m.type === 'roomState' && m.state.status === 'finished');
    check('closeResult → finished', fin.state.status === 'finished');
    host.close();
    guest.close();
  }

  // ── 認輸 ──
  {
    const { host, guest } = await playTo();
    guest.send({ type: 'surrender' });
    const sf = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.finishTime === 9999);
    check('認輸：guest.finishTime=9999, stars=0', sf.state.guest.finishTime === 9999 && sf.state.guest.stars === 0);
    host.close();
    guest.close();
  }

  // ── 斷線 → 離線 → 寬限期後沒收 ──
  {
    const { host, guest, roomId } = await playTo();
    guest.close(); // guest 關分頁
    const off = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.online === false, 4000);
    check('斷線偵測：host 即時看到 guest.online=false', off.state.guest.online === false);

    const ff = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.finishTime === 9999, 5000);
    check('寬限期後自動沒收：guest.finishTime=9999', ff.state.guest.finishTime === 9999);
    void roomId;
    host.close();
  }

  // ── 重連認領 → 取消沒收 ──
  {
    const { host, guest, roomId } = await playTo();
    guest.close();
    await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.online === false, 4000);

    // guest 用同 playerId 重連並 hello 認領
    const guest2 = new Client(roomId, 'guest2');
    await guest2.open();
    guest2.send({ type: 'hello', player: GUEST_P, role: 'guest' });
    const back = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.online === true, 4000);
    check('重連認領：host 看到 guest.online 恢復 true', back.state.guest.online === true);

    // 等超過寬限期，確認沒收被取消（finishTime 仍 null）
    await sleep(2200);
    check('重連取消沒收：guest.finishTime 仍為 null', host.latest().guest.finishTime == null);
    host.close();
    guest2.close();
  }

  console.log(`\n結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('測試錯誤:', e.message);
  process.exit(1);
});
