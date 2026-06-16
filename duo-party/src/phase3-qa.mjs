// Phase 3 QA 補充測試（獨立 QA 新增）。
// 覆蓋既有 phase3-test.mjs 沒測到的多截止時間並存、沒收邊界、重連認領安全。
//
// 啟動（短寬限期）：
//   ./node_modules/.bin/wrangler dev --port 8794 --var FORFEIT_GRACE_MS:1500 --var WAITING_CLOSE_GRACE_MS:1500
// 然後：
//   node src/phase3-qa.mjs ws://localhost:8794

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8794';
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
const rid = () => 'qa-' + Math.random().toString(36).slice(2, 10);

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

// 房間到 countdown 但「尚未」playing，回傳 {host, guest, roomId}
async function toCountdown() {
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
  await host.waitFor((m) => m.type === 'roomState' && m.state.status === 'countdown', 4000);
  return { host, guest, roomId };
}

async function main() {
  console.log(`\nPhase 3 QA 補充測試 @ ${HOST}\n`);

  // ── [P1a] countdown 進行中 guest 斷線 → 伺服器把 guest 釋出、回到 waiting ──
  // （onClose 對 countdown 狀態的 guest 走 releaseGuest，不是 forfeit。這是設計行為，
  //  順帶驗證 cancelCountdown 把 countdownEndAt 清掉、alarm 不殘留誤觸發。）
  {
    const { host, guest } = await toCountdown();
    guest.close();
    const back = await host.waitFor((m) => m.type === 'roomState' && m.state.status === 'waiting', 4000);
    check('[P1a] countdown 中 guest 斷線 → 回到 waiting', back.state.status === 'waiting');
    check('[P1a] guest 座位被釋出（guest=null）', back.state.guest == null);
    // 等超過原 countdown(4s) 與 forfeit grace，確認沒有殘留 alarm 把房間誤推進 playing/finished
    await sleep(2200);
    const st = host.latest();
    check('[P1a] 無殘留 alarm 誤觸發 → status 仍 waiting', st.status === 'waiting');
    host.close();
  }

  // ── [P1] countdown 進行中 host(等待方) 斷線：countdownEnd + closeRoom 兩 deadline 並存 ──
  // host 斷線在 countdown 時設 closeRoomAt(+1.5s)，countdownEndAt(+~4s) 仍 pending。
  // closeRoom 先到 → status=finished。驗證 closeRoom 觸發、countdown deadline 不殘留誤推進。
  {
    const { host, guest } = await toCountdown();
    host.close(); // host 斷線：設 closeRoomAt，countdownEndAt 仍在
    const fin = await guest.waitFor((m) => m.type === 'roomState' && m.state.status === 'finished', 4000);
    check('[P1] countdown 中 host 斷線 → closeRoom 先觸發 → finished', fin.state.status === 'finished');
    // 等超過 countdown 4s，確認 countdownEnd 殘留沒把已 finished 的房推回 playing
    await sleep(2500);
    const st = guest.latest();
    check('[P1] 殘留 countdown deadline 不覆蓋 finished → status 仍 finished', st.status === 'finished');
    if (st.status !== 'finished') console.log(`     ↳ BUG: status 被 stale countdownEnd 推回 = ${st.status}`);
    const gotStarted = guest.msgs.some((m) => m.type === 'started');
    if (gotStarted) console.log('     ↳ BUG: 收到偽 "started" 廣播（已 finished 房又被開賽）');
    guest.close();
  }

  // ── [P1b] 雙方在 playing 接近時間斷線 → 兩個接近的 forfeit deadline 都要觸發 ──
  // 驗證後者(guest)不會把前者(host)的 alarm 覆蓋掉、兩邊都被沒收、房間不卡。
  {
    const { host, guest, roomId } = await playTo();
    host.close();
    await sleep(60);
    guest.close();
    await sleep(2200);
    // 新觀察者連入同房讀最終狀態
    const obs = new Client(roomId, 'obs');
    await obs.open();
    const st = await obs.waitFor((m) => m.type === 'roomState', 4000);
    check('[P1b] host 斷線後被沒收 → host.finishTime=9999', st.state.host.finishTime === 9999);
    check('[P1b] guest 斷線後被沒收 → guest.finishTime=9999', st.state.guest.finishTime === 9999);
    check('[P1b] 雙斷線房間不卡死（status 仍 playing，雙方有 finishTime 可結算）', st.state.status === 'playing');
    obs.close();
  }

  // ── [2b] 我先完成，對手才斷線 → 對手仍被沒收 ──
  {
    const { host, guest } = await playTo();
    host.send({ type: 'finish', timeSec: 30, stars: 3 }); // 我(host)先完成
    await host.waitFor((m) => m.type === 'roomState' && m.state.host?.finishTime === 30);
    guest.close(); // 對手後斷線（finishTime 仍 null）
    const ff = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.finishTime === 9999, 5000);
    check('[2b] 我先完成、對手後斷線 → 對手 finishTime=9999', ff.state.guest.finishTime === 9999);
    check('[2b] 我的真實成績不受影響 → host.finishTime=30', ff.state.host.finishTime === 30);
    host.close();
  }

  // ── [2d] 對手完成後才斷線 → 真實成績不被沒收覆蓋 ──
  {
    const { host, guest } = await playTo();
    guest.send({ type: 'finish', timeSec: 42, stars: 2 }); // 對手先完成
    await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.finishTime === 42);
    guest.close(); // 完成後才斷線
    // 等超過寬限期，確認沒收 alarm 沒把 42 覆蓋成 9999
    await sleep(2200);
    const st = host.latest();
    check('[2d] 對手完成後斷線 → finishTime 維持 42（未被 9999 覆蓋）', st.guest.finishTime === 42);
    check('[2d] 對手 stars 維持 2', st.guest.stars === 2);
    check('[2d] 對手 online=false（斷線 presence 正確反映）', st.guest.online === false);
    host.close();
  }

  // ── [3b] 冒用者 hello 認領別人座位 → 應被拒 reclaim_failed ──
  {
    const { host, guest, roomId } = await playTo();
    guest.close();
    await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.online === false, 4000);
    // 攻擊者用不同 playerId 嘗試認領 guest 座位
    const attacker = new Client(roomId, 'attacker');
    await attacker.open();
    attacker.send({ type: 'hello', player: { id: 'evil', alias: 'Evil', title: null, wins: 0 }, role: 'guest' });
    const err = await attacker.waitFor((m) => m.type === 'error', 4000);
    check('[3b] 冒用認領被拒 → error code=reclaim_failed', err.code === 'reclaim_failed');
    // 座位資訊不應被竄改
    await sleep(200);
    const st = host.latest();
    check('[3b] guest 座位 id 未被竄改（仍是 g1）', st.guest.id === 'g1');
    check('[3b] guest 仍 online=false（冒用未標回 online）', st.guest.online === false);
    host.close();
    attacker.close();
  }

  // ── [3c] host 在 waiting 斷線設了 closeRoom alarm，重連 hello 應一併取消 ──
  {
    const roomId = rid();
    const host = new Client(roomId, 'host');
    await host.open();
    host.send({ type: 'create', room: { tierId: 'tierI', modeId: 'standard' }, player: HOST_P });
    await host.waitFor((m) => m.type === 'roomState' && m.you === 'host');
    // host 在 waiting 斷線 → closeRoomAt = now + 1.5s
    host.close();
    await sleep(300);
    // host 在寬限期內重連並 hello 認領
    const host2 = new Client(roomId, 'host2');
    await host2.open();
    host2.send({ type: 'hello', player: HOST_P, role: 'host' });
    const back = await host2.waitFor((m) => m.type === 'roomState' && m.state.host?.online === true, 4000);
    check('[3c] host 重連恢復 online=true', back.state.host.online === true);
    // 等超過原 closeRoom 寬限期，房間不應被關（status 仍 waiting）
    await sleep(2000);
    const st = host2.latest();
    check('[3c] 重連取消 closeRoom alarm → status 仍 waiting（房沒被關）', st.status === 'waiting');
    host2.close();
  }

  // ── [P6] progress 在非 playing(waiting) 狀態送出應被忽略 ──
  {
    const roomId = rid();
    const host = new Client(roomId, 'host');
    await host.open();
    host.send({ type: 'create', room: { tierId: 'tierI', modeId: 'standard' }, player: HOST_P });
    await host.waitFor((m) => m.type === 'roomState' && m.you === 'host');
    host.send({ type: 'progress', filled: 40 }); // waiting 狀態送 progress
    await sleep(300);
    const st = host.latest();
    check('[P6] waiting 狀態的 progress 被忽略 → host.progress 仍為 0', st.host.progress === 0);
    host.close();
  }

  console.log(`\n結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('測試錯誤:', e.message);
  process.exit(1);
});
