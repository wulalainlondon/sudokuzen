# duo-party — Phase 0 延遲驗證 Spike

驗證唯一前提：**台灣玩家連 Cloudflare DO(apac) 的 WebSocket RTT，是否明顯低於現在 Firestore us-central1 的 ~300ms+。**
數字好看才往下投 Phase 1–6。這是獨立部署目標，跟主 app 與 `functions/`（Firebase）無關。

## 1. 安裝

```bash
cd duo-party
npm install
```

## 2. 本機驗邏輯（不需要 Cloudflare 帳號）

```bash
npm run dev            # wrangler dev，跑在 http://localhost:8787
# 另開一個終端機：
node src/latency-test.mjs ws://localhost:8787
```

本機是 localhost，RTT 會接近 0 —— 這步只證明 ping/pong 邏輯通，**不是**真實延遲。

## 3. 量真實邊緣延遲（需要免費 Cloudflare 帳號）

```bash
npx wrangler login     # 開瀏覽器授權，免綁卡
npm run deploy         # 部署，會印出 https://duo-party.<你的子網域>.workers.dev
node src/latency-test.mjs wss://duo-party.<你的子網域>.workers.dev
```

**必須從你台灣的網路跑這個指令**，數字才準。

## 判讀

腳本會印出 20 次 RTT 的 min / 中位數 / p95，並給結論：

- 中位數 `< 150ms` → ✅ 明顯改善，進 Phase 1
- `150–250ms` → 🟡 看 p95 與體感
- `> 250ms` → ⚠️ 改善有限，回頭評估

## 清理

不繼續的話：`npx wrangler delete` 移除部署即可，無殘留費用。
