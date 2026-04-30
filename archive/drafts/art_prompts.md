# Sudoku Zen — ComfyUI 生圖 Prompt 完整指南

## 美術風格定義

**核心風格**：暗色系數位水墨，結合現代 UI 質感
- 背景：深黑/深藍/深紫
- 主體：發光輪廓、墨水質感、幾何光效
- 氛圍：禪意、神秘、宇宙感

**通用正面 prompt 基底**（所有圖都加）：
```
dark mystical digital art, glowing ink brush strokes, deep space background,
dark navy and purple tones, ethereal glow, game concept art,
high quality, detailed, 4k, isolated character
```

**通用負面 prompt**（所有圖都加）：
```
photorealistic, 3d render, western cartoon, bright colors, white background,
blurry, low quality, watermark, text, signature, extra limbs
```

---

## 一、Wild 模式敵人立繪

每個解題技巧對應一隻敵人，依稀有度分級。

### ComfyUI 建議設定
- Model：FLUX.1-schnell-fp8
- Steps：4
- CFG：1.0
- Resolution：512×768（直立角色）
- Batch：4（每次出 4 張挑最好）

---

### 【Common】普通敵人

**明眼（naked_single）**
```
dark mystical digital art, glowing ink brush strokes,
a simple floating eye creature, single glowing pupil emitting soft light,
transparent body like glass, calm and watchful expression,
beginner-level enemy, simple geometric form,
deep purple background, game sprite style
```

**暗眼（hidden_single）**
```
dark mystical digital art, glowing ink brush strokes,
a shadowy eye creature hiding within darkness,
partially visible glowing eye peeking from shadow,
body made of shifting dark mist, elusive and subtle,
deep navy background, game sprite style
```

**封鎖（locked_candidates）**
```
dark mystical digital art, glowing ink brush strokes,
a blocky golem creature with iron chains wrapped around its body,
glowing runes on its surface, arms spread wide blocking passage,
made of dark stone and glowing seals, guardian-type enemy,
dark slate background, game sprite style
```

**雙契（naked_pair）**
```
dark mystical digital art, glowing ink brush strokes,
twin spirit creatures connected by a glowing thread of light,
mirror images of each other, one dark one bright,
linked at the chest by golden chain, floating in unison,
deep indigo background, game sprite style
```

**藏雙（hidden_pair）**
```
dark mystical digital art, glowing ink brush strokes,
two creatures hidden within a single shadow cloak,
only their glowing eyes visible from the darkness,
wrapped in camouflage magic, secretive and dangerous,
black and deep purple background, game sprite style
```

**編織（naked_triple）**
```
dark mystical digital art, glowing ink brush strokes,
three small creatures intertwined and woven together,
forming a single larger entity with three heads,
glowing threads connecting their bodies,
complex braided form, teal and purple glow,
dark background, game sprite style
```

**隱流（hidden_triple）**
```
dark mystical digital art, glowing ink brush strokes,
three phantom creatures flowing like an underground current,
barely visible beneath a dark surface,
ripple effects, hidden movement, three glowing trails,
deep ocean blue background, game sprite style
```

---

### 【Rare】稀有敵人

**鋒刃（x_wing）**
```
dark mystical digital art, glowing ink brush strokes,
a razor-sharp X-shaped flying creature, four blade wings forming an X,
jet black body with red glowing edges, slicing through space,
crossed blade silhouette, fast and dangerous,
crimson and black background, game sprite style
```

**禁矩（unique_rectangle）**
```
dark mystical digital art, glowing ink brush strokes,
a forbidden rectangular creature made of glowing geometric frames,
four corners emit intense light, body is a living rectangle,
ancient seal-like markings, forbidden power contained within,
gold and black background, game sprite style
```

**孤蟲（bug_plus_one）**
```
dark mystical digital art, glowing ink brush strokes,
a lone glowing insect creature, larger than others,
bioluminescent body with complex wing patterns,
surrounded by extinguished smaller insects,
lonely and powerful, eerie green glow,
dark forest background, game sprite style
```

