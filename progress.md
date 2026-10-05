Original prompt: 幫我用這個檢查我的關卡 是否都是唯一解

Current prompt (2026-07-30): 找出連續對戰第二局結果不同步問題，修復並以 S10+ / i11 實體 PWA 完整驗證。

- 13:00 後 i11 已真正加入主畫面：SpringBoard Web Clip `Sudoku` 存在，`com.apple.webapp` 前景、無 Safari 工具列，實機截圖讀到 V6。
- 真 PWA 新房 `r_kub9rqbqms71qzxa`：i11 玩家9233 建房，S10Ezu4g 加入，雙方準備／開局；i11 原生觸控首格後雙端同步 2%，再以 109.99 秒逐格真實點擊完成，S10 看到對手 100% 與「玩家9233 已完成」。
- S10 快速完成後雙方權威結算一致（玩家9233 03:14 勝、S10Ezu4g 04:17 敗），但抓到自己進度文字仍停 96%；已在非認輸 finish 時直接校正本機進度為 100%，並把雙端 100% 斷言加入快速連填三連戰回歸。
- 2026-07-30 11:35 實機同房 `r_7o36gi0ems6y1uji`：S10+ 由 2% 快速填至本機 98%，i11 僅收到 96%，直接重現 leading-only 進度 throttle 遺失最後中間值；S10+ 最後一格完成後，i11 由權威 finish 校正為 100%，並顯示「S10Ezu4g 已完成」。
- 已把進度節流改為 leading + 單一 trailing submission，並在 rematch/reset/新局清除 timer，避免快速連填時對手長時間落後一筆。
- `duo-live-2` 三連戰新增「第一局先停最後一格、兩端進度必須一致才准完賽」回歸；舊正式 V4 可抓到 timeout 失敗。
- pre-commit 依專案規則將正式版本升為 `2026.07.30-V6`；commit `caf44b6` 已推 main，Pages/CI/Firebase Preview 全成功，正式站 HTML 與 SW 均讀回 V6。
- `npm run check:ci` 通過（46 files / 313 tests）；V6 正式站新增的快速連填 trailing-progress gate 與同房三連戰通過（1/1，57.2s）。
- 真機限制證據：SpringBoard icon state 不含 SudokuZen/Web Clip，i11 目前實測頁是 Safari（`com.apple.mobilesafari`），不是已安裝的 home-screen PWA；iOS 26 WebView 在目前 DVT/XCUITest 遠端觸控下可讀取元素但點棋盤／認輸沒有送入頁面，因此尚不能誠實宣稱 i11 PWA 多局觸控驗證完成。
- 正式站 WebSocket frame trace 證明原先第二局「沒有結果」不是產品漏送：舊 E2E 在 `countdown` 階段誤把上一局殘留棋盤視為新局，且用回溯解答而非當局權威 solution，導致填錯／填舊棋盤而沒有送出 finish。
- `duo-live-2` 已改為：從權威 roomState 取得 tier + puzzleSeed、載入對應 Duo shard 的 canonical solution、等待房間畫面真正關閉與新棋盤顯示、依現行協議由一方提出同房 rematch。
- 正式站完整 edge suite 已通過：錯誤輸入與 cooldown、對手斷線自動沒收、同房三連戰、15 秒離線後重連完賽；4 tests passed（3.2m）。
- 實機狀態：S10+ 已透過 ADB/CDP 連線；i11 雖然 Xcode CoreDevice provider 異常，已改用 `pymobiledevice3` 的 userspace tunnel + DVT，能直接執行既有 XCTest Runner 與擷取 828×1792 真機畫面。
- i11 真機畫面已直接確認一局結算：`S10Ezu4g` 對 `玩家4751`，雙方皆顯示認輸、平手，結算畫面可按「再來一局」。證據：`output/duo-physical-20260730/i11-before.png`。
- i11 的 Safari Web Inspector 目前仍為關閉；已新增 XCTest 自動開啟設定的測試並成功 build。安裝更新 Runner 時裝置再次自動鎖定，需解鎖並保持螢幕亮著後續跑真機多局／斷線驗證。

Current prompt (2026-07-29): 使用 iPhone 16 Pro 實測 PWA 雙人建房失敗；修正、驗證並部署可更新版本。

- 已用 XCUITest 在 iPhone 16 Pro（iOS 26.5.2）重現：建立房間後仍停留大廳，稍後在清單看到自己的等待房；正式後端 smoke 通過，定位為 iOS PWA 的客戶端訊息時序情況。
- `duoSocket` 已加入權威座位恢復：只有 room id、角色與 player id 全部吻合才採納伺服器已分配的 host/guest 座位，涵蓋 create/join/resume；token 完成後會先立即採納，不依賴可能被背景節流的 timeout。
- 新增 request race 回歸測試，模擬權威 `roomState` 先到且原 request 回覆遺失，確認房間成功且 socket 不被關閉。
- PWA 版本升為 `2026.07.29-V4`，使 service worker / standalone PWA 取得本次更新。
- 修正正式站完整對局 E2E 的過期房號 DOM selector，改驗證實際 active room id，避免建房已成功卻等不存在元素五分鐘的假失敗。

Current prompt (2026-07-27): 把 Chrome + S10+ 十場雙人耐久測試發現的斷線恢復、倒數幽靈局、等待房重新公開、連續戰鬥、殘留進度、建房連線與 Firebase 權限問題逐項修復，完整驗證後再回報。

- 已完成正式站十場雙人測試並保留 `output/duo-adb/` 證據。
- 已定位根因：Duo profile 未正規化、Duo 誤寫單人存檔、倒數取消未清本地 GO timer、WS lobby breadcrumb 永久忘記、再來一局只是關房回大廳、WS 首次 connect error 立即失敗。
- 已開始新增房間/角色/seed scoped 的本地盤面快照與 legacy profile 正規化。

Current prompt (2026-07-24): 以 PM 角度選定真實賣點，在不改整體內容下重排功能解鎖章節，並依目前 iOS 送審要求把專案推到可提交 App Store 的狀態；目前不做營利。

- 已讀取並套用 develop-web-game skill，先檢查現有驗證工具。
- 發現專案已有 `verify_levels.js`，可直接檢查每個關卡是 0/1/多解。
- 執行 `node verify_levels.js`：230/230 都是唯一解（0 多解、0 無解）。
- 另外用 `sudoku_unique_checker.py` 直接讀 `levels.js` 再驗證一次，結果一致：全部唯一解。

TODO / handoff:
- 若要做 CI，可新增一個 `npm script`（例如 `check:levels`）固定跑唯一解檢查。
- 已新增 `nirvana_filter.py`：可直接讀 `levels.js`，輸出 `nirvana_candidates.json` / `nirvana_rejects.json` / `nirvana_report.md`。
- 預設條件（17-19 clues、唯一解、logic-only、min-score=35、single_ratio<=0.65）在目前題庫下結果為 0 題通過，符合現況資料分佈。
- smoke test（30-45 clues + 寬鬆門檻）可正常產生候選（107 題），代表流程可執行。
- 已將 `generate_and_filter_nirvana.py` 升級成兩階段：
  1) Stage1 先收集大量「唯一解」pool；
  2) Stage2 再批次做 logic + score 篩選並挑最終關卡。
