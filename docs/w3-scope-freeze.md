# W3 需求凍結與驗收標準

版本：W3
參考來源：`docs/w2-scope-freeze.md`、`docs/w2-qa-checklist.md`、`docs/w2-risk-register.md`、`e2e/replay-end-to-end.spec.ts`、`e2e/teach-lazy-load.spec.ts`、`e2e/offline-sw.spec.ts`、`e2e/hud-technique-hint.spec.ts`、`tests/core-ui-bridge.spec.ts`、`tests/i18n.spec.ts`、`src/game/coreUiBridge.ts`、`src/features/teach/state/teachStore.ts`、`src/shared/records/levelRecords.ts`
更新日期：2026-04-10

## 1. W3 目標與非目標

W3 的目標是把 repo 目前已經有明確實作與測試覆蓋的三條使用者可見能力，再往「穩定可交付」收斂一次：`Replay` 穩定性、`Teach lazy-load / offline`、以及 `HUD` 的多語與版面安全。W3 的重點不是擴功能，而是把目前已存在的行為、 fallback、與驗收邊界凍結下來，避免後續只因為文案、載入路徑、或小螢幕版面調整而反覆改 scope。

W3 的非目標是新增新的 replay 玩法、重做 teach 內容結構、擴寫解題引擎、或重新設計整體遊戲 UI。這一階段也不把尚未明確列入驗收的區域納進來，例如更多額外 locale、更多教學章節、或跨頁式的大型導航改版。W3 只要求目前這三條線在現有 repo 狀態下能穩定、可重複、可驗收地交付。

## 2. In Scope / Out of Scope

### In Scope

1. Replay 的資料保存、歷史重建、modal 開啟、步進播放、倒退、播放/暫停、速度切換、與 reset 行為的穩定化。
2. Replay 與既有 record 結構的相容性維持，尤其是 `replayHistory` 的讀寫、舊資料 fallback、以及測試 fixture 的可重現性。
3. Teach 的 manifest / shard lazy-load 路徑、`showTeachModal` bridge、以及資料缺失時的安全降級。
4. Teach 在初次載入與離線重訪下的可用性驗證，包含 service worker / cache 命中後仍能打開關卡或進入可理解的 fallback 流程。
5. HUD 技巧提示的多語文案解析、未知技巧 fallback、以及在桌機與手機 breakpoint 下的可讀性與不遮擋主玩法。
6. 與上述三項能力直接相關的 i18n 文案、欄位命名、空態處理、以及測試中可重複執行的驗收路徑。

### Out of Scope

1. 新增 replay 匯出、分享、註記、比較、或任何超出現有 replay modal 的產品形態。
2. 新增更多 teach 章節、改造教學編排、或把課程編輯流程納入本期。
3. 改寫關卡生成、解題引擎、技巧判定核心、或 replay 歷史 schema 的主體設計。
4. 重做整體 HUD 架構、主遊戲盤面、跨頁導航、或大範圍視覺刷新。
5. 把尚未明確凍結的其他 TODO 一併塞進 W3，例如新模式、成就、排行、或額外的 release 管線重構。

## 3. 驗收標準

### 3.1 Replay 穩定性

Replay 的 W3 驗收定義：玩家完成一局後，系統能穩定保存 replay 資料，並以可重複、可觀察的方式還原這局的過程；同時，回放控制在目前設計內可預期地工作，不因歷史資料、速度切換、或 reset 而出現不可重現的狀態漂移。

#### Scenario A: 完局後可產生 replay 資料

**Given** 玩家完成一局遊戲  
**When** 系統寫入完成紀錄  
**Then** `replayHistory` 應存在於紀錄中，且至少包含可用於還原步驟的動作序列

#### Scenario B: 回放可用既有資料穩定重建

**Given** 玩家已有一局可回放的紀錄  
**When** 玩家開啟 replay  
**Then** replay modal 應可見，回放盤面應正確渲染，且初始步驟資訊應能穩定對上歷史資料

#### Scenario C: 回放控制可預期運作

**Given** replay 已開啟  
**When** 玩家執行步進、倒退、播放、速度切換、或重置  
**Then** 盤面與步驟索引應同步更新，播放結束後應自動停住，重置後應回到 step 0

#### Scenario D: 舊 record 與空資料有安全 fallback

**Given** record 可能缺少部分 replay 欄位，或歷史資料來自較舊版本  
**When** 系統嘗試讀取 replay  
**Then** 應維持可解讀的 fallback 行為，不可直接崩潰、卡死，或把不完整資料渲染成錯誤狀態

### 3.2 Teach lazy-load / offline

