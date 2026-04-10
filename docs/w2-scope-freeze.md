# W2 需求凍結與驗收標準

版本：W2
參考來源：`TODO.md`、`docs/w1-scope-freeze.md`、`e2e/replay-end-to-end.spec.ts`、`e2e/teach-lazy-load.spec.ts`、`e2e/hud-technique-hint.spec.ts`、`src/game/coreUiBridge.ts`
更新日期：2026-04-10

## 1. W2 目標與非目標

W2 的目標是把目前 repo 已經具備雛形、且有明確測試覆蓋的三個使用者可見能力收斂成可凍結、可驗收、可交付的範圍：`Replay`、`Teach lazy-load`、以及 `HUD 技巧提示`。W2 的重點不是繼續擴大功能，而是把這三條產品線的行為、 fallback、與驗收標準固定下來，讓後續工程工作可以在不改變產品定義的前提下並行推進。

W2 的非目標是新增新的回放模式、擴充更多教學內容、重寫技巧系統、或重新設計 HUD 版型。這一階段不追求把所有相關 UX 一次做滿，只要求現有能力穩定、資料來源明確、驗收方式明確，並且不干擾目前主遊戲流程。

## 2. In Scope / Out of Scope

### In Scope

1. Replay 的完成後回放資料生成、回放 modal 開啟、步進播放、暫停/播放、速度切換、重置，以及既有 replay 列表的核心呈現。
2. Teach 的 lazy-load 入口、manifest 讀取、shard 載入、bridge 開啟 overlay、以及資料缺失時的安全降級。
3. HUD 右上角技巧提示的正確顯示，包含對應關卡資料、fallback 文案，以及在主要 breakpoint 下可讀且不遮擋核心盤面。
4. 針對上述三項能力，維持或補齊可重複執行的 E2E 驗收路徑。
5. 與上述三項能力直接相關的文案、欄位命名、狀態顯示與空態處理。

### Out of Scope

1. 新增 replay 分享、匯出、標記書籤、比較雙盤、或任何超出目前 modal 能力的玩法。
2. 新增更多 teach 內容、重做教學分章架構、或把教學編輯流程納入本期。
3. 改造解題引擎、關卡生成、技法判定、或技巧資料建模方式。
4. 重做整體 HUD 架構、跨頁導航、主遊戲盤面佈局、或大範圍視覺刷新。
5. 把其他尚未凍結的 TODO 一併納入 W2，例如新的模式、成就、排行、或更大規模的 UI 重構。

## 3. 驗收標準

### 3.1 Replay

Replay 的 W2 驗收定義：玩家完成一局後，系統能穩定保存 replay 資料，並以可操作、可觀察的方式讓玩家重看這局的過程；同時，回放控制在目前設計內可預期地工作，不因速度、重置或步進而卡死。

#### Scenario A: 完局後可產生 replay 資料

**Given** 玩家完成一局遊戲  
**When** 系統寫入完成紀錄  
**Then** `replayHistory` 應存在於紀錄中，且至少包含可用於還原步驟的動作序列

#### Scenario B: 回放 modal 可正常開啟

**Given** 玩家已有一局可回放的紀錄  
**When** 玩家開啟 replay  
**Then** replay modal 應可見，回放盤面應正確渲染，且步驟資訊應顯示初始狀態

#### Scenario C: 回放控制可預期運作

**Given** replay 已開啟  
**When** 玩家執行步進、倒退、播放、速度切換、或重置  
**Then** 盤面與步驟索引應同步更新，播放結束後應自動停住，重置後應回到 step 0

#### Scenario D: replay 列表篩選不破版

**Given** replay modal 已開啟  
**When** 使用者切換既有的 replay 篩選  
**Then** 清單內容應跟著更新，且不應出現空白、錯誤 class，或 DOM 結構壞掉

### 3.2 Teach lazy-load

Teach lazy-load 的 W2 驗收定義：教學模組可透過 manifest 與 shard 正常載入，並在資料可用時順利進入 overlay；資料不可用時，系統要能安全降級，不讓畫面卡死或出現無法辨識的空狀態。

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

#### Scenario D: 資料缺失時有可理解的 fallback

**Given** manifest、shard、或 global fallback 資料缺失  
**When** 使用者仍嘗試開啟 teach  
**Then** 系統應顯示安全降級行為，不可卡在 loading，也不可讓 UI 直接壞掉

### 3.3 HUD 技巧提示

HUD 技巧提示的 W2 驗收定義：玩家在關卡畫面右上角能直接看到目前關卡所需的最高技巧，且這個資訊與關卡資料一致；若資料缺失，畫面應仍可讀、可理解，不能留下破版或原始占位字串。

#### Scenario A: 進入關卡即顯示技巧

**Given** 玩家進入任一關卡  
**When** 關卡畫面完成載入  
**Then** `#level-tech-hint` 應可見，且應顯示該關卡對應的最高技巧資訊

#### Scenario B: 顯示內容與關卡資料一致

**Given** 關卡資料已帶有最高技巧或技法層級資訊  
**When** 玩家查看 HUD  
**Then** 顯示內容應與資料一致，不可誤顯為不相干的技巧層級

#### Scenario C: 缺資料時安全降級

**Given** 技巧 metadata 不完整  
**When** 系統渲染 HUD  
**Then** HUD 應顯示可理解的 fallback 文案，且不可出現 `--`、空白破口，或影響主要遊戲區操作

#### Scenario D: 版面可讀且不遮擋核心玩法

**Given** 桌機或手機版面載入完成  
**When** 使用者觀察右上角技巧提示  
**Then** 技巧提示應保持可讀，不應蓋住盤面、操作區，或造成主要 HUD 擁擠到不可用

## 4. Definition of Done

W2 視為完成，需同時滿足以下條件：

1. Replay、Teach lazy-load、HUD 技巧提示三條線的驗收測試都能重複通過，且測試名稱與目前 repo 的 E2E 路徑一致。
2. 三項能力在主要目標裝置上可正常工作，沒有明顯破版、卡死、或阻塞性錯誤。
3. 資料缺失或載入失敗時都有明確 fallback，且不依賴口頭約定。
4. 相關文案、欄位命名、與資料來源說明已落地到文件或實作中，不再需要靠 PM 或工程師口頭對齊。
5. 相關程式碼已完成基本自測，且沒有引入已知會影響主遊戲流程的回歸。
6. 本文件列出的 PM 待決項已有明確結論，避免實作期間反覆改 scope。

## 5. 需要 PM 決策的項目

1. Replay 是否凍結為目前 modal + 既有控制集合，或允許再加一輪 UX 調整，例如更明確的步進提示、列表摘要、或 filter 文案。
2. Teach lazy-load 在資料缺失時的產品行為要採哪一種：靜默降級、明示錯誤態、還是引導使用者重試。
3. HUD 技巧提示的文案策略要採哪一種：技術名詞原文、中文譯名、或雙語顯示。
4. HUD 技巧提示的 fallback 文案要顯示什麼，以及是否要隱藏欄位本身。
5. W2 是否要求桌機與手機完全同版位，還是允許手機使用更短的技巧顯示字串。
6. Replay 的既有篩選與速度切換是否屬於本期凍結範圍，或只當作現有基線維持不變。
7. 這三項能力是否納入正式 QA 驗收清單，或只作為開發完成標準。