- 新增 Stage1 pool 輸出：`nirvana_stage1_pool.json`，方便後續反覆調參，不用每次重挖。
- 新增挖洞參數：`--dig-restarts`、`--dig-probe-limit`，提高低提示數（17-19）命中機率。
- 再次優化 Stage1：改成「貪婪降到橋接 clues + 限制節點回溯挖洞」，可突破純貪婪卡住的局部最優。
- 新增參數：`--dig-bridge-extra`、`--dig-bridge-floor`、`--dig-backtrack-branch-limit`、`--dig-backtrack-node-limit`。
- 新增唯一解快取（`UniqueCounterCache`）與報表統計（cache size/hit/miss）。
- 新增 `--seed-list`（多隨機流）可在單次執行中混合多組 seed，提高稀有盤面探索覆蓋率。
- 新增 `batch_generate_nirvana.py`：可批次多次執行 `generate_and_filter_nirvana.py`，自動合併、去重、按 clues 目標挑選最佳題目。
- 批次輸出：
  - `nirvana_merged_unique.json`
  - `nirvana_merged_selected.json`
  - `nirvana_batch_report.md`
- 17/18/19 快速進度檢查（2 runs, seed 11/13, 輕量參數）目前仍為 0 題；已在 `out_nirvana_batch_17_19_progress/nirvana_batch_report.md` 記錄。
- 新增 `run_nirvana_preset.py`：一鍵選 `1/2/3` 跑批次參數（quick/medium/aggressive），可用 `--dry-run` 先看實際命令。
- 已匯入 17-clue 公開資料集到 `external_data/puzzles2_17_clue.txt`，並新增授權/來源說明 `external_data/17clue_LICENSE_AND_SOURCES.md`。
- 新增 `import_17clue_dataset.py`，可將 txt 匯出成 `external_data/puzzles2_17_clue_levels.json`（目前已產生 49,158 筆，全部 17 clues）。
- 已將 `levels.js` 中最高難度 `NIRVANA 寂滅` 的 40 題（id 161~200）替換為匯入資料集中 40 題 17-clue 題目，並補上對應解答。
- 檢查結果：NIRVANA 40 題提示數分佈為 `{17: 40}`，且 40 題唯一解檢查全數通過。
- 已新增三個寂滅以上分頁與關卡：`空鏡`(stars=6)、`星潮`(stars=7)、`玄鏈`(stars=8)，各 40 關，總關卡擴充至 350。
- 新增腳本 `generate_transcendent_levels.py` 產生上述 120 關，並在關卡資料附上 `advancedTag`（XY-Wing/Swordfish/AIC proxy）。
- `index.html` 已新增三個分頁按鈕（switchTab 6/7/8）。
- 全量唯一解驗證：350/350 皆唯一解（0 無解、0 多解）。
- 分頁文案已改為純中文：`初心者/禪/虛空/無我/本源/寂滅/空鏡/星潮/玄鏈`。
- `nirvana_filter.py` 已新增 `XY-Wing` 真實技巧判定（`apply_xy_wing`）。
- 已把 `空鏡` 40 關改成「XY-Wing verified」真分類關卡（trace 含 `xy_wing`），且 `空鏡` 40/40 唯一解。
- `nirvana_filter.py` 已新增 `Swordfish` 真實技巧判定（`apply_swordfish`）。
- 已把 `星潮` 40 關改成「Swordfish verified」真分類關卡（以 swordfish-priority 技巧序驗證 trace 含 `swordfish`），且 `星潮` 40/40 唯一解。
- `nirvana_filter.py` 已新增 `AIC` 真實技巧判定（`apply_aic`，forcing-chain 形式）。
- 已把 `玄鏈` 40 關改成「AIC verified」真分類關卡（AIC-priority 技巧序驗證 trace 含 `aic`），且 `玄鏈` 40/40 唯一解。
- 新增 Firebase 首通榜功能（`index.html`）：每關顯示 TOP 3 首通時間與星數（暫停畫面 + 通關畫面）。
- 新增 `firebase-config.js`（預設 `null`，待填專案 config）與 `FIREBASE_SETUP.md`（設定步驟 + Firestore 規則建議）。
- `sw.js` 快取列表已加入 `firebase-config.js`。

- 已移除數字鍵盤右上角剩餘數量提示（num-remain），保留完成淡化僅 Beginner 生效。
- Numpad 回復為純數字顯示（無角標）。
- 嘗試啟動本機 http.server + Playwright client 測試，但未產生任何截圖/輸出（需要再確認 client 參數或輸出路徑）。

- 新增強制版本號檢查：index.html 內建 APP_VERSION，若偵測版本不同就清除 SW/Cache 並 reload。
- sw.js 更新為版本化 CACHE_NAME（2026.02.06.1）。
- 嘗試安裝 playwright 以跑 web_game_playwright_client.js，但因 network ENOTFOUND 無法下載套件；因此未能產生測試截圖。

- 新增右下角版本號顯示（version-badge），並將 APP_VERSION 升級為 2026.02.06.2；sw.js CACHE_VERSION 同步。

- 版本號徽章移到選關畫面（level-screen）內，遊戲中不顯示。

- 將 Notes/Erase 迷你按鈕移到計時器右側，並移除底部 controls 中的 Notes/Erase。
- 調整 numpad 底部 padding（含 safe-area），避免底部被切。

- Theme 按鈕移到計時器右側（與 Notes/Erase 同列），底部 controls 僅保留容器。
- Notes/Erase/Theme 改為圓形 mini buttons。

- 解析星潮關卡 id=9100（星雲躍遷）之邏輯解題：logic_solve trace 共 65 步，包含 1 次 XY-Wing（pivot r2c1, wings r2c4/r3c2，消去 r3c6 的 8），其餘為隱性/顯性單數。

- UI 修正：將 `.sudoku-grid` 與 `.grid-info-bar` 改為固定上限寬度 `min(100%, 420px)`，並移除 `max-height` 斷點中的 `vh/dvh` 棋盤覆寫，避免通關星星動畫後棋盤尺寸跳動/變形。
- 關卡卡片尺寸統一修正：`#level-list` 改為固定 `grid-auto-rows`（依 5 欄計算），`level-item` 使用 `width/height:100%` + `overflow:hidden`，避免有星星/時間時撐高。
- 關卡卡片內容高度統一：未通關卡片也渲染星星/時間佔位（`is-empty` + `visibility:hidden`），確保各分頁與通關狀態視覺尺寸一致。
- 已嘗試用 Playwright 本地截圖驗證（output/level-size-check/shot-0.png）；在沙箱需提權才能啟動瀏覽器。
- 二次修正（卡片尺寸）：改用 `syncLevelCardSize()` 以每張卡片實際寬度回寫高度（`height = width`），並在 `renderLevelGrid()` 後與 `resize` 時同步，避免 CSS row 百分比在不同容器高度下失準。
- Playwright 實測（414x896, 混合已通關資料）結果：禪/虛空分頁 `level-item` 皆為 `w==h`（約 65.19/65.20px，差異為子像素四捨五入）。