**天望（skyscraper）**
```
dark mystical digital art, glowing ink brush strokes,
a tall tower-like creature stretching upward,
impossibly thin and tall body with glowing windows,
reaches toward stars, built from compressed shadow,
architectural monster form, silver and blue glow,
cosmic background, game sprite style
```

**翼擊（xy_wing）**
```
dark mystical digital art, glowing ink brush strokes,
a three-winged strike creature in attack pose,
Y-shaped body with three glowing energy wings,
channeling attack through wing tips, mid-flight combat stance,
electric yellow and purple glow, dynamic motion lines,
storm background, game sprite style
```

**海獸（jellyfish）**
```
dark mystical digital art, glowing ink brush strokes,
a massive cosmic jellyfish creature floating in void,
four rows of tentacles hanging below,
translucent body with deep sea bioluminescence,
ancient and enormous, boss-level presence,
abyssal dark blue background, game sprite style
```

---

### 【Legendary】傳說敵人

**輪迴（x_cycle_simple_coloring）**
```
dark mystical digital art, glowing ink brush strokes,
a cyclical dragon creature biting its own tail,
forming a perfect circle of alternating light and dark,
yin-yang energy flowing through its serpentine body,
eternal loop form, gold and obsidian colors,
mandala-like aura, game sprite style
```

**玄鏈（aic）**
```
dark mystical digital art, glowing ink brush strokes,
a legendary chain entity, body made of alternating strong and weak links,
each link glowing alternately bright and dim,
stretching across the void, ancient and intelligent,
cosmic chain weapon form, silver and dark gold,
starfield background, game sprite style, legendary boss
```

**環鏈（grouped_aic_nice_loop）**
```
dark mystical digital art, glowing ink brush strokes,
a closed loop chain creature forming a perfect ring,
continuous flowing energy with no beginning or end,
grouped segments pulsing with power,
ring-shaped boss entity, platinum and void black,
reality-warping aura, game sprite style, legendary boss
```

---

### 【Mythic】神話 Boss

**斷環（discontinuous_nice_loop）**
```
dark mystical digital art, glowing ink brush strokes,
a reality-breaking entity, a ring shattered into fragments,
pieces floating in impossible space, broken loop radiating chaotic energy,
each fragment a different dimension, paradox creature form,
reality crack effects, white and void colors,
dimension-breaking background, game sprite style, mythic final boss
```

**三叉（swordfish）**
```
dark mystical digital art, glowing ink brush strokes,
a mythic three-pronged entity, cosmic trident form,
three parallel lines of pure energy converging,
ancient deep sea god aesthetic, three rows of power,
massive and overwhelming, dark ocean deity,
abyss background, game sprite style, mythic boss
```

---

## 二、難度層級背景圖

每個難度層級的選關介面背景。
Resolution：1280×720（橫向）

**初心**
```
dark mystical digital art, beginner path background,
simple glowing grid pattern, soft warm light,
golden stepping stones leading forward, gentle mist,
welcoming and calm, beginning of a journey,
warm amber and soft white glow, subtle dark background
```

**禪**
```
dark mystical digital art, zen meditation background,
single glowing circle in empty space, ripples spreading outward,
perfect stillness, ink drop in water effect,
minimal and peaceful, soft blue radiance,
black background with gentle light
```

**虛空**
```
dark mystical digital art, void emptiness background,
infinite dark space with scattered light particles,
empty rectangle of light floating in void,
nothingness contains everything, paradox aesthetic,
deep space purple, pinpoint light sources
```

**無我**
```
dark mystical digital art, no-self dissolution background,
silhouette of figure dissolving into light particles,
identity fading into the grid, self becoming void,
spiritual dissolution effect, white particles on black,
transcendence aesthetic
```

**本源**
```
dark mystical digital art, origin source background,
primordial glowing core at center, creation energy radiating outward,
ancient geometric patterns emerging from light,
first principles aesthetic, golden core on deep black,
creation myth visual
```

