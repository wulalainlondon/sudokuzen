**PWA 優化實作與驗證 — 2026-09-14**

已完成 [原盤點](code-optimization-audit-2026-09-14.md) 的六項優化及房間公開恢復修正。發行目標為 `2026.09.14-V3`；以下記錄相較 `2026.09.14-V2`（`88c4c69`）的變更與部署前驗證。

| 項目 | 正式實作後結果 |
| --- | --- |
| 題庫請求合併 | 首頁 normal 題庫的 fetch／JSON 解析各 **3 → 1 次**；一般與教學題庫共用進行中請求，manifest、body 及 shard 有 6 秒期限，失敗可重試。 |
| 輸入音效 | 20 次筆記輸入建立 Audio **40 → 20 個**；真正選格保留音效，輸入後刷新反白不再額外播放。 |
| Duo 本機保存 | 10 次正確輸入完整快照 **20 → 10 次**，快照包含當次操作及完整 10 步回放，與棋盤一致。錯誤數字僅顯示預覽，不再暫時改寫棋盤資料或在延後回呼覆蓋筆記。 |
| 房間公開 | 每房寫入佇列有 4 秒期限，失敗依 1／2／4／8 秒退避重試；在線／回到前景時恢復。畫面顯示公開中／重試中；成功後才視為已公開並開始保鮮。晚到寫入、離房清除與晚到刪除會按目前房間意圖協調。 |
| PWA 快取 | 移除 `levels.js`、原始 `style.css` 的預快取；改為實際 Vite 模組相依圖與離線所需延後模組。每份題庫與教學資料使用內容 hash，獨立資料快取最多 256 筆，程式版本更新保留可重用內容。 |
| 首頁依賴與預算 | 教學名稱／技巧索引抽成小型 catalog，技能偵測器與施法動畫延後載入；World 進場預先完成技能載入，首次快捷施法與候選追蹤也有載入守衛。預算改算完整靜態 import 圖。 |

**最終建置量測**

| gzip bytes（level 9） | V2 基準 | 本次 |
| --- | ---: | ---: |
| 完整初始 JS 相依圖 | 342,691 | 265,187 |
| CSS | 29,660 | 29,685 |
| 初始 JS＋CSS | 372,351 | 294,872 |

初始 JS＋CSS 減少 77,479 bytes，約 20.8%。新門檻：入口 JS 80 KB、完整初始 JS 280 KB、JS＋CSS 315 KB，CSS 維持 30 KB。延後模組仍會為離線使用下載；這裡量測的是初始靜態依賴與執行範圍，不是首次 PWA 安裝的全部流量，也不是實機啟動／INP 改善比例。

**驗證與重跑**

- `NODE_OPTIONS=--no-experimental-webstorage npm run check`：TypeScript、ESLint、Prettier、教學資料驗證及 **62 個檔案／386 項測試**通過。新增並行請求／重試、內容 hash、對戰立即快照、房間公開故障注入、快取策略、更新版本及技能載入測試。
- `npm run build:firebase` 與 `npm run perf:check` 通過。GitHub Pages workflow 已加入正式建置的離線／安全更新驗證。
- `npm run test:e2e:smoke` 的 27 項一般瀏覽器回歸通過；其中另 1 項離線更新測試曾因測試伺服器切版／恢復網路的順序失敗，修正測試時序後，以 `--grep production --retries=0 --repeat-each=3` 獨立連續三次通過。WebKit 的最終離線／更新流程也重新通過。
- `node scripts/verify-duo-input.mjs http://localhost:5181`：Chromium／WebKit × host／guest 四種組合通過。實際 UI 輸入筆記及錯誤答案後，關閉頁面而不執行 beforeunload，再重開恢復；驗證筆記、錯誤次數、回放、正確輸入、擦除及再戰資料隔離。
- `E2E_BASE_URL=http://localhost:5181 npx playwright test e2e/skill-runtime-loading.spec.ts`，再加 `E2E_BROWSER=webkit`：兩種引擎各兩項通過，實際長按後可完成首次快捷填數及候選追蹤消除。測試先等待進場動畫結束，避免座標移動取消長按。
- `node scripts/verify-pwa-offline.mjs` 與 `--base=/`：Chromium 子路徑／根路徑皆驗證首次安裝只啟動一次、離線重新載入後進關卡及輸入、有效 Duo 座位延後更新、離房後更新、未修改 normal 題庫跨版額外下載 **0 次**、保留資料及其他應用快取，更新後再次離線遊玩。
- `node scripts/verify-pwa-offline.mjs --browser=webkit --base=/ --network=disconnect`：WebKit 相同流程通過。因本機 WebKit 在 `context.setOffline(true)` 配合 Service Worker reload 出現引擎錯誤，改由測試伺服器切斷所有連線；仍要求真正重新載入與完整離線操作成功。

測試使用隔離後端與本機房間資料，不建立線上房間、不發起真正 WebSocket 對戰。截圖已目視檢查，保留於 `output/duo-input-verification/`、`output/pwa-offline/` 及 `output/skill-runtime-*.png`；實作後計數在 `output/code-audit-20260914/implemented.json`。

**更新邊界**

新程式不再因 HTML 版本不同而 unregister Worker、刪除所有快取並重新啟動；由 Worker 安裝完整離線資產後安全接管。controllerchange 會比對 Worker 與目前頁面版本，避免首次安裝多啟動一次；跨版更新保留遊戲中的延後規則。更新生命週期檢查已補上 register() 完成前已開始安裝的 Worker 監聽、接管請求持續到 Worker 狀態確認，以及 SKIP_WAITING 的事件生命週期保護；新增精準單元測試。測試環境也將版本切換排在恢復連線之前，避免 online 自動檢查先讀舊版，而明確 update() 合併到同一個舊請求，造成把舊版檢查誤認為新版更新。最後確認真正載入新版本及離線操作，不以單純看見 waiting Worker 作為通過標準。

現行 V2 已載入頁面仍執行舊版「同一 session 只重載一次」守衛，無法由尚未載入的新程式更改。首度從 V2 遷移可能需離開對局後重新載入／重開 PWA；已以實際 V2 發布目錄執行 `node scripts/verify-pwa-offline.mjs --base=/ --legacy-dist=/tmp/sudoku-pwa-release-20260914-v2/dist`：有效對戰座位期間延後接管、離房後重新載入新版本及離線遊玩均通過，首次遷移 normal 題庫下載 1 次，其他應用快取保留。舊 Worker 的進行中請求仍可能重建舊殼快取，不宣稱首次遷移當下舊快取已完全消失。新版本之間的自動安全更新另行驗證。首次切換內容 hash 會建立新的資料快取，跨版本重用收益從此後開始，不能把 V2 的隨機版本快取視為已可直接重用。

使用者先前回報的「Duo 不中斷遊玩時筆記自行變成答案」仍未重現、未定位；本次不宣稱已修復其根因。