- 產品主軸定為「每一招都能被證明的數獨修行」：一般關卡 → 技巧修行 → 世界試煉 → 雙人道場。
- 已新增全域章節閘門：一般 3 關解鎖修行；完成教學、3 次定向練習與實戰證明後累計修行 Lv.；Lv.1 解鎖世界、Lv.3 解鎖雙人；既有玩家進度保留。
- 已加入 iOS PrivacyInfo、隱私／支援頁、App 內資料刪除入口、Firebase ownerUid 權限與刪除 Function，並移除不安全的暱稱找回資料路徑。
- 已為已結束 Duo Durable Object 房間加入 24 小時自動刪除。
- `npm run ios:prepare` 已成功：production build、Capacitor sync、隱私與 icon 檢查皆通過。
- `npm run check` 已完整通過：39 files / 287 tests，TypeScript、ESLint、Prettier 全部成功。
- unsigned archive 已成功；iPhone 17 Pro Max / iOS 26.4.1 simulator build、安裝與啟動成功。
- 原生首次啟動曾發現 normal shard 與 React takeover race，已在 shard ready 後 refresh，模擬器目視確認 27 境界節點正常出現。
- Firebase Hosting、Firestore rules、Functions 已部署；隱私頁、支援頁、旅程首頁 live smoke 成功。
- live 刪除測試發現 collection-group index 缺口，已部署 `players.ownerUid` index，等待 READY 後重測。

TODO / handoff (current):
- Cloudflare `wrangler` 登入已過期；需重新登入後部署 Duo 24h TTL。
- 實機 smoke 尚未執行；模擬器已通過。
- App Store Connect、Apple Distribution signing、法定賣方名稱與送審仍需帳號持有人完成。

- Release QA 收斂：Firestore Duo lobby 禁止 update takeover；Duo `abort`/`closeResult` 要求已認領座位；雙方結束後即排程 24h 刪除。
- iOS 不再呈現玩家自填暱稱，改為本機固定產生的公開名稱；web 版仍保留原功能，避免把 UGC 審核與檢舉機制帶入首版。
- 舊版 `sudoku_duo_records` 亦列入回鍋玩家解鎖承接；單純閱讀教學不會跳過三次練習＋實戰證明。
- `npm run check:release` 已涵蓋主程式、Functions 與 Duo Worker；主程式目前 39 files / 288 tests。
- `players.ownerUid` collection-group index 已 READY；正式環境帳號建立 → callable 刪除 → token 失效的端到端測試成功。
- 5 張 App Store 6.9 吋截圖已重產並目視檢查：1320×2868、無 alpha。
- Firebase Hosting、Firestore rules/indexes、Functions 已再次正式部署至 `https://sudokuzen-f2aa3.web.app`。
- 最新 unsigned Release archive 再次成功，`build/SudokuZen.xcarchive` 可供本機檢查；仍不能取代 Apple Distribution 簽章。
- Release bundle 技術債已收斂：Vite 依 locale、solver、skills、world、duo 分 chunk，最大自有首包由約 967 KB 降至約 341 KB。
- `npm run build:firebase` 原本的 600 KB chunk gate 已由失敗轉為通過；拆包後技巧圖鑑、世界與棋盤商店畫面重新載入成功，未出現 console/page error。
- 拆包版已部署 Firebase Hosting，live 等待初次版本 reload 完成後可開啟 40 張技巧卡；iOS 亦重新 sync/archive 成功。
- 3 個未被 asset catalog 指派的舊 Splash PNG 已移至 `build/unused-splash-assets/` 備份，Xcode archive 不再出現 Splash children 警告。
- 新增 `npm run ios:archive:app-store`：要求 `APPLE_TEAM_ID`、檢查 Apple Distribution identity，再建立 signed archive；缺少兩種憑證條件時皆已驗證會提前拒絕。
- 2026-07-24 最終 completion audit：章節門檻原始碼／測試、商店欄位長度、PrivacyInfo、1024 icon、5 張 1320×2868 截圖、archive bundle ID/version/內嵌 privacy 均有直接證據。
- 最終重跑 `npm run check:release`（39 files / 288 tests）與 `npm run build:firebase`（所有 chunk <600 KB）成功，最新 dist 再次部署，首頁／privacy／support／data manifest 均 HTTP 200。
- 未完成項有權限層直接證據：Wrangler token expired；環境無 CF token；Keychain 無 Apple Distribution；無 provisioning profiles、APPLE_TEAM_ID、signed App Store archive。需帳號持有人登入後續作業。
- 依 Apple 官方 App Store Connect KB 整理 `docs/app-store/full-submission-runbook-zh-TW.md`，涵蓋建檔、2026 SDK／年齡分級要求、隱私、價格與地區、DSA、出口合規、輔助使用標示、上傳、送審與發布。
- Release verifier 現在要求 Xcode 26／iOS 26 SDK，並確認 App、Capacitor、Cordova 的 PrivacyInfo 都被帶入 archive；本機 Xcode 26.4.1／SDK 26.4 驗證通過。
- 發現最高難度 40 題源自 Gordon Royle minimum Sudoku collection（CC BY 2.5）；已新增公開 `credits.html`、App 設定入口與送審說明，明列來源、改作與授權。
- 最新 Hosting 已部署；`https://sudokuzen-f2aa3.web.app/credits.html` 與 support 內授權連結皆 live 驗證成功。

- 2026-07-24 App Store Connect：建立 `SudokuZen 數獨修行`（Apple ID 6794248919），繁中 metadata、5 張 6.9 吋截圖、4+ 年齡分級、免費價格、175 地區、Manual Release 與 App Privacy 均已設定。
- build 1 雖為 `VALID`，但 completion audit 直接在 IPA 發現 `firebase-config.js` 為 264-byte 空白範本，因此作廢且不得送審。
- 根因為 `prepare-pages-dist.mjs` 在 Vite 複製 `public/firebase-config.js` 後，又以 root placeholder 覆寫；已改為優先採用 `public/` 的 runtime config，並在 iOS verifier 加入必要 Firebase 欄位 gate。
- 透過 Firebase CLI 安全取得 Web App SDK config，實值只存在 gitignored runtime artifact；重建並重新部署 Hosting，live config 已確認包含必要欄位。
- 新增 `duo-party/src/prod-smoke.mjs`，正式環境通過 Firebase Anonymous Auth、host create、guest join、playing、host finish、finished；測試匿名帳號均自動刪除。
- build 2 已以 Apple Distribution `YuDi Huang (UPWLTJL6S2)` 匯出並上傳；SHA-256 `6cbdefe213aa382bf3b831d4105ead35e7cba7d7a0f3d011d41f6ea28695d2a2`，IPA 內已驗證 Firebase config、三份 PrivacyInfo、Bundle ID `com.wulala.sudokuzen`、`1.0 (2)` 與 `get-task-allow=false`。
- App Store Connect 已將 build 2 處理為 `VALID`，並成功 attach 到 iOS 1.0 後 read-back 為 build 2。
- 使用者已明確授權沿用 Lucky 3 的 App Review 聯絡資料；已安全寫入 SudokuZen，未將實值存入專案文件。
- App Store Connect 已建立版本 1.0（build 2）的送審草稿；最終 API 稽核通過：app、submission 均為 `READY_FOR_REVIEW`，build 2 為 `VALID`。
- 2026-07-24 21:02（Asia/Taipei）取得最後即時確認並正式送出 App Review；App Store Connect UI 與 API 均讀回版本／submission 為 `WAITING_FOR_REVIEW`，build 2 維持 `VALID`。
- 本機 KB 已補上「經明確授權後沿用既有 App Review contact」的安全流程與 Lucky 3 → SudokuZen 驗證紀錄；依 KB 原有安全規則，不保存個人聯絡實值。

