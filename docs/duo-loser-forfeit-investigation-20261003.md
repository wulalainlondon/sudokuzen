# 第二起 Duo 未完成玩家被顯示認輸：2026-10-03 調查

使用者描述：10 月 2 日另一局，一方已確定獲勝，落後的一方仍在解題，隨後莫名被判投降。尚未收到另一局的暱稱、時間、房號與是否切背景的補充，不能認定與 Steven / mm 21–22 時的第一起事件相同。

基準：origin/main c75bdc8，PWA 2026.10.03-V1。獨立 worktree，原工作區未修改。本次僅調查，未修改產品程式、推送、部署、改玩家資料。

## 已確認的路徑

1. **提前結束房間會被顯示成認輸**。`duo-party/src/server.ts` handleLeave（484 行）在 host 離房時無條件令 status=finished；handleCloseResult（496 行）只檢查已綁定角色，未檢查原 status 或雙方完成。`src/features/duo/duoGame.ts` showDuoResult（1045 行）把 finished 房間的缺失成績替換成 9999。因此 winner=120、loser=null，沒有任何 surrender / finish9999，也會在 UI 將 loser 顯示為認輸。真實本地 Worker 重現兩條路徑。先前下載的正式 duo-pwa Worker（bcf6cc76-1523-44af-b6c1-ddaa6552e578）亦含相同處理。這證明後端防護漏洞存在；尚未證明昨天有這類訊息。正常觀戰畫面沒有離房按鈕，單純關閉 PWA 導致 socket close 與明確 leave 訊息不同。

2. **未完成玩家斷線會被沒收，結果畫面無法辨識原因**。正常 close 後預設寬限 60 秒。若 socket 仍 OPEN 但沒有任何訊息：25 秒 stale、每 10 秒檢查、再寬限 60 秒，約最後一筆訊息後 85–95 秒可能得到9999。真實 Worker 本地測試保留 25/10 秒 stale/check，僅把 grace 改為1500ms，重現 OPEN socket 沒訊息得到9999。這是刻意停送訊息的控制測試，不是實測前景手機會自行掉心跳。Chrome 背景 timer 有節流可能，但不能由此認定 iPhone 或昨天前景事件的原因。

3. **舊版按鈕會與數字按鍵重疊**。重套9月25日前 CSS 與舊 DOM位置，在411×780，認輸按鈕覆蓋「5」下緣；點數字5原本的矩形內座標(205.5,672.0859375)，elementFromPoint命中認輸，實際送出 finish9999，對手已finish120、我方9999。這條路徑不會送 surrender 型訊息，不能只搜 surrender 來排除誤觸。48e8cf8 已於9月25日移至標題旁；目前390×844、411×780、375×667的數字鍵中心都可觸控。昨天是否仍使用舊快取未知。現行標題認輸、用盡愛心認輸、暫停畫面的認輸都只需單擊，沒有確認步驟。

## 正常情境與排除

- 真實 Chromium + 當前客戶端 + 隔離 Worker：手機盤面點格、點正確數字成功，沒有 finish/surrender；host 成績120後斷開，guest 保持正常10秒 heartbeat 等待42秒（跨越完整stale檢查與縮短grace），仍未完成而未被沒收；最後提交180，host120/guest180正確結算。無 pageerror。
- 真實 Worker raw WS：unfinished guest 在縮短寬限內 hello 認領，deadline取消，保持online可完賽。
- 對手finish本身沒有「輸家解太久」的結束計時。表情炸彈只遮蓋顯示，不扣生命、不送finish；錯誤輸入在Duo可繼續玩，不會因用盡愛心自動送9999；chess clock沒有本案所述的先完賽後追趕盤面。
- Mandatory develop-web-game client 已執行，首頁與實際遊戲／結算截圖已目視檢查。臨時 bootstrap HTML 已刪除。

## 證據

本 worktree `output/loser-forfeit-investigation/`：server-paths.mjs/json、browser-healthy.mjs/json、三種手機solver截圖、healthy-result.png、browser-old-layout.mjs、old-layout-overlap.json/png、client/shot-0.png。server-paths第一次fixture predicate未處理guest=null而失敗，修正fixture後完整重跑成功；不是產品錯誤。

## 修正建議（本次尚未實作／部署）

- closeResult 僅可作用於已finished房，不能提前結算playing/waiting房。
- playing時已完成者leave只解除連線，保留另一方繼續解；未完成者明確leave只記自己的退出，不刪對方席位、不無條件finished。保持等待房離房行為。
- 明確保留結束原因（玩家認輸／斷線逾時／房間取消）與round識別，不以缺失成績自動宣稱主動認輸；補充關鍵狀態事件追蹤。
- 現行認輸動作增加防誤觸確認；連線健康應有server回覆與前景恢復處理，與延長寬限政策分開考慮。

## 限制

上一輪Cloudflare歷史Observability查詢被現有OAuth權限以403拒絕，且房間保留24小時。沒有本局房號或事件追蹤，無法確認昨天真正是哪條鏈。未把協議控制測試冒充正常UI自然觸發，未把縮短grace測試冒充60秒正式環境耐久測試。

官方參考：[Chrome背景timer節流](https://developer.chrome.com/blog/timer-throttling-in-chrome-88/)、[Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)。
