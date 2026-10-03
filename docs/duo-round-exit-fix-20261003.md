# Duo 提前關房與認輸意圖修正（2026-10-03）

已在隔離 worktree `/tmp/sudoku-duo-loser-forfeit-20261003` 實作。基準 main c75bdc8；尚未提交、推送或部署。原工作區保留原有未提交內容。正式 PWA 與 Worker 尚未套用本次修改。

## 最終行為

- playing房中的已完成者送leave，僅斷開自己的連線；保留自己的成績及另一方席位、盤面與未完成狀態。雙方角色一致。
- 未完成者明確leave，僅自己的成績記為棄權、原因left；對方仍可完賽。finished房的離房不再刪guest或退回waiting。
- closeResult只接受finished房，playing/waiting/countdown收到訊息回bad_state，不改對局狀態。
- 對手完成後標題的認輸、用盡愛心的認輸與暫停畫面的認輸統一經surrenderDuo確認；取消後不送訊息、不鎖提交旗標、不移除標題按鈕。完成者不需再次認輸。
- PlayerSlot新增向後相容的可選endReason：surrender / left / disconnect；重賽清空。client映射與中英日德結果文案同步更新。舊房沒有原因時只顯示一般棄權，不推論主動認輸。
- WS finished房缺少任一權威成績時顯示「對局中止／未完成」，不新增勝敗戰績，也不把缺失成績偽裝成認輸。保留舊Firebase房的原有離房相容行為。
- 正常斷線寬限仍為60秒，未更動政策。沒有更換儲存key、搬移或重設玩家既有紀錄與音樂收藏。
- 對surrender訊息、明確leave與斷線alarm記錄精簡的結束原因事件（roomId / puzzleSeed / role / reason / at），沒有玩家UID/token或盤面資料。

## 驗證

- check:ci：77 files / 467 tests全部通過（含新增8項認輸取消、重複點擊、缺失成績不記戰績、結束原因文案測試）。
- Worker typecheck、hibernation invariants、deploy --dry-run、本地26項既有Phase3 QA與新5組房間退出情境通過。新測試覆蓋host/guest先完成後closeResult/leave、未完成者leave、原成績保留、重賽清空原因、已finished的正常關閉、主動認輸vs斷線原因。
- 真實 Chromium 與 WebKit：取消標題認輸與暫停认輸後仍可解；host先完成120秒後leave，guest等待12秒超過本地10秒測試grace仍無成績且可點正確數字；確認認輸才得到9999/surrender；舊不完整房不增加玩家勝敗。無pageerror。實際截圖已目視檢查。
- build:firebase與release:check通過；初始JS gzip276067 / 280000，CSS29675 / 30000，合計305742 / 315000。
- 廣泛28項遊戲smoke首輪27通過、候選追蹤350ms長按測試失敗；該項獨立重跑通過（4.2秒）。保留首輪失敗紀錄，不宣称首輪全通過。
- 前次修正的交卷重連瀏覽器回歸通過：finish先排隊、hello後補送、offline12秒仍保留120秒、fresh socket重新認領、對手180秒正確結算。Vite在多次建置／HMR後的fixture兩次未送出finish；重啟隔離Vite後同測試通過，沒有修改產品transport來繞過失敗。保留測試環境限制。
- mandatory develop-web-game client已執行與目視檢查。臨時QA HTML已刪除，未加入dist。

## 測試環境與限制

後端本地QA使用1500ms斷線grace；瀏覽器跨角色測試使用10000ms。本次不是正式站60秒斷線耐久、實體iPhone或Android PWA測試。無授權正式歷史事件存取，未宣称找到10月2日當局的唯一根因。

測試runner可由DUO_QA_PORT覆寫，避免占用其他任務的8794 port；原8794 server未停止。新QA第一次重賽斷言誤讀舊waiting訊息，已改以本局清空endReason的權威snapshot為條件並完整重跑通過。

詳細測試輸出、腳本與截圖：`output/loser-forfeit-investigation/`。調查原始證據：`docs/duo-loser-forfeit-investigation-20261003.md`。