- 2026-07-26 PWA 雙人對戰修復：舊玩家身分承接與旅程解鎖相容、對戰入口連線狀態／逾時／錯誤提示、WebSocket 房間角色續接均已完成。
- PWA 顯示版本更新為 `2026.07.26-V2`；Firebase Hosting live smoke 已通過。
- 發現舊玩家安裝來源為 GitHub Pages，該站仍停在 `2026.06.17-V4`；準備將修復推送至 `main` 觸發 Pages 發布。
- 修正 Pages workflow：由 `dist/index.html` 解析真正的主 JavaScript entry，避免拆包後誤抓 8 KB 次要 chunk 導致 CI 假失敗。
- 發布前重跑 `npm run check:release`：42 files / 296 tests、Functions、Duo Worker dry-run 全部通過；GitHub Pages build 與 smoke test 讀回 `v2026.07.26-V2`。
- GitHub Pages `2026.07.26-V3` 已發布；live HTML、Service Worker 與首頁版本徽章均讀回 V3。
- live 真實點擊驗證發現鎖定入口使用 `aria-disabled=true`，Playwright／輔助操作無法啟動鎖定說明；已改為保持按鈕可操作並用 `aria-description` 說明門檻。
- 新增 journey 回歸測試，確認四個鎖定入口皆可點且仍保留鎖定 class／門檻描述；本機實點後顯示 4 秒紅色「修行 Lv.3 開啟對決」提示，無 console/page error。
- V4 live 首載壓力測試定位到版本更新清快取期間 `feedbackToast` 尚未初始化，點擊雖進入鎖定判斷但提示被靜默丟棄。
- `showFeedback()` 現在會按需建立提示元件；新增 early-tap 回歸測試。本機模擬首次 PWA 更新後立即點對決，已目視確認紅色門檻提示正常且無錯誤。
- 2026-07-26 對戰入口緊急修復：不再只靠 `LEGACY_PLAYER_ID` 判定舊 PWA；standalone 安裝版 PWA 一律沿用舊規則，修行／世界／對戰直接開放，Capacitor iOS 原生版仍保留旅程門檻。
- 新增 journey 單元測試（standalone PWA 解鎖、native 不繞過）與 `e2e/pwa-duo-entry.spec.ts`；standalone 無任何舊儲存標記時，實點已成功進入「Duo 對戰大廳」，畫面與連線中狀態均目視確認。
- 2026-07-27 Duo 十場實機回歸後修復：部分 profile 正規化、房間／角色／題種 scoped 盤面保存、雙端重載續局、開局倒數斷線取消、等待房重新發布、同房再戰、每局進度歸零、連線首個瞬斷容忍，以及 Duo 不再污染單人雲端存檔。
- 新增 WebSocket 韌性 E2E：雙方落子後同時重載仍保留盤面／進度並可同房再戰；倒數斷線連續五輪都回到等待房且重新標記為公開。視覺檢查等待房無幽靈棋盤。
- `npm run check:release` 全綠：43 test files / 306 tests，主程式、Functions、Duo Worker typecheck／lint／format／dry-run 全部通過。
- Duo Worker 已部署，Version ID `2e945779-5c72-4c20-931a-0972c71cc5c6`；前端版本升為 `2026.07.27-V8`，待 GitHub Pages 發布與 Chrome／S10+ 正式環境最終十場驗證。
- 2026-07-27 iPhone 11 + S10+ 正式 V9 邊界實測：雙端建房／加入／準備／開局及各自正確落子後，兩端進度皆同步為 2%；i11 Safari 強制終止超過離線判定後於寬限內重開，可恢復原局與 2%/2% 進度。
- 同輪發現新的雙斷線邊界：兩座位都由 alarm 判定 `finishTime=9999` 時，房間仍停在 `playing`，導致前端顯示「再來一局」但 server 以 `bad_state` 拒絕 rematch。
- 已在 Duo Durable Object alarm 加入「雙方皆有 finishTime → status=finished、停止 presence 輪詢」；`phase3-qa.mjs` 更新為要求 `finished`，並直接驗證雙沒收後 rematch 回 `waiting`、雙方 finishTime 歸零。
- 實機完整終止兩端瀏覽器 45 秒後再開，確認 server 已是 `finished` 且兩座位可重新認領，但前端因重啟後 `gs.isDuoMode=false` 忽略首次 finished snapshot，呈現空白房間骨架；已移除此錯誤守衛，讓經過 server-authoritative hello 認領的 finished 房直接顯示結算。
- V11 再測發現冷恢復結算後雖可 rematch，`waiting` snapshot 仍因 `gs.isDuoMode=false` 未執行結果遮罩清理，造成準備鈕存在但被遮住；finished 冷恢復時同步還原 Duo mode，確保 rematch 會進入 `enterDuoRematchRoom()` 並關閉遮罩。
- S10+ 快速填完實機展示時，iPhone 已進觀戰但對手進度停在 98%；原因是最後一格的 progress 被 1 秒節流，而 finish 先抵達。對手 finish 已是 server-authoritative 完成證據，UI 改為 `oppFinished` 時直接顯示 100%。
- 2026-07-28 玩家影片確認新競態：建立房間已由 server 成功發布，但前端在 `send(create)` 後才註冊一次性 waiter；快速 direct `roomState` 會先被 pump 消耗，建立者逾時留在大廳並看到自己的孤兒房，重試會產生重複房。
- `duoSocket` 已統一改為先註冊 waiter 再 send，涵蓋 create、join、resume、斷線 reclaim；新增同步回應回歸測試，直接模擬 server 在 `send()` 內立即回覆。
- 正式站 `2026.07.28-V2` 已發布；S10+ 實機連續 10 輪「建立 → 進準備房 → 離開 → 重新整理大廳」全數通過，進房耗時 1.5–2.6 秒，每輪 active room 均清空、建立鈕未卡住、自己的房間未殘留，且無 page/console error。
- 已把剩餘回歸缺口納入 CI：同步 ack 的 reconnect reclaim、建房 UI 成功／失敗狀態轉換與重複點擊鎖定、publish 尚未完成就離房時的 mirror 刪除競態；完整 release gate 現為 46 files / 312 tests 全綠。
- Wild CI 7 項失敗根因為 `clearGameData()` 清掉 Playwright storageState 注入的 `sudoku_e2e_mode`；已保留該旗標並加入前置斷言。本機 Wild 7/7、完整 smoke 26/26、release gate 46 files / 312 tests 全綠。
- 2026-07-29 App Store build 3 已以 Apple Distribution 匯出並通過 IPA 稽核：`1.0 (3)`、Bundle ID `com.wulala.sudokuzen`、內嵌前端 `2026.07.28-V2`，SHA-256 `e9485bbf1361f847cfc1755ebd255039aa5a1c904236f2b066655d4f3faf9d49`。
- build 3 上傳後由 App Store Connect 處理為 `VALID`；舊 build 2 的 `WAITING_FOR_REVIEW` submission 已撤回並完成，版本改掛 build 3 後重新送審。
- 2026-07-29 14:16:29（Asia/Taipei）最終 API 回讀：App 與 review submission 均為 `WAITING_FOR_REVIEW`、attached build 為 `3/VALID`，新送審已進入 Apple 排隊。
- 同輪 GitHub 核心 CI（typecheck、lint、format、312 unit tests、build、E2E smoke）與 Pages 均通過；Firebase Preview 假紅燈根因為 repository 未設定 `FIREBASE_SERVICE_ACCOUNT`，workflow 已改為缺少憑證時明確 notice 並跳過遠端部署。
- 2026-07-30 真實 PWA 對戰：iPhone 11 standalone PWA（玩家9233）建立房間 `r_kub9rqbqms71qzxa`，S10+ Chrome WebAPK（S10Ezu4g）加入；名稱、準備、倒數、雙端落子進度與結果一致。第一局由 i11 原生逐格完成、S10+ 再完成，雙端正式結算；同房 rematch 後題目與進度均重置。
- 實機快速輸入找到兩個進度邊界並修復：節流期間的最後 progress 改為 trailing flush；本機正常完成立即顯示自身 100%（認輸 9999 不偽裝完成）。正式 live 三局同房 E2E 通過，完整 gate 為 46 files / 313 tests。
- 第二／三局強制終止 i11 PWA 找到重連競態：replacement socket 已 hello 認領後，WebKit 延遲送達的舊 socket close 會重新掛上沒收計時。Duo Worker 現在偵測同座位已有有效 socket 時忽略舊 close；精準 QA 與既有 alarm／雙斷線／認領安全共 23/23 通過。
- 將 iOS 冷啟動恢復時間統一：active-room resume 12s → 45s、Worker playing 沒收寬限 30s → 60s、client reconnect failure 45s → 75s。新增 GitHub CI `duo-worker` job，自動執行 Worker typecheck、dry-run 與 23 項 Phase 3 QA。
- V9 實機第四局：i11 process kill 後 9.4s 回同一盤；從 kill 起跨過 62s，每 5s 讀取 S10+ 均為綠燈、2%/0%、無誤結算；i11 在截止後原生輸入正確 4，S10+ 立即同步為 2%/2%。S10+ 正常完成 100%，i11 後續固定座標因先前捲動偏移而耗盡生命，S10+ 權威結果正確顯示玩家9233認輸、S10Ezu4g 勝 05:57。
- 最新正式版本：前端 `2026.07.30-V9`；Duo Worker Version ID `ee5cf3c6-7366-4f69-8304-7e63049276d4`；修正 commit `9958777`（stale close）與 `d1172b9`（cold reconnect grace）均已推至 `main`。
- 2026-07-30 Duo 體驗優化第一批：standalone PWA 若保有有效房間座位，會在首頁首次穩定繪製後自動返回原局，啟動時並行預載 Firebase Auth 與 Duo 房間模組；恢復期間顯示明確同步畫面，不再讓玩家停在首頁猜測。
- 對戰中連線中斷改為棋盤上方的非阻塞狀態膠囊，連回後自動消失；不會跳 modal 或遮住棋盤。手機視覺回歸另外發現並修正 Duo 進度 HUD 的 `width: 100%` flex 擠壓，414px 畫面已恢復橫向進度列。
- 新增冷啟動／連線 UI 單元測試與 `e2e/duo-startup-ux.spec.ts`；Chromium 2/2 通過，並目視檢查冷恢復及 414×896 重連畫面。
- 2026-07-30 Duo 體驗優化第二批進行中：PWA 新 Worker 不再於 install 階段直接 `skipWaiting`；若本機仍持有有效 Duo 房間座位，從遊戲、結算到 rematch 準備房全程延後接管與 reload，清除座位後才安全更新。
- 「再來一局」新增伺服器回覆等待狀態、spinner、重複點擊鎖定與 12 秒可重試保護；等待期間同時阻擋結果頁返回／回放操作，避免 server 已 reset、client 卻離房的競態。
- 第二批精準單元測試目前 16/16 通過；Duo UX Chromium 3/3 通過。第一次視覺回歸抓到測試直接 import store 的實例分岔，已改用正式 React bridge 統一狀態入口。
- 第二批完整 release gate 通過：51 files / 324 tests，Functions build、Duo Worker dry-run 與 Phase 3 QA 23/23 全綠；本機雙瀏覽器＋本機 Durable Object 實跑「完賽 → rematch → 同房準備 → 第二局進場」亦通過（15.5s）。
- 414×896 rematch 等待畫面已重拍目視：結果卡維持可讀、主按鈕顯示 spinner 與「正在返回準備區…」、返回動作降階且不可誤觸。
- 2026-07-30 iOS 送審版本稽核：原 submission 仍掛 build 3 / `VALID` / `WAITING_FOR_REVIEW`，但 IPA 僅內嵌 `2026.07.28-V2`，缺少其後建房 ack、進度 98→100、冷重連寬限、雙斷線結算與 V10/V11 UX 修正，因此判定必須換包。
- build 4 已使用 Xcode 26.4.1 / iOS 26.4 SDK 建立、Apple Distribution 遠端簽章並匯出；IPA 稽核確認 `1.0 (4)`、Bundle ID `com.wulala.sudokuzen`、`get-task-allow=false`、三份 PrivacyInfo、Firebase 必要欄位、內嵌前端 `2026.07.30-V11`。SHA-256：`af5806b3c1751139653e318bce2e22701b32520e4d0c23fdcd64eea00e874c71`。
- build 4 上傳後讀回 `VALID`；舊 build 3 submission 安全撤回並完成，版本 1.0 改掛 build 4。App Store metadata / 5 screenshots / 4+ / review contact、notes 與免 demo account 稽核維持完整。
- 2026-07-30 14:21:51（Asia/Taipei）最終 API 回讀：App 與 review submission 均為 `WAITING_FOR_REVIEW`、attached build 為 `4/VALID`，新 submission submitted date `2026-07-30T06:21:34.489Z`。
- 2026-07-30 14:29（Asia/Taipei）已把 SudokuZen 接入既有 Salon App Store Connect → LINE 即時通知管線：獨立路徑 `/apple-app-store/sudokuzen`、獨立 Keychain account `sudokuzen`，Webhook `3db077a9-ad2a-46d3-80b7-a394f0b2cc5f` 啟用 `APP_STORE_VERSION_APP_VERSION_STATE_UPDATED`。Apple 官方 Ping delivery `5c76d74b-a6e6-4874-8a06-ba34c7809ac3` 為 `SUCCEEDED`，receiver HTTP 200、LINE HTTP 200；送審狀態仍為 build 4 / `WAITING_FOR_REVIEW`。
- 2026-07-30 15:02（Asia/Taipei）針對「能否向 PWA 玩家宣稱雙人穩定」重新獨立驗收最新正式版 `2026.07.30-V11`：release gate 51 files / 324 tests、Duo Worker Phase 3 QA 23/23、正式 Worker 10/10 次 create/join/playing/finish 生命週期、正式站 6/6 邊界場景均通過。
- 正式站同房連打已提升為可設定 `DUO_LIVE_ROUNDS`，本輪以 10 局執行：每局 ready/countdown/換題/雙端 finish/result，9 次 rematch 全成功；第一局另驗證快速連填 trailing progress 在完賽前一致，雙端 100% 正確。
- 最新 V11 實機交叉驗證通過：S10+ Chrome WebAPK 建房、iPhone 11 iOS 26.5 standalone PWA 加入；雙方準備／開局，iPhone 收到 S10+ 2% 與 100%，認輸後名稱與勝負一致。再戰第二局後強制終止 iPhone PWA，8 秒重開恢復同一盤與 S10+ 名稱，沒有誤顯上一局結算；完成第二局結算後已清除實機 active room。
- 更新邊界實測：S10+ 原本停留在 V6 的有效舊結算房，V11 依設計延後 Service Worker 接管；退出舊房並重新載入後更新為 V11，`sudoku_app_version=2026.07.30-V11`。iPhone 11 standalone PWA 亦重新冷啟動並目視確認 `v2026.07.30-V11`。
- 2026-07-30 Steven 的 V12 iPhone 錄影確認「建房按鈕轉圈後仍留在大廳，自己的等待房逐次增加」；正式 Firestore breadcrumb 與 Durable Object 都證明房已建立，但 host heartbeat 只停在建立當下，約 32 秒後房間因離線關閉。
- 前端原本只處理 direct `roomState` 已進入 `pump()`、但一次性 waiter 錯過的競態；若 direct ack frame 完全遺失，會關閉 socket 並留下孤兒房。現在 create/join 逾時會在同一 roomId 以 Firebase ownerUid 驗證的 `hello` 重認領，不會再建立第二間房。
- 同輪精準測試發現舊 `gs.duoRoomData` 可在新隨機 roomId 被誤採納；新增 `_lastStateRoomId`，快照房號必須與目前 socket 房號完全一致。漏 ack 恢復與跨房殘留拒絕回歸已加入，精準 8/8、完整 release gate 51 files / 326 tests、Worker Phase 3 QA 23/23 通過。

