# 世界模式重載後紀錄消失：調查（2026-09-23）

範圍：唯讀調查，未修改產品程式、玩家儲存空間或線上資料。查核當時 Firebase Hosting 首頁為 2026.09.23-V1。使用獨立 Chromium／WebKit context 和隔離的 Firebase 設定重現，證據在 `output/world-save-investigation-20260923/`。

## 1. 已重現：成長紀錄延後寫入，快速重載會失去最新變動

`src/features/wild/wildState.ts` 的 `saveWildProfile()` 使用 100 ms `setTimeout` 才寫入 `sudoku_wild_profile`，沒有 `pagehide`/`beforeunload` flush。Chromium、WebKit 測試先有 EXP 100，呼叫 saveWildProfile(EXP 200) 後立即重載，儲存仍是 100，重載後亦是 100。正常通過這100 ms會寫入，因此這個缺陷能解釋「最近一次完成／圖鑑更新消失」，單獨不足以解釋成熟玩家全部紀錄歸零，除非當時本機原本沒有 profile key。

## 2. 已重現：控制器快取舊 profile，稍後會覆蓋較新的資料

`src/features/wild/wildController.ts` 的 `getWildProfile()` 第一次讀取後將物件保存在 `_profile`，後續永不重新讀入。世界大廳、技能研習、雲端 hydrate 等其他路徑會獨立讀寫 `sudoku_wild_profile`。受控測試先讓控制器快取 EXP 100，模擬較新的 EXP 300 寫進 localStorage；控制器隨後更新自己的快取並保存，結果 localStorage 和重載後都變成 EXP 120，等級從8退到4、完成數從10退到3。Chromium、WebKit 均同樣重現。

這不是雲端資料真的曾在玩家裝置上如此排序的證明，但雲端 hydrate 流程確實可能在控制器首次讀取之後填入本機 key；技能研習與大廳設定也會獨立保存另一份 profile。`src/firebase/client.ts` 的雲端 hydrate 只在 localStorage key 缺失時補入 world profile，不做欄位合併；接著進度同步可能把被舊快取覆蓋的內容寫回雲端。因此確有整批圖鑑／等級倒退的程式路徑。

## 3. 當局棋盤與其他界線

`src/features/wild/wildController.ts` 開始新遭遇後沒有立刻建立 `sudoku_wild_save`；棋盤操作會走 `saveGameStatus()` → 非同步 import `saveCurrentEncounter()`。一般重載／背景化時還有 `src/app/legacyRuntime.ts` 的保存處理。實際開始遭遇後直接正常重載，Chromium 和 WebKit 的 `beforeunload` 都成功寫入 `sudoku_wild_save`，沒有重現棋盤遺失。若瀏覽器或系統直接終止而未執行 unload，尚未落盤的遭遇仍有遺失風險；本次未把此條件當作玩家事故的已證實原因。

Service Worker 更新流程沒有清除 localStorage；儲存 migration 只處理一般正整數關卡存檔，沒有刪除 `sudoku_wild_profile`。世界紀錄是以網站 origin 的 localStorage 為主，雲端備份綁定該 origin 的匿名身分；從不同網址、不同瀏覽器或重新安裝的 PWA 進入，有可能看到另一個空白儲存空間／身分，須取得現場入口和裝置才能判斷。

## 判定與後續

兩個資料遺失缺陷已在隔離瀏覽器重現；玩家當次事件的確切觸發條件尚未取得。修正時應讓世界 profile 的關鍵更新同步落盤，且讓控制器持有的 profile 與後續 hydrate／其他編輯一致；雲端同步須避免用較舊的本機整包 profile 覆蓋較新雲端資料。需另驗證突然終止、跨網址／跨裝置、離線和儲存 quota 失敗。現階段勿要求玩家清除網站資料或重裝；若要救回既有紀錄，先取得原裝置、原入口、版本及玩家授權後唯讀檢查當前 localStorage／雲端備份，再判斷可恢復範圍。

## 修正與驗證

2026-09-23 修正：世界 profile 改為每次變動時同步寫入；控制器每次讀取最新儲存資料。寫入本機與雲端 hydrate 時都合併不可倒退的 EXP、等級、完成數、圖鑑、碎片、研習和教學進度；可重設的設定與當前修行輪採用進度較新的快照。合併函式置於共用模組，正式打包不產生功能 chunk 循環。

新增測試涵蓋立即落盤、控制器舊快取、圖鑑合併，以及本機已有舊 profile 時從雲端恢復較新世界進度。完整測試 68 檔／410 項通過；Chromium 與 WebKit 隔離重現的兩個案例修正後均通過，世界大廳畫面已檢視。此修正防止未來覆蓋；對於玩家先前已消失的資料，仍需在原裝置與雲端備份做唯讀檢查才能判斷是否可救回。
