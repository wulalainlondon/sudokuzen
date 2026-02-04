Original prompt: 幫我用這個檢查我的關卡 是否都是唯一解

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