- 2026-09-28 Duo 題庫修復：13 shard 重新計算穩定唯一題目 ID／候選中繼資料，去除 10 題重複，T00 技法與型別校正；最終 2,776 題皆有唯一解、正確解答與唯一 ID。新增唯讀驗證器並納入 build/check，舊覆寫產生器加顯式危險旗標。Duo 載入缺 shard 時不再採用／快取部分題庫；準備時雙端傳盤面指紋，Worker 不同盤面拒絕倒數；開局載入失敗可重設未落子的回合。Duo 題目最佳紀錄改用獨立 storage/cloud map，不再寫單人首通榜；舊負 ID 從單人統計排除。乾淨發布工作樹 /tmp/sudoku-duo-lobby-release-20260925-v2 完整 check 71 檔／425 tests、Worker 26 tests、正式 build/smoke/perf 通過。Chromium 雙端從大廳建房／加入／準備／開局，雙方盤面、種子、ID 與指紋一致，實際棋盤截圖已檢視；證據 output/duo-bank-fix-20260928/。

- 2026-09-30 iOS refresh authorized: clean worktree /tmp/sudoku-ios-build6-20260930 from bd2e62b; iOS 1.0 Build 6 embeds 2026.09.28-V1, manifest 58637847ce2ad62f and 2,776 Duo puzzles. ios:prepare now prepares Firebase config/recovery manifest before cap sync; verifier checks source/bundle version, SDK files and Duo shard hashes. 425 tests, perf, signed archive/export and IPA audit passed; exported IPA SHA256 69225c5acfac906a03fb52999883f0c767716fdf35e3fa6bf4938eb90ee35e81, get-task-allow=false, iOS26.5 SDK. Manual App Store profile regenerated for existing installed distribution certificate because automatic cloud signing lacked permission; no certificate revoked. Real iPhone11 native XCTest cell/key taps and iPhone16Pro simulator boot/game passed. Native WKWebView event QA passed solo notes/full completion, legacy completed-save cleanup/settlement, world cold restart (EXP5500/10 clears/settings retained), desktop-host/native-guest and native-host/desktop-guest full games with equal boards/fingerprints, separate records and forfeit beside title. Phone original normal/world records restored exactly, test flag absent and test rooms removed. IPA uploaded as VALID; approved Build5 was returned to editable state, Build6 selected, draft/final audit passed, submission WAITING_FOR_REVIEW at 2026-09-30 16:44:19 Asia/Taipei, releaseType MANUAL. Evidence output/ios-build6-20260930/ and docs/app-store/build6-release.json.


