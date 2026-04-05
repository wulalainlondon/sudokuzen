# Codebase Unification Plan

> 目標：消除重複模式、統一介面、降低維護成本。
> 原則：每次只改一個層面，每個 phase 獨立可 review、可 revert。

---

## Phase 1 — Storage 統一（高優先，影響資料安全）

### 問題

| 狀況 | 位置 |
|---|---|
| 有兩個 `readJson`/`writeJson` 實作 | `storage/keys.ts` vs `storage/localStorage.ts` |
| 直接使用魔法字串存取 localStorage | `features/teach/state/teachStore.ts:89,96` |
| 直接使用 hardcode key | `features/duo/duoMetrics.ts:21`（`'sudoku_duo_metrics_v1'`）|
| 用 `SK` 常數但繞過 wrapper 直接 `localStorage.getItem` | `features/levels.ts:66`、`wildController.ts:120` |

### 決策

- **唯一 storage 入口**：`src/storage/keys.ts`
  - `SK` 物件：所有 key 常數
  - `readJson<T>(key, fallback)` / `writeJson<T>(key, value)`：唯一 JSON 存取函數
- 刪除 `src/storage/localStorage.ts`（功能是 keys.ts 的子集，且無 error handling）

### 步驟

1. **新增缺失的 SK key**
   ```typescript
   // src/storage/keys.ts 新增：
   DUO_METRICS: 'sudoku_duo_metrics_v1',
   ```

2. **遷移 `teachStore.ts`**
   ```typescript
   // Before:
   localStorage.getItem('sudoku_teach_read')
   localStorage.setItem('sudoku_practice_done', JSON.stringify(done))

   // After:
   import { SK, readJson, writeJson } from '../../../storage/keys';
   readJson(SK.TEACH_READ, {})
   writeJson(SK.PRACTICE_DONE, done)
   ```

3. **遷移 `duoMetrics.ts`**
   ```typescript
   // Before:
   const raw = localStorage.getItem('sudoku_duo_metrics_v1');
   localStorage.setItem('sudoku_duo_metrics_v1', JSON.stringify(...));

   // After:
   import { SK, readJson, writeJson } from '../../storage/keys';
   readJson(SK.DUO_METRICS, defaultMetrics)
   writeJson(SK.DUO_METRICS, metrics)
   ```

4. **全專案掃描剩餘裸存取**
   ```bash
   grep -rn "localStorage\." src/ --include="*.ts" | grep -v "storage/keys.ts" | grep -v "storage/localStorage.ts"
   ```
   逐一改為 `readJson` / `writeJson` + `SK` 常數。

5. **刪除 `src/storage/localStorage.ts`**，更新所有 import 指向 `storage/keys`。

---

## Phase 2 — innerHTML 安全性統一（高優先，XSS 風險）

### 問題

`escapeHtml()` 存在於 `shared/html/escape.ts`，但部分地方未使用：

| 位置 | 風險 |
|---|---|
| `features/levels.ts:132` — `tierName`, `lockHint` 直接進模板 | 低（來自靜態資料）|
| `features/teach-legacy.ts:143` — `explanation.map(p => \`<p>${p}</p>\`)` | 中（資料來源需確認）|
| 任何 `r.hostAlias` 之類使用者輸入的地方 | 高 |

### 決策

**規則**：`.innerHTML` 賦值時，所有**非字面量**的字串必須經過 `escapeHtml()`。

例外：純 emoji、純數字、已知靜態常數可豁免，但需加註解。

### 步驟

1. **全專案掃描所有 innerHTML 賦值**
   ```bash
   grep -rn "innerHTML\s*=" src/ --include="*.ts" | grep -v "escapeHtml"
   ```

2. 對每一個命中：
   - 確認插入的變數來源（靜態 / 用戶輸入 / 外部資料）
   - 用戶輸入 / 外部資料 → 加 `escapeHtml()`
   - 確認靜態 → 加 `// static, no escape needed` 註解

3. 建立 lint 規則（可選）：針對 `innerHTML =` 觸發警告，要求審查。

---

## Phase 3 — 重複 readJson/writeJson 清理（低工時，高影響）

### 問題

兩個幾乎相同的實作並存，`storage/localStorage.ts` 沒有 quota 錯誤處理。

### 步驟

1. 確認 `storage/localStorage.ts` 的所有 import 來源
   ```bash
   grep -rn "from.*storage/localStorage" src/ --include="*.ts"
   ```

2. 將所有 import 改為 `from '../storage/keys'`（或對應相對路徑）

3. 刪除 `storage/localStorage.ts`

---

## Phase 4 — 私有變量命名統一（中優先，可讀性）

### 問題

模組層級的私有 `let` 有些有 `_` 前綴、有些沒有：

```typescript
// duoGame.ts
let _countdownLaunched = false;  // 有 _
let duoResultShown = false;       // 沒 _
let _lastSubmittedProgress = -1; // 有 _
```

### 決策

**規則**：模組層級（非 exported）的 `let` / `const` 一律加 `_` 前綴。
例外：`const` 常數（大寫）不需要。

### 步驟

1. 審查各 `features/duo/` 檔案的頂層 `let`
2. 統一加上 `_` 前綴（rename 操作，IDE 輔助完成）
3. 確認 linter `@typescript-eslint/no-unused-vars` 的 pattern 設定為 `/^_/u`（已有此設定）