Teach lazy-load / offline 的 W3 驗收定義：教學模組可透過 manifest 與 shard 正常載入，在網路可用時順利進入 overlay；在網路不可用、或首次載入後切換離線時，系統仍要能以 cache 或安全降級方式維持可理解的教學入口，不讓畫面卡在 loading。

#### Scenario A: manifest 可載入且內容完整

**Given** 使用者進入 teach 入口  
**When** 系統讀取 manifest  
**Then** manifest 應可取得，且模組數量與目前 repo 內的教學資產一致

#### Scenario B: shard 可透過 lazy-load 取得

**Given** manifest 已可用  
**When** 系統請求指定 shard  
**Then** shard 應能被載入，且回傳的 module 內容應包含 technique、name、example 等必要資料

#### Scenario C: overlay 可由 bridge 正常開啟

**Given** teach 入口被觸發  
**When** `showTeachModal` 或等價 bridge 被呼叫  
**Then** teach overlay 應進入可見狀態，並進入 demo 或 stepping flow

#### Scenario D: 離線或缺資料時有可理解的 fallback

**Given** manifest、shard、或 cache 資料缺失，或頁面已切換到 offline  
**When** 使用者仍嘗試開啟 teach  
**Then** 系統應顯示安全降級行為，不可卡在 loading，也不可讓 UI 直接壞掉

### 3.3 HUD 多語與版面

HUD 的 W3 驗收定義：玩家在關卡畫面右上角能直接看到目前關卡所需的最高技巧，且這個資訊會依目前 locale 走正確的字串路徑；若資料缺失，畫面應仍可讀、可理解，不能留下破版、原始 key、或超出可用空間的長字串。

#### Scenario A: 進入關卡即顯示技巧

**Given** 玩家進入任一關卡  
**When** 關卡畫面完成載入  
**Then** `#level-tech-hint` 應可見，且應顯示該關卡對應的最高技巧資訊

#### Scenario B: 顯示內容走 locale 與 fallback 路徑

**Given** 關卡資料已帶有最高技巧或技法層級資訊  
**When** 玩家查看 HUD  
**Then** 顯示內容應經由 i18n / techMap 路徑解析，若翻譯缺失仍應回退到可理解的文字而不是 raw key

#### Scenario C: 缺資料時安全降級

**Given** 技巧 metadata 不完整  
**When** 系統渲染 HUD  
**Then** HUD 應顯示可理解的 fallback 文案，且不可出現 `--`、空白破口，或影響主要遊戲區操作

#### Scenario D: 版面在桌機與手機都可讀

**Given** 桌機或手機版面載入完成  
**When** 使用者觀察右上角技巧提示  
**Then** 技巧提示應保持可讀，不應蓋住盤面、操作區，或因字串過長而破壞目前 header / HUD 版面

## 4. Definition of Done

W3 視為完成，需同時滿足以下條件：

1. Replay、Teach lazy-load / offline、HUD 多語與版面三條線的驗收測試都能重複通過，且測試名稱與目前 repo 的 E2E / Vitest 路徑一致。
2. 三項能力在主要目標裝置上可正常工作，沒有明顯破版、卡死、或阻塞性錯誤。
3. 資料缺失、離線、或 locale fallback 時都有明確且可重複驗證的降級行為，不依賴口頭約定。
4. 相關文案、欄位命名、與資料來源說明已落地到文件或實作中，不再需要靠 PM 或工程師口頭對齊。
5. 相關程式碼已完成基本自測，且沒有引入已知會影響主遊戲流程的回歸。
6. 本文件列出的 PM 待決項已有明確結論，避免實作期間反覆改 scope。

## 5. 需要 PM 決策的項目

1. W3 的 HUD 多語範圍是否只凍結目前 repo 已有的 locale 路徑，還是要把額外語系也納入本期交付。
2. HUD 的 technique 名稱在 UI 上要採技術名詞原文、中文譯名，或雙語顯示；若兩者都要，哪一個是主文案。
3. Teach 在離線狀態下的產品行為要採哪一種：直接使用 cache 中的教材、明示離線提示、還是引導使用者重試。
4. Teach lazy-load 失敗時要顯示什麼 fallback 文案，以及是否允許在 fallback 下直接關閉 overlay。
5. Replay 對舊 record 的容忍度要到哪一層：只允許完整歷史，還是要支援部分缺欄位的舊資料。
6. Replay 的驗收是否要求固定一組 deterministic fixture，還是接受目前資料驅動的動態驗證方式。
7. W3 是否要把 mobile / desktop 的 HUD 版面差異完全凍結，或允許手機保留較短的字串與更小的寬度上限。