2026-09-30 Platform isolation (active): user requested PWA / iOS Duo and solo scoreboard separation, then authorized implementation. Isolated worktree based on 6b1adb5; original dirty workspace preserved. New iOS Firebase project sudokuzen-ios-prod, asia-east1 Firestore and anonymous Auth enabled on Spark (no billing linked, no anonymous auto-deletion). PWA / iOS have stable edition namespaces, independent Worker environments, protocol edition validation and leaderboard keys by mode + complete puzzle fingerprint. Previous Duo records retained separately and chunked cloud backup being implemented; earned unlocks and solo progress retained. Original in-flight rooms stay on their original server until completed, then reload into the new edition. Build 6 review untouched. NEXT: security negative tests, migration/leaderboard tests, browser gameplay, deploy new realms only, physical native QA, signed Build 7 and reviewed replacement submission.

Platform isolation verification (2026-09-30): new PWA/iOS Workers and Firestore namespaces deployed; old Worker unchanged. 31 real production security assertions passed and temporary QA accounts/documents cleaned. Two local realms: 24 protocol/isolation assertions and 26 lifecycle assertions per realm passed. Chromium and WebKit each passed PWA/iOS mobile history export, retained unlocks, legacy leaderboard and complete two-client Duo games; prior wins stay 7 while new records count exactly one result. Whole source check passed 434 tests; performance budget passed. iPhone 11 native Build 6 data and complete WebKit storage backed up before upgrade (no active room). New native build number is 7; signed archive, device upgrade, publishing and review replacement still pending.


Current prompt (2026-10-01): 保留 PWA 舊戰績並接續累計，iOS 維持獨立；開始實作。

- 使用乾淨 worktree `/tmp/sudoku-platform-isolation-20260930`，分支 `fix/pwa-history-continuity-20261001`，保留原工作區未提交的修改。
- PWA 使用保留的舊基準與分流後計數計算累計勝敗、連勝、對手戰績與解鎖，沒有將舊勝敗反覆寫入新計數。
- 跨分流的最佳連勝保留；輸掉／和局後仍歸零。最佳紀錄與回放採讀取時擇優，避免大量資料複製。
- 原 UID 的舊雲端資料以自有原始 Auth 讀取；新玩家檔案保存 PWA 舊基準，舊歷史以內容雜湊避免不必要的重寫。
- 既有 PWA 首通榜在準備／暫停／通關畫面直接顯示，另列目前盤面榜，保留舊名次並避免不同題目混排。
- 已通過 442 tests / 74 files、TypeScript、lint、format、Chromium / WebKit 四個雙人流程；確認舊 7 勝 + 新 2 勝 = 9 勝，重新載入不重複。
- 正式 Firebase 已驗證：舊 7 + 新 2 = 9，補回雲端舊 9 後 = 11，新計數仍為 2；重整後總數與歷史雜湊穩定，原始來源與舊榜未改寫。測試帳號／資料已清理。
- 28 個瀏覽器 smoke tests、正式建置與效能預算通過。PWA 已發布 `2026.10.01-V1`；Firebase Hosting 與 GitHub Pages 都已實測舊 7 勝 + 新 2 勝顯示 9 勝、離線開局及 Service Worker 更新，零頁面／HTTP 錯誤。
- CI、Pages、Firebase Preview 與 CodeQL 全成功，來源 commit `dbd74511ec07c3a7ff65779815740ec2c9c1a150`；iOS Build 7 維持原審查版本，本次沒有更換 binary。
- 本次工作完成；沒有待處理的產品修正。