---

## Phase 5 — 類型定義位置統一（中優先，架構清晰）

### 問題

類型定義分散在：
- `app/ui/uiOrchestrator.ts` — 定義 `PreLevelOpenPayload`
- `game/coreUiBridge.ts` — 定義 `GameHeaderPayload`
- `features/teach/state/teachStore.ts` — 定義 `TeachStore`
- `entities/` — 現有集中定義目錄，但未完全使用

### 決策

**規則**：
- 跨模組使用的 payload/interface → `src/entities/` 或各 feature 的 `types.ts`
- 只在單一模組內用的 type → 可留在該檔案頂部
- React store 的 state type → 留在 store 檔案（Zustand 慣例）

### 步驟

1. 找出所有跨模組引用的 interface
   ```bash
   grep -rn "import.*from.*uiOrchestrator\|import.*from.*coreUiBridge" src/ --include="*.ts"
   ```
2. 將跨模組 type 移至 `src/entities/` 對應分類檔案
3. 更新 import

---

## Phase 6 — 跨模組通訊統一（中優先，架構一致性）

### 問題

三種通訊模式並存：

| 模式 | 使用位置 |
|---|---|
| Bus 發布訂閱（`navigationBus`, `refreshBus`）| `app/navigation/`, `app/ui/` |
| 直接 `addEventListener` | `game/board.ts`, `app/legacyRuntime.ts` |
| 動態 import 橋接（繞避循環引用）| `features/levels.ts:14` — `import('./duo/duoLobby').then(m => m.closeDuoLobby())` |

### 決策

- **UI 事件**（點擊、鍵盤）：直接 `addEventListener`，不需要 bus
- **跨功能模組通訊**（levels ↔ duo ↔ wild）：使用 bus 或動態 import，選一種並記錄
- **動態 import 橋接**：這是循環引用的症狀；優先解決循環引用，而不是用動態 import 迴避

### 步驟

1. 列出所有動態 import 橋接的地方
   ```bash
   grep -rn "import('" src/ --include="*.ts" | grep -v "node_modules"
   ```
2. 分析哪些是合理的 lazy load（效能考量），哪些是循環引用迴避
3. 循環引用案例：重組依賴方向，或抽取共享 interface 到第三模組

---

## Phase 7 — DOM 操作風格統一（低優先，可讀性）

### 問題

| 操作 | 風格 A | 風格 B |
|---|---|---|
| 隱藏元素 | `.style.display = 'none'` | `.style.setProperty('display', 'none')` |
| Toggle class | `.classList.toggle('hidden', true)` | `.classList.add('hidden')` |
| 清空容器 | `.innerHTML = ''` | 逐個 `removeChild` |

### 決策

- 隱藏元素：優先用 CSS class（`.classList.toggle('hidden', bool)`）避免 inline style
- 必須用 inline style 時：用 `.style.display = 'none'`（簡潔，`.setProperty` 留給 CSS 變數）
- 清空容器：`.innerHTML = ''` 即可（除非有需要保留 event listener 的子元素）

### 步驟

1. 統一 `.setProperty('display', ...)` → `.style.display = ...`
2. 整理哪些元素應該用 `hidden` class 控制（需要對應 CSS 確認）

---

## Phase 8 — 路徑別名（低優先，開發體驗）

### 問題

深層目錄的相對路徑難以追蹤：
```typescript
import { t } from '../../../i18n/t';  // 在 features/teach/state/ 內
```

### 決策

新增 `@/` 別名指向 `src/`。

### 步驟

1. **`vite.config.ts`**：
   ```typescript
   import path from 'path';
   // plugins: [...], 新增：
   resolve: {
     alias: { '@': path.resolve(__dirname, './src') }
   }
   ```

2. **`tsconfig.json`**：
   ```json
   "compilerOptions": {
     "paths": { "@/*": ["./src/*"] }
   }
   ```

3. 可選：逐步遷移最深層的 import（不需要一次全改）

---

## 執行順序建議

```
Phase 1 (Storage)     → 獨立 PR，影響資料讀寫，需完整測試
Phase 2 (innerHTML)   → 獨立 PR，安全性審查
Phase 3 (重複工具)    → 搭配 Phase 1 一起做，工時小
Phase 4 (命名)        → 純 rename，低風險，搭配任何 PR 做
Phase 5 (類型)        → 獨立 PR，IDE rename 輔助
Phase 6 (通訊)        → 需要設計討論，風險中等
Phase 7 (DOM)         → 低風險，隨時可做
Phase 8 (路徑別名)    → 可選，單獨 PR
```

---

## 不在本計畫範圍內的事項

以下項目評估後**刻意不處理**，因為代價大於收益：

- **React 化所有 DOM 操作**：工程量太大，且現有 vanilla + React 混合架構目前是刻意設計
- **全域 `gs` 替換為 store**：`gs` 是刻意的效能優化（避免 React re-render），不應貿然替換
- **`duoGame.ts` 函數拆分**：可讀性改進，但功能穩定，風險不值得，留到有需要修改時再順手重構
- **統一錯誤處理到單一 Result 類型**：影響面太廣，目前 `showFeedback` 已是事實上的標準

---

*建立日期：2026-04-05*
*狀態：待執行*
