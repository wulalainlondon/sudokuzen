# PWA / iOS 分服

兩個版本共用遊戲程式碼與題庫，各自保存進度與新戰績。平台識別為 `pwa` / `ios`，一般版本升級沿用同一資料區。

| 版本       | Firebase 專案            | Cloudflare Worker | Firebase Auth app |
| ---------- | ------------------------ | ----------------- | ----------------- |
| PWA        | `sudokuzen-f2aa3`        | `duo-pwa`         | `sudoku-pwa`      |
| iOS        | `sudokuzen-ios-prod`     | `duo-ios`         | `sudoku-ios`      |
| 分服前來源 | `sudokuzen-f2aa3` 根集合 | `duo-party`       | `[DEFAULT]`       |

正式對照表在 `config/app-editions.json`。新資料一律位於 `editions/{edition}/...`，Firestore 規則僅開放該專案的版本；兩個 Worker 使用獨立 Durable Object namespace，驗證各自 Firebase ID token 的簽章、issuer、audience，以及 `edition` / `protocolVersion: 2`。正式客戶端不接受 localStorage 的伺服器覆寫。

單人新榜的鍵為 `模式_關卡編號_完整81格盤面`。一般與競速分開，競速按提交次數、完成時間排序。同一榜的首次通關不可覆寫，排行榜與玩家的清理索引在同一交易建立。

## 既有資料

- 原始本機鍵保留，單人／修行／成就／世界進度與存檔延續。
- PWA 延續舊雙人勝敗、連勝、對手紀錄與已解鎖內容；iOS 的新戰績獨立累計。舊雙人原始紀錄仍可在統計頁查看及匯出。PWA 以舊紀錄加分流後紀錄顯示累計，底層新計數保留原格式，以相容仍使用前一版的頁面。
- 原 `[DEFAULT]` 登入只讀取相符 UID 的舊玩家檔案，不建立新的舊帳號。新版本使用自己的 named Auth app；遷移時不改寫原本的旅程解鎖標記。
- 舊雙人歷史另存為目前版本私有 `player_profiles/{playerId}/legacy_history`，以最多 200,000 字元的 JSON 字串分段，避免 Firestore 文件大小與巢狀深度限制。所有分段與目前進度寫入完成，才標記遷移成功；中斷後可重試，來源不刪除。
- PWA 的關卡準備、暫停與通關榜直接顯示既有首通榜，同時另列目前盤面的模式／指紋榜；兩份榜不混排，因為部分舊題目已更新。iOS 的關卡準備頁保留可展開的「分流前歷史榜」。舊榜沒有平台標記，原始榜單完整保留。
- 更新時仍有舊房號者，整個頁面維持舊身分與服務至該房結束；回到選關頁後重新載入，再開始分服。舊房清除後禁止另開舊房。

## 建置與驗證

PWA 使用 `npm run build:firebase`，GitHub Pages 使用 `DEPLOY_TARGET=github-pages npm run build` 後執行 `node scripts/prepare-pages-dist.mjs`。

iOS 使用 `npm run ios:prepare`，它固定 `APP_EDITION=ios`，並驗證包內 `app-edition.json`、目前 Firebase 專案、對戰 host、遷移用來源設定及無除錯覆寫。執行前須備妥 gitignored 的 `public/firebase-config.js` 與 `public/firebase-config.ios.js`；可由 Firebase CLI 的 SDK JSON 透過 `scripts/write-firebase-runtime-config.mjs` 產生。

後端部署為 `wrangler deploy --env pwa` / `--env ios`。PWA Firestore 使用 `firebase.json`，iOS 使用 `firebase.ios.json`；保留原 Worker 與 PWA 根集合規則以相容尚未更新的客戶端。

`scripts/verify-edition-backends.mjs` 以臨時匿名 QA 帳號驗證正式服務的跨版本、跨專案、跨擁有者拒絕與排行榜交易，最後清理測試資料和帳號。`duo-party/src/edition-qa.mjs` 驗證本機兩個環境同房號仍互不相通。`scripts/verify-edition-ui.mjs` 驗證 Chromium / WebKit 的手機畫面、匯出、歷史榜與完整雙人對局；此項 UI 測試只替換 Firebase 身分與儲存，對戰使用實際本機 Worker。執行 UI 測試前重啟兩個 Vite server，避免 HMR timestamp 造成測試直接 import 的模組與產品模組重複。

## 刪除與回復

刪除玩家資料只清理目前版本的玩家檔案、存檔、歷史備份、排行榜索引／成績、在線狀態與主辦房索引，再刪除目前 named Auth 帳號；不刪除其他版本及分服前來源的帳號／資料。來源 `[DEFAULT]` 在本機登出，原本資料仍可供舊版使用；來源資料另行清除可透過支援申請。完成的 DO 房間依既有 24 小時 TTL 移除。

回復前端時不可刪除新資料區。已遷移玩家的進度與新戰績保留在各自 named app / namespace；不得用舊前端回復後的來源成績覆寫新榜。舊 Worker 維持部署，供尚未更新者及更新中舊房使用。正式發布先驗證隔離後端，再更新 PWA，並在新 iOS Build 通過驗證後替換送審版本。

## 2026-09-30 發布紀錄

PWA 兩個正式網址已發布 `2026.09.30-V2`，線上版本、Service Worker、離線開局與 iPhone Safari 的 PWA 分服設定已確認。iOS `1.0 (7)` 內附相同遊戲版本，通過 iPhone 11 升級遷移、完整單人解題、存檔結算、世界重啟保存、雙人主客機兩場對局、Release 版 XCTest 筆記／數字觸控與模擬器開局；測試後原裝置資料已還原。

Build 7 於台灣時間 2026-09-30 23:32 重新送審，狀態為 `WAITING_FOR_REVIEW`；仍採手動發布。四語商店文字、20 張圖片、審查聯絡資料與備註已逐項回讀核對。App 主介面與教學仍為繁體中文。正式發布資料見 `docs/platform-isolation-release-20260930.json`。

## 2026-10-01 PWA 戰績接續

- `getLifetimeDuoProfile()` 僅對 PWA 加總原始本機／雲端舊基準與分流後計數。重整、重試或前版頁面寫入不會再次加總入儲存，也不會扣除已完成的新場次。
- 只有未中斷的新連勝才延續原連勝；敗／和之後仍保持歸零。跨分流的最佳連勝以單調最大值保存，後續敗場不會抹掉高峰。
- 舊最佳紀錄及回放與目前紀錄在讀取時擇優，寫入仍僅記錄目前的新成績，避免複製大量回放造成 localStorage 額度不足。原始資料不刪除。
- PWA 每次成功載入會以原始 Auth 所屬 UID 讀取自己的舊雲端資料，補足舊基準；新雲端玩家檔案另保存 `journey.pwaBaselineProfile`。舊歷史分段以 SHA-256 判斷內容變更，未變更時不重寫。
- iOS 的計數、資料庫、對戰服務與 Build 7 審查維持獨立；本次發布更新 PWA。
