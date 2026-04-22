# Cloud Functions — Route C Phase 1

這三支函數是 Route C 遷移的 Phase 1，把 Duo 模式的關鍵寫入從客戶端直寫改為 server-authoritative。

## 函數列表

| 函數名稱 | 說明 |
|---|---|
| `duoSubmitFinish` | 提交玩家完成時間、星數、進度（transaction，防止重複提交） |
| `duoAutoForfeitOpponent` | 對手心跳超時時 forfeit 對手（transaction，idempotent） |
| `duoSurrender` | 玩家主動投降（直接 update，只有自己能操作） |

## 前置條件

部署前需要將 Firebase 專案升級至 **Blaze（隨用隨付）** 方案，Cloud Functions 需要 Blaze 才能部署。

## 部署指令

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## Phase 1 完成後的後續步驟

確認函數部署成功後，需要更新客戶端代碼 `src/features/duo/duoGame.ts`：

- `submitDuoFinish` — 改為呼叫 `duoSubmitFinish` Cloud Function
- `autoForfeitOpponent` — 改為呼叫 `duoAutoForfeitOpponent` Cloud Function
- `surrenderDuo` — 改為呼叫 `duoSurrender` Cloud Function

客戶端切換屬於 Phase 2，待 Blaze 確認後另外進行。