Current prompt (2026-10-01): 依建議接入十二首 BGM、舊紀錄解鎖、收藏及各模式選曲，確認循環與切歌過渡，更新 PWA 及 iOS。

- 從 main a5aede5 建立獨立工作樹 /tmp/sudoku-music-release-20261001；原工作區既有未提交內容保持原狀。
- 三首初始曲：一般《九格微光》、世界《弈間回聲》、雙人《先手之間》。世界《星霧棋境》IQ5；雙人解鎖門檻3場、首次勝利、5/10/20/30/50/80場。
- 以循環樂譜連續合成取中間周期，製作有內容雜湊的十二首 MP3；不直接重播試聽版的淡出。
- 新播放器改為 AudioBufferSource 的音訊時鐘循環，MP3解碼接縫20ms重疊，切歌先載入完成再450ms淡入/淡出；待瀏覽器與原生驗證。
- 收藏與選曲依平台保存並納入該平台的雲端 profile；不重寫原勝敗、世界、最佳成績或解鎖紀錄。
- 已讀 develop-web-game、agent-browser、react-best-practices；後續跑對應實際遊戲測試、核對畫面。
- iOS當日讀回：1.0 Build7 VALID、WAITING_FOR_REVIEW。待Build8完成驗證後才替換。

Music verification: 452 unit tests passed using NODE_OPTIONS=--no-experimental-webstorage (Node 26 global storage conflicts with jsdom). Chrome/WebKit each decoded all 12 actual MP3s, verified adjacent-sample wrap with no silent gap, 15-second preview restoration and mute. Phone collection screenshot inspected. Moved collection CSS into lazy Settings chunk to retain existing CSS budget. iOS Build 8 planned; original Build 7 review remains untouched.

Native Build 8 QA found Capacitor bundled MP3 fetch returns status 0, ok=false, with complete valid audio bytes. Added a narrow native capacitor://localhost/sounds/bgm/ exception, preserving rejection for failed HTTP/opaque network responses. Actual trusted taps unlock AudioContext. The candidate was not uploaded; original Build 7 review remains unchanged. Rebuilding candidate after regression checks.

Music collection release complete (2026-10-01 15:37 Asia/Taipei): PWA/Firebase and GitHub Pages serve 2026.10.01-V3. Product commits 88de94c (12 original loop assets, settings collection/unlocks/cloud preferences) and b832b25 (Capacitor status-zero bundled-media fix) are on main; CI, Pages and preview workflows passed. 455 unit tests and final 28 gameplay smoke tests passed. One earlier candidate-tracking long-press fixture failed under load; isolated recheck and full rerun passed. Chrome/WebKit each decoded and rendered all 12 wrap boundaries; PWA default/previously-fetched music survived offline guarded upgrade; live defaults decoded offline and normal-game start/quit music behavior passed. iPhone11 Debug and Release trusted preview/stop taps passed. Native all 12 loop renders had zero added seam discontinuity and no silent gap; rapid mode switches, audio-clock 15-second preview restoration and mute passed. Native fixture data restored exactly, final Release app installed, original 15 data keys unchanged, only inline version updated plus the new music collection key; test flag absent.

Final iOS 1.0 Build 8 IPA SHA256 c41faa05c55991829905d542a14c769402aebb92549eb5319f1aa868eef33ad9; native backend, all twelve asset hashes, release signing and non-exempt-encryption=false verified. Uploaded build became VALID; after exact four-locale/twenty-screenshot audit, replaced Build7 and submitted Build8. Submission b9dda547-802e-45e3-a1c7-2002d4b141fc is WAITING_FOR_REVIEW at 2026-10-01T07:36:47.464Z; releaseType MANUAL retained. Review/contact/locale texts and screenshot checksums unchanged. Authoritative release record: docs/app-store/build8-release.json. Evidence: /tmp/sudoku-music-release-20261001/output/music-release-20261001 and /tmp/sudoku-music-ios-build8-20261001/output/music-build8-20261001. Original dirty workspace preserved. No implementation/release TODOs; Apple review remains external. Documentation-only commit retains V3 without invoking the product version-bump hook.

Current prompt (2026-10-03): Investigate PWA match Steven versus mm on Oct 2, 21:00–22:00 Asia/Taipei: first finisher waited for opponent and later received a forfeit. Clean worktree from origin/main 6aec2ed; original dirty workspace untouched. Server finish/presence/alarm guards preserve accepted results; investigating finish message delivery during reconnect and cold restoration. Workers history query returned 403 for existing Wrangler OAuth; dashboard not signed in. No production writes or record edits.

Investigation findings: deployed PWA Worker bcf6cc76-1523-44af-b6c1-ddaa6552e578 (Sep 30) downloaded read-only; deployed alarm explicitly preserves non-null host/guest finish times. Worker artifact SHA256 e229886700c0ff032cc2274e64f1a8a0fb707d1382c7db0ab3683b27f0883489. Existing client send() checked OPEN without awaiting hello reclaim. Regression test reproduced frame order create → finish → hello. Local real Worker reproduced apparent 120-second completion becoming 9999 forfeit when sent before authenticated hello; accepted 120-second control survives offline waiting and opponent's 180-second finish. Historical query for Oct 2 20:45–22:30 Taipei denied 403 (existing Wrangler OAuth lacks Workers Observability permission); Cloudflare dashboard signed out. Steven/mm exact room/event chain remains unverified, and no player records changed.

Local fix prepared, not deployed: queue gameplay/finish while reclaiming; hello bypasses queue; flush only after successful current-socket reclaim. Epoch and socket-instance guards suppress old reconnect completions and late events from old rooms. Added regressions for finish-before-reclaim and prior-room late close. All 457 unit tests + type/lint/format gates passed. Evidence directory output/finished-forfeit-investigation. TODO for release: commit/deploy only if user requests rollout; confirm exact Steven/mm case when historical log access or room id becomes available. Separate future hardening: durable finish intent plus authoritative receipt/retry, since an already OPEN and reclaimed socket can also lose a frame during network/process failure.

Final verification (Oct 3): all 457 checks passed. Real Chromium + isolated PWA Worker test verified the transport holds finish during reconnect hello, then delivers the 120-second result, preserving it across 12 seconds offline against a 10-second test grace; opponent 180 seconds produces the correct winner. Browser result screenshot inspected. The mandatory web-game client was run through an isolated E2E bootstrap; settings screenshot inspected and no captured console errors. Temporary bootstrap removed, normal ignored Firebase configs restored. No production deployments or player result changes. Local fix remains in /tmp/sudoku-duo-finished-forfeit-20261003 on fix/duo-finished-forfeit-20261003, ready for a requested rollout.

Current prompt (2026-10-03): user explicitly authorized fixing and deploying the PWA. Release audit also reproduced cold-resume public roomState being accepted as ownership without hello for both host and guest. Tightened adoption to require a direct authenticated role on the current socket; fresh sockets hold gameplay until create/join/hello confirms ownership. Added host/guest cold-resume regressions that fail on prior code. PWA-only release; existing server result protection and player records preserved.