**寂滅**
```
dark mystical digital art, nirvana annihilation background,
final extinguishing of light, single flame going out,
beautiful extinction, last ember in infinite darkness,
serene ending aesthetic, dying ember orange on black,
profound silence visual
```

**空鏡**
```
dark mystical digital art, empty mirror background,
infinite reflections of empty space, mirror within mirror,
pure reflection containing nothing, zero and infinity,
mirror maze with no reflections, silver and void,
recursive emptiness aesthetic
```

**星潮**
```
dark mystical digital art, star tide background,
galaxy wave crashing like ocean, stars flowing as water,
cosmic tide patterns, stellar current movements,
universe as ocean aesthetic, blue and silver galaxy flow,
deep space background
```

**玄鏈**
```
dark mystical digital art, mysterious chain background,
infinite alternating chain extending across cosmos,
strong and weak links pulsing with alternate light,
universe held together by chains of logic,
chain constellation pattern, gold and shadow,
cosmic background, final tier aesthetic
```

---

## 三、Steam 素材

### Capsule Header（460×215）
```
dark mystical digital art, game header artwork,
sudoku grid glowing in space, RPG battle scene overlay,
puzzle and combat fusion, dramatic lighting,
title space at top, Chinese calligraphy aesthetic mixed with sci-fi,
deep purple and gold color scheme, epic game cover feel
```

### Main Capsule（231×87）
```
dark mystical digital art, small game capsule,
sudoku 9x9 grid with glowing numbers,
mysterious figure meditating above grid,
compact dramatic composition, purple glow
```

### Steam Page Hero（616×353）
```
dark mystical digital art, game promotional artwork,
split scene: left side peaceful sudoku grid, right side epic RPG battle,
player character facing a chain monster,
dramatic lighting divide, cinematic composition,
deep blue purple atmosphere, game launch art quality
```

---

## 四、UI 素材

### 技巧成就徽章（每種技巧一個，128×128）

**Common 技巧徽章基底**
```
dark mystical icon design, circular badge,
glowing symbol on dark background, game achievement icon,
simple geometric inner symbol, bronze border,
128x128 icon style, clean and readable
```

**Rare 技巧徽章基底**
```
dark mystical icon design, circular badge,
complex glowing symbol on dark background,
silver border with blue glow, rare achievement aesthetic,
128x128 icon style
```

**Legendary 技巧徽章基底**
```
dark mystical icon design, circular badge,
intricate glowing rune symbol, golden border,
legendary achievement glow effect, particle effects,
128x128 icon style
```

**Mythic 技巧徽章基底**
```
dark mystical icon design, circular badge,
reality-warping symbol, multicolor prismatic border,
mythic tier overwhelming power, void background,
128x128 icon style
```

### 載入畫面 / Splash Screen
```
dark mystical digital art, loading screen artwork,
sudoku grid transforming into cosmos,
numbers floating and becoming stars,
meditative figure in lotus position at center,
breath of the universe aesthetic,
full screen 1920x1080, epic and serene
```

---

## 五、生成順序建議

| 優先 | 素材 | 用途 | 數量 |
|------|------|------|------|
| 1 | Wild 敵人（Common × 7） | Wild 模式核心體驗 | 28 張（每個出 4 張挑 1）|
| 2 | Steam 素材 | 上架必備 | 12 張 |
| 3 | 難度背景（9 張） | 選關介面質感 | 36 張 |
| 4 | Wild 敵人（Rare × 6） | Wild 模式深度 | 24 張 |
| 5 | Wild Boss（Legendary/Mythic × 5）| 高峰體驗 | 20 張 |
| 6 | 成就徽章 | 完整度 | 41 張 |

**總計約 160 張圖，挑選後留 40-50 張使用。**

---

## 六、風格統一技巧

1. 第一批出圖後，挑最滿意的一張存為 `style_anchor.png`
2. 之後所有圖在 ComfyUI 加 IP-Adapter 節點，載入 `style_anchor.png`，強度設 0.4-0.6
3. 所有圖風格自動對齊，視覺一致性大幅提升
