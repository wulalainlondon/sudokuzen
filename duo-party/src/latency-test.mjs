// Phase 0 延遲探針 —— 必須從「你台灣的網路」跑，我這邊量不到你的真實 RTT。
//
// 本機驗邏輯（免帳號）：先 `npm run dev`，另開終端機跑：
//   node src/latency-test.mjs ws://localhost:8787
// 量真實邊緣延遲（需先 deploy）：
//   node src/latency-test.mjs wss://duo-party.<你的子網域>.workers.dev

import WebSocket from "ws";

const HOST = process.argv[2];
const N = 20; // ping 次數
const PARTY = "game-room"; // 對應 wrangler.jsonc 的 GameRoom binding
const ROOM = "latency-probe";

if (!HOST) {
  console.error(
    "用法: node src/latency-test.mjs <ws://localhost:8787 或 wss://duo-party.xxx.workers.dev>",
  );
  process.exit(1);
}

const url = `${HOST}/parties/${PARTY}/${ROOM}`;
const ws = new WebSocket(url);
const rtts = [];
let count = 0;

ws.on("open", () => {
  console.log(`已連上 ${url}，開始量 ${N} 次 RTT…`);
  ping();
});

ws.on("message", (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (msg.type !== "pong") return; // 略過 welcome
  rtts.push(Date.now() - msg.clientT);
  count++;
  if (count < N) setTimeout(ping, 200);
  else {
    report();
    ws.close();
  }
});

ws.on("error", (e) => {
  console.error("連線錯誤:", e.message);
  process.exit(1);
});

function ping() {
  ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
}

function report() {
  rtts.sort((a, b) => a - b);
  const min = rtts[0];
  const med = rtts[Math.floor(rtts.length / 2)];
  const p95 = rtts[Math.floor(rtts.length * 0.95)];
  console.log(`\n台灣 → DO(apac) WebSocket RTT（${N} 次）`);
  console.log(`  min ${min}ms  /  中位數 ${med}ms  /  p95 ${p95}ms`);
  console.log(`\n對照基準：現在 Firestore us-central1 單程約 150–250ms、snapshot 往返 300ms+`);
  if (med < 150) {
    console.log("✅ 明顯改善，前提成立 → 進 Phase 1");
  } else if (med < 250) {
    console.log("🟡 有改善但不大，看 p95 與體感再決定");
  } else {
    console.log("⚠️ 改善有限，先別投入 30 天，回頭評估（如 Supabase 東京 region）");
  }
}