PWA deployment complete (2026-10-03 20:45 Asia/Taipei): source commit 76494af published as 2026.10.03-V1 to Firebase Hosting and GitHub Pages. Both live endpoints, CI, Pages and Firebase preview read back successfully. Added cold host/guest resume proof: unclaimed public roomState cannot bypass authenticated hello; gameplay queues until a direct role-bearing response arrives. Current socket/epoch guards and wrong-room filtering prevent stale events from affecting new rooms. All 459 unit/type/lint/format checks and 28 gameplay smoke tests passed. Production-build Chromium and WebKit each verified finish queued before claim, 120-second result retained through 12-second offline wait against a 10-second local test grace, fresh socket hello on resume, and correct 120 vs180 result. Test-only exports were exposed through response interception, never shipped. Live Firebase code SHA256 matches tested feature-duo bundle; live Chromium client replay against isolated backend passed. Live retained-history fixture still shows old7 + new2 =9 wins, original normal records and music preferences unchanged. Server/Firestore/player results were not changed.

QA limitations recorded: legacy local resilience publication test expects Firebase discovery writes while E2E mode disables Firebase, so its publication assertion is not a successful release check; its complete game/reload/rematch case passed on retry. Live WebKit HTTPS→local plain-WS replay cannot validate that fixture, so WebKit production-build verification used the isolated HTTP production preview. Public endpoints/version/hash and live Chromium replay succeeded. Historical Steven/mm event chain remains unverified (log API403); no retroactive match correction. Evidence output/finished-forfeit-investigation and docs/pwa-duo-authenticated-finish-release-20261003.json. Original dirty workspace preserved. Release task complete; no pending rollout TODO. Durable finish intent/receipt retry remains separate future hardening.


Current prompt (2026-10-03): 調查第二起「對手已先完成、自己仍在解題卻被認輸」事件。

- 僅調查，未改產品程式或部署；使用 clean origin/main c75bdc8 隔離 worktree。
- 真實 Worker 重現 closeResult 無finished guard與host leave令整房finished，UI缺失成績替換9999；不能直接宣稱昨天根因。
- 真實 Worker 重現unfinished OPEN但無訊息的presence沒收；正常guest heartbeat與host已完成斷線則guest可繼續並180秒結算。
- 舊版固定底部認輸按鈕覆蓋5下緣，實際點擊數字5位置送finish9999；9/25已移位，昨日快取版本未知。現版三手機尺寸數字觸控與正常完賽通過。
- 當局時間/暱稱/背景情況尚無補充；歷史observability權限限制沿用。
- 詳細證據與後續修正建議：docs/duo-loser-forfeit-investigation-20261003.md，output/loser-forfeit-investigation。


Current prompt (2026-10-03): 開始修正第二起未完成玩家被認輸問題。

- 已修後端playing離房只影響自己、finished離房保留兩席與結果，closeResult限finished。
- 已統一三處認輸入口確認與可選endReason，舊不完整WS結果不記勝敗。沒有變更儲存key或玩家資料。
- 新增8項Vitest測試及永久Worker round-exit QA；check:ci 77 files/467 tests pass。Worker26既有QA及5組新退出測試 pass。
- Chromium/WebKit真實房間確認取消認輸可解、host完成後leave對手超過測試grace仍可解、確認認輸才送surrender、缺失成績中止不記loss pass。
- build:firebase/release:check pass；smoke27/28首輪通過，既有候選長按單獨重跑通過。
- 尚未提交、推送或部署；詳細修正記錄docs/duo-round-exit-fix-20261003.md。
- 最終交卷重連回歸在重啟隔離Vite後通過，正式build、467unit、Worker26+5組、兩瀏覽器退出/取消/中止測試已完成；多次HMR的測試module狀態干擾不可當產品回歸，測試時需使用fresh dev server或static build。


Current prompt (2026-10-04): 使用者授權部署第二起對局退出／誤認輸修正。

- 修正commit89cf10c經precommit467tests通過並推main，hook版本2026.10.03-V2（提交在TPE午夜前，發布跨日保留識別）。
- duo-pwa Worker已部署47716b69-6cb8-4413-bfde-cb436bcfd4d6，AUTH_REQUIRED=true/EDITION=pwa；未部署duo-ios或legacy。
- Firebase及Pages正式HTML/SW均V2、正式DuoJS SHA與受測artifact一致。
- 正式backend有效FirebaseTokens/預設60s grace驗證5组exit scenarios通過，host/guest先完成leave後solver心跳65秒能完賽、單方leave與重賽、surrender/disconnect原因一致。2個臨時匿名QA身分已刪除，未寫公開lobby或真實玩家資料。
- 正式compiled frontend以test-only response exports+local backend驗證取消與確認認輸／先完成leave／不完整room不記loss通過；正式records+收藏保留通過。
- 修正提交CI（含e2e smoke）、Pages與Firebase Preview全成功。發布記錄docs/pwa-duo-round-exit-release-20261004.json。


Current prompt (2026-10-05): 修正Apple Guideline4 iPadAir11M3相容視窗數字鍵裁切，驗證尺寸／方向後重新送審。

- 已在414×736、320×568、736×414以Chromium/WebKit重現；九鍵高度與固定棋盤超過viewport。
- 將play area獨立，保留數字鍵最小44px高度；board-stage依實際剩餘flex尺寸用ResizeObserver維持正方形，橫向左右排列，safe area只由body處理一次，极端短窗可捲動。
- 新工作區/tmp/sudoku-ipad-review-layout-20261005，root既有改動保留。尚未建置／送審。

- Build9版本1.0，內嵌2026.10.05-V1，source851edb3；467unit、28gameplay+3layoutregression與374跨engine/layout場景通過。
- 5個自己的原生模擬器（Air11M3、miniA17、Air13M3、SE3、16ProMax）bounds/hit/orientation測試通過；4個有逐鍵native taps，Air11已有全9 bounds/hit并fullDevice截圖。Native runtime26.5，不宣稱Reviewer27.0或實體機。
- 修正測試fixture首次mini未進入關卡列表，加fresh-screen條件重試；截圖改XCUIScreen.main避免app.screenshot的iPad相容裁切。產品版面未因fixture而另改。
- IPA已驗簽、getTaskAllow=false、Build9/VALID已上傳。ASC替换9並追加Guideline4備註；public metadata20shots/contact/manual保持，versionREADY_FOR_REVIEW，parentUNRESOLVED_ISSUES待再次提交。

- 10/5 21:57:17 TPE已再次提交1.0/Build9；version及原submission b9dda...均WAITING_FOR_REVIEW，Build9 VALID/MANUAL，四locale20shots/publicMetadataDigest/contactDigest均未變，新增Guideline4修正與26.5本機runtime限制備註。
- 首次submit腳本限制parent必須READY而拒絕UNRESOLVED（未送request）；已依官方流程允許parentUNRESOLVED但檢查唯一itemREADY_FOR_REVIEW後提交成功。

- Keychain API final readback 21:59:21及BraveUI再次核對均WaitingForReview/1.0Build9，已保留審查結果頁。
- PWA shared layout亦已在Firebase/Pages更新2026.10.05-V1；頁面HTML/SW/CSS結構verify通過，原7+新2=9勝與普通紀錄／音樂prefs保持。080089d CI/Pages/preview均成功。
- 完整發布與限制紀錄docs/app-store/build9-release.json；沒有操作原iPhone11資料，未改duo-ios或legacy Worker。
