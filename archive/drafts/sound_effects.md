# Sudoku Zen — 音效清單與下載指南

## 需要的音效（對應程式碼）

| Function | 音效描述 | 搜尋關鍵字 |
|----------|---------|-----------|
| `playFillSound()` | 清脆木魚敲擊或水滴聲 | `wood tap` / `zen click` / `water drop ui` |
| `playErrorFeedback()` | 低沉短促撞擊，不刺耳 | `error soft` / `dull thud` / `block hit` |
| `playNoteToggleSound()` | 翻頁或鉛筆輕點聲 | `pencil tap` / `paper flip` / `toggle switch soft` |
| `playEraseSound()` | 橡皮擦輕擦或氣泡消失 | `erase` / `rubber eraser` / `pop soft` |
| 通關音效 | 風鈴或木琴短旋律（3-5音） | `wind chime success` / `puzzle solved` / `zen bell` |
| Wild 攻擊 | 劍擊或出劍聲 | `sword swing` / `blade whoosh` / `combat hit` |
| Wild 受傷 | 低沉撞擊聲 | `impact thud` / `damage hit` |
| Wild 勝利 | 輕快上揚音階（3秒內） | `victory fanfare short` / `level complete` |
| UI 點擊 | 極短促 tick 聲 | `ui click` / `button tap` / `menu select soft` |

---

## 免費商用音效網站

| 網站 | 授權 | 特色 |
|------|------|------|
| **Pixabay**（首選） | Pixabay License，可商用免署名 | 最省事，直接下載 |
| **Mixkit** | Mixkit Free License，可商用 | 遊戲音效專區品質好 |
| **OpenGameArt** | CC0 / CC-BY | 有整包 RPG 音效包 |
| **Freesound** | 選 CC0 過濾 | 最豐富但要逐一確認授權 |
| **Zapsplat** | Standard License，需免費註冊 | 品質高，需署名 |

---

## 建議下載順序

1. 先去 **Pixabay** 搜尋 `ui click`、`zen bell`、`success chime`
2. 去 **OpenGameArt** 搜尋 `RPG sound effects` 找 Wild 模式戰鬥音效包
3. 去 **Mixkit** 補齊缺漏的

---

## 格式建議

- **首選 OGG**（檔案小，Web/PWA 支援好）
- **備用 MP3** 128kbps（相容性最高）
- 避免 WAV（檔案太大）

---

## 放置路徑建議

```
public/
└── sounds/
    ├── fill.ogg
    ├── error.ogg
    ├── note_toggle.ogg
    ├── erase.ogg
    ├── win.ogg
    ├── ui_click.ogg
    ├── wild_attack.ogg
    ├── wild_hurt.ogg
    └── wild_victory.ogg
```
