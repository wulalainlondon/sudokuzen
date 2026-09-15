**Duo「需要連線」查核 — 2026-09-15**

使用者提供 V4 iPhone PWA 截圖，首頁正常顯示，進入對決出現「Duo 需要連線，請稍後再試」。玩家後續回報「重開就正常」，與本次重現的恢復方式一致。尚未取得該裝置當時的原始 console／網路記錄，也未確認截圖確切發生時間及安裝來源；以下區分現場服務查核與受控重現。

**服務及日誌**

- 查核時 GitHub Pages、Firebase Hosting 首頁皆 HTTP 200，均為 `2026.09.14-V4`。
- Cloudflare `/lobby?limit=1` HTTP 200，探針約 612 ms。即時 tail 亦觀察到 iPhone 對 `/lobby?limit=20` 的 HTTP 200 與 `outcome: ok`，觀察到的事件無 exceptions；無法只靠這些請求將裝置認定為 Steven。
- Google Cloud Logging 查詢 `severity>=ERROR AND timestamp>="2026-09-14T14:30:00Z"`，截至查核時回傳空陣列。Functions 最近 250 筆為 `stopBillingOnBudgetAlert` 執行記錄，沒有找到對應的 Duo 錯誤。這不涵蓋未上傳的手機端 SDK 錯誤。
- Cloudflare 歷史 Observability API 回覆 HTTP 403、code 10000 Authentication error；現有 Wrangler OAuth 可 tail，但不足以查詢該歷史 API。不能據此宣稱歷史期間沒有服務錯誤。

**程式觸發點**

`src/features/duo/duoLobby.ts:320` 等待 Firebase 就緒，接著等待匿名登入、恢復舊房間；各步有 12 秒期限。任一步拋錯都在 `:338` 的 catch 收起大廳，並在 `:344` 顯示同一則「需要連線」訊息。因此該訊息不能直接等同於手機沒有網路，也無法單憑截圖判斷是哪一步失敗。

已確認一個初始化失敗後無法重試的缺陷：

- `src/firebase/runtime.ts:62` 的設定檔載入 Promise，失敗後沒有清除。
- 同檔 `:72` 的 SDK 初始化 Promise，失敗後也沒有清除。
- `src/firebase/client.ts:443` 的初始化將錯誤轉成 `false`，但保留這個已完成的失敗 Promise；後續呼叫一直取回相同結果。

**正式 V4 受控重現**

以正式 GitHub Pages 資產、隔離的新瀏覽器儲存空間測試，不修改部署、不建立對戰房間：

1. 健康網路下，Chromium／WebKit 都可進大廳，約 1.7／2.2 秒。
2. 僅讓首次 Firebase 設定檔載入失敗，接著恢復網路。
3. 重按兩次對決，兩種引擎都顯示同一則錯誤；`navigator.onLine === true`，未重新發起設定檔載入。
4. 允許真正 Service Worker 的補充測試亦重現：Chromium 17／8 ms、WebKit 15／7 ms 即返回失敗。
5. 同一瀏覽器 context 重新載入頁面後，兩種引擎都可正常進大廳，無須清除儲存資料。

重現的錯誤鏈：

```
Firebase init failed: Error: script load failed: …/firebase-config.js
openDuoLobby failed: Error: Firebase unavailable
```

這是可確定的程式缺陷與相同症狀的重現，尚不能宣稱已取得 Steven 當時的錯誤鏈。相關初始化程式從 V2 至 V4 未變更。

**處置方向**

暫時可離開進行中的對局後關閉並重開 PWA，不必刪除 PWA 或清除遊戲資料。程式修正應讓設定檔／SDK／client 初始化失敗後釋放失敗 Promise，加入明確期限與可重試狀態，並保留可區分設定檔、SDK、登入與恢復房間的診斷資訊。不可只更改提示文字而保留失敗結果。

本次完成查核與重現，尚未修改或發布產品程式。測試 JSON、截圖及重跑腳本位於 `output/duo-error-20260915/`；其中 `pwa-recovery.json` 是允許 Service Worker 的重現與重新載入恢復證據。早期隔離測試因刻意阻擋 SW 而產生的 SW registration 警告屬於測試環境，不列為產品故障；WebKit 的 OAuth redirect domain 提示也未阻止健康案例的匿名 Duo 進場。

**修正實作（2026-09-15）**

設定檔與 SDK／client 初始化在完成或失敗後釋放進行中 Promise，設定檔有 8 秒期限；匿名登入成功才標記就緒。恢復成功時重新觸發 presence 與雲端同步的啟動流程，重試時清掉舊錯誤提示。瀏覽器若已記住 SDK import 失敗，明確進入對決時會先完整讀取失敗資產（WebKit 透過建置產生的 SDK manifest 找到相依檔），確認可用且沒有活躍對局後，只自動刷新一次並回到對決。設定檔／登入失敗不需要刷新頁面。

新增設定檔錯誤／逾時、並行共用、登入前狀態、SDK 刷新循環與對局安全保護測試。正式打包的 Chromium／WebKit 六種故障恢復情境已通過；SDK／登入故障注入測試阻擋 SW，避免 SW 命中繞過注入，設定檔案例允許 SW。實機與部署結果記錄於 progress.md 與 output。
