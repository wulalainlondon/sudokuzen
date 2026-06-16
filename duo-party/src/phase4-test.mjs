// Phase 4 測試：moves/replay、觀戰盤面同步、炸彈、Chess Clock。
//   ./node_modules/.bin/wrangler dev --port 8796
//   node src/phase4-test.mjs ws://localhost:8796

import WebSocket from 'ws';

const HOST = process.argv[2] || 'ws://localhost:8796';
const PARTY = 'game-room';

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
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
const rid = () => 'p4-' + Math.random().toString(36).slice(2, 10);

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
  console.log(`\nPhase 4 子功能測試 @ ${HOST}\n`);

  // ── 4a moves/replay ──
  {
    const { host, guest } = await playTo();
    const moves = [
      { t: 100, cell: 5, val: 3, ok: true },
      { t: 250, cell: 9, val: 7, ok: false },
    ];
    host.send({ type: 'finish', timeSec: 80, stars: 2, moves });
    // 優化：一方完成時 moves 仍被剝除（省觀戰廣播頻寬）
    const oneDone = await guest.waitFor((m) => m.type === 'roomState' && m.state.host?.finishTime === 80);
    check('moves 優化：僅一方完成時 host.moves 被剝除(null)', oneDone.state.host.moves == null);

    guest.send({ type: 'surrender', moves: [{ t: 10, cell: 1, val: 2, ok: true }] });
    // 雙方完成 → moves 帶上供 replay
    const bothDone = await host.waitFor((m) => m.type === 'roomState' && m.state.guest?.moves != null);
    check('moves：雙方完成後 host.moves 長度=2', bothDone.state.host.moves.length === 2);
    check('moves：內容正確 (cell=5,val=3,ok=true)', bothDone.state.host.moves[0].cell === 5 && bothDone.state.host.moves[0].val === 3 && bothDone.state.host.moves[0].ok === true);
    check('surrender 帶 moves：guest.moves 長度=1', bothDone.state.guest.moves.length === 1);
    host.close();
    guest.close();
  }

  // ── 4b 觀戰盤面 + 炸彈 ──
  {
    const { host, guest } = await playTo();
    const board = JSON.stringify(Array.from({ length: 81 }, (_, i) => (i < 5 ? i + 1 : 0)));
    host.send({ type: 'specBoard', board, version: 7 });
    const sb = await guest.waitFor((m) => m.type === 'roomState' && m.state.specBoardVersion === 7);
    check('觀戰盤面：guest 看到 specBoardVersion=7', sb.state.specBoardVersion === 7);
    check('觀戰盤面：specBoardState 同步', sb.state.specBoardState === board);

    guest.send({ type: 'bomb', cells: [10, 20, 30] });
    const bomb = await host.waitFor((m) => m.type === 'roomState' && m.state.specBombAt != null);
    check('炸彈：host 收到 specBombAt(server 時戳)', typeof bomb.state.specBombAt === 'number');
    check('炸彈：specBombCells=[10,20,30]', JSON.stringify(bomb.state.specBombCells) === '[10,20,30]');

    guest.send({ type: 'bomb', cells: [1, 2, 3, 4, 5, 6, 7] }); // 超過 5 個應截斷
    await new Promise((r) => setTimeout(r, 200));
    check('炸彈上限：cells 被截到 5 個', host.latest().specBombCells.length === 5);
    host.close();
    guest.close();
  }

  // ── 4c Chess Clock ──
  {
    const { host, guest } = await playTo();
    host.send({
      type: 'cc',
      update: {
        ccActiveTurn: 'host',
        ccTurnStartedAt: 1000,
        ccHostAccumMs: 0,
        ccGuestAccumMs: 0,
        ccBoardState: '[1,2,3]',
        ccBoardVersion: 1,
        ccCurrentCellErrors: 0,
        ccCurrentCellIdx: null,
      },
    });
    const cc1 = await guest.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccBoardVersion === 1);
    check('CC 初始化：guest 看到 ccActiveTurn=host, ccBoardVersion=1', cc1.state.cc.ccActiveTurn === 'host' && cc1.state.cc.ccBoardVersion === 1);

    // 合併更新：只送部分欄位，其他應保留
    host.send({ type: 'cc', update: { ccActiveTurn: 'guest', ccHostAccumMs: 1500, ccBoardVersion: 2 } });
    const cc2 = await guest.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccBoardVersion === 2);
    check('CC 合併：ccActiveTurn→guest, ccHostAccumMs=1500', cc2.state.cc.ccActiveTurn === 'guest' && cc2.state.cc.ccHostAccumMs === 1500);
    check('CC 合併：未送的 ccBoardState 保留 (=[1,2,3])', cc2.state.cc.ccBoardState === '[1,2,3]');

    // 結算
    guest.send({ type: 'cc', update: { ccHostTotalMs: 60000, ccGuestTotalMs: 55000 } });
    const cc3 = await host.waitFor((m) => m.type === 'roomState' && m.state.cc?.ccHostTotalMs === 60000);
    check('CC 結算：雙方 total 寫入', cc3.state.cc.ccHostTotalMs === 60000 && cc3.state.cc.ccGuestTotalMs === 55000);
    host.close();
    guest.close();
  }

  console.log(`\n結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('測試錯誤:', e.message);
  process.exit(1);
});
