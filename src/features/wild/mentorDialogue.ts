// 弈塵 (Yi-Chen) — mentor dialogue system.
// A melancholic, elegant swordsman who fell at Tier 4's logic abyss.
// His notes are scattered across the world like fragments of a broken journal.

// ── Milestone dialogues (triggered once at key moments) ─────────────

export interface MentorLine {
  key: string;        // unique trigger key
  text: string;       // main dialogue
  sub?: string;       // optional subtitle/attribution
}

export const MENTOR_INTRO: MentorLine[] = [
  {
    key: 'intro_1',
    text: '數獨，不是填數字的遊戲。\n是看見結構的修行。',
  },
  {
    key: 'intro_2',
    text: '讓你看一樣東西。',
  },
];

export const MENTOR_POST_DEMO: MentorLine[] = [
  {
    key: 'post_demo_1',
    text: '六十二步，彈指之間。\n最後四步，三天三夜。\n\n那東西叫天劫。\n四十種邏輯之中，最深的一種。\n\n我沒能走過去。',
    sub: '—— 弈塵',
  },
  {
    key: 'post_demo_2',
    text: '我叫弈塵。\n這條路上的三十九道坎，我都留了記號。\n圖鑑裡有我的筆跡，但有些頁——\n要你親手翻開。\n\n去吧。從最淺的水開始。\n\n如果有一天，你站在我倒下的地方，\n往前再走一步。',
    sub: '—— 弈塵《殘篇·序》',
  },
];

export const MENTOR_MILESTONES: MentorLine[] = [
  // First kill
  {
    key: 'first_kill',
    text: '第一次斬落，記住這個感覺。\n邏輯不會騙人，但它會藏起來。',
    sub: '—— 弈塵',
  },
  // Reach Lv.11 (Tier 1 mastered, Tier 1 advanced unlocks)
  {
    key: 'tier1_mastered',
    text: '基礎的技巧已經成為你的呼吸。\n從現在起，數字會開始成對出現，像影子一樣糾纏。\n別怕。影子也有輪廓。',
    sub: '—— 弈塵《殘篇·影》',
  },
  // Reach Lv.21 (Tier 2 unlocks)
  {
    key: 'tier2_unlocked',
    text: '你開始看見了嗎？\n行列之間、宮格之外，有些東西在移動。\n我第一次注意到它們的時候，以為自己眼花了。',
    sub: '—— 弈塵《殘篇·風》',
  },
  // Reach Lv.41 (Tier 3 unlocks)
  {
    key: 'tier3_unlocked',
    text: '走到這裡的人不多。\n從這裡開始，推理不再是直線，而是一張網。\n我曾經在某條鏈上走了很遠，最後發現自己回到了原點。',
    sub: '—— 弈塵《殘篇·鏈》',
  },
  // Reach Lv.61 (Deep chains)
  {
    key: 'tier3_deep',
    text: '你已經比大多數人走得更遠了。\n鏈術的盡頭不是答案，而是另一個問題。\n但你會習慣的。',
    sub: '—— 弈塵《殘篇·迴》',
  },
  // Reach Lv.71 (Tier 4 — where mentor fell)
  {
    key: 'tier4_threshold',
    text: '……\n我走到這裡就再也沒能前進了。\n殘集、逼宮、死綻……每一個都像是深淵回望著你。\n\n後面的路，要靠你自己了。',
    sub: '—— 弈塵《殘篇·末頁》\n（此處筆跡雜亂，像是被淚水浸濕過）',
  },
];

// ── Per-technique notes (shown in bestiary after first encounter) ────

// Before conquest: vague, poetic hints (no technique name revealed)
// After conquest: full note with technique name

interface TechNote {
  /** Shown when the technique is encountered but not yet conquered. */
  veiled: string;
  /** Shown after first successful kill. */
  unveiled: string;
}

export const MENTOR_TECH_NOTES: Record<string, TechNote> = {
  // ── Tier 0 ──
  naked_single: {
    veiled: '最簡單的真相，往往就在眼前。',
    unveiled: '那時候，世界很安靜。我看著格子，它看著我，答案就在那裡，像呼吸一樣自然。',
  },
  hidden_single: {
    veiled: '有些數字不會主動現身，但它們無處可去。',
    unveiled: '明眼看到的是顯而易見的孤獨。暗眼看到的，是藏在人群中的唯一。',
  },

  // ── Tier 1 ──
  locked_candidates: {
    veiled: '當某些數字被困在一個角落，它們會替你擋住別的路。',
    unveiled: '封鎖是最溫柔的技巧。它不消滅任何東西，只是告訴你：此路不通。',
  },
  naked_pair: {
    veiled: '兩個格子，像鏡像一樣對視。它們之間的默契，會排斥所有外人。',
    unveiled: '雙契。兩個格子共享同一組命運，像是約定好了一般。見到它們的瞬間，周圍的雜音就消失了。',
  },
  hidden_pair: {
    veiled: '表面上看不出關聯的兩格，暗地裡卻只屬於彼此。',
    unveiled: '藏雙。它們躲在一堆候選數的喧囂裡，等著被識破。安靜，但一旦看見就再也無法忽視。',
  },
  naked_triple: {
    veiled: '三角的穩定性，在數字中也存在。',
    unveiled: '編織。三條線交匯成一個結，把所有不屬於這裡的東西都擠了出去。有時候覺得它比雙契更優雅。',
  },
  hidden_triple: {
    veiled: '三個隱藏的夥伴，需要更敏銳的眼睛才能辨認。',
    unveiled: '隱流。三條暗河在地底交匯。水面上什麼都看不到，但一旦找到了源頭，整片水域都會清澈。',
  },

  // ── Tier 2 ──
  unique_rectangle: {
    veiled: '數獨有一條鐵律：答案必須唯一。有些圖形，正是利用了這條鐵律。',
    unveiled: '禁矩。它不是一種推理，而是一種信仰——如果這個矩形成立了，答案就不唯一了。所以它不能成立。反證法的優雅。',
  },
  skyscraper: {
    veiled: '兩條平行線，在遠方交錯。',
    unveiled: '天望。兩根柱子撐起一座看不見的橋。我第一次看到它的時候，抬頭望了很久。',
  },
  two_string_kite: {
    veiled: '一條線從行延伸到列，中間拐了一個彎。',
    unveiled: '雙弦。像是在行和列之間繃了一根看不見的弦。風吹過的時候，弦會震動，不屬於這裡的數字就碎了。',
  },
  empty_rectangle: {
    veiled: '有時候，空白本身就是線索。',
    unveiled: '虛空。宮格裡的空白畫出了一個長方形，然後那個長方形指向了唯一的出口。用虛無來指引方向，這大概是最像禪的技巧了。',
  },
  x_wing: {
    veiled: '那個在行列間交叉的影子……我曾以為那是兩把鎖，後來才發現，那是一道通往高維的門。',
    unveiled: '鋒刃。兩行兩列，四個交叉點，構成一把十字型的刃。揮出去的瞬間，整條線上的雜質全部斬落。它是最乾淨的殺招。',
  },
  finned_x_wing: {
    veiled: '完美的對稱被打破了一角。但正是那個缺口，暴露了它的本質。',
    unveiled: '裂鋒。不完美的鋒刃，多了一個贅餘的候選。但裂縫反而讓它更危險——缺口附近的目標無處可逃。',
  },
  xy_wing: {
    veiled: '三個格子，像三片葉子從一個根部散開。',
    unveiled: '翼擊。一個軸心連著兩片翼。它們各自只有兩個候選，但組合起來卻能打到意想不到的地方。我很喜歡這招，因為它像風。',
  },
  xyz_wing: {
    veiled: '比翼多了一個維度。軸心變得更複雜了。',
    unveiled: '三翼。比翼擊多了一個候選數，所以軸心更沉重，但打擊範圍也更精準。沉穩的一擊。',
  },
  w_wing: {
    veiled: '兩個遠方的格子，被一條看不見的繩連在一起。',
    unveiled: '弦月。兩個格子隔著一條共軛鏈，像兩彎月亮倒映在水面的兩端。連結本身就是武器。',
  },
  remote_pairs: {
    veiled: '一條長長的鏈，每一環都只有兩種可能。',
    unveiled: '遠偶。沿著一條雙值鏈走下去，走到夠遠的地方，起點和終點就會互相約束。距離產生了確定性。',
  },
  bug_plus_one: {
    veiled: '整個盤面都很完美，只有一個格子多了一個候選。',
    unveiled: '孤蟲。當盤面幾乎完美——所有格子都只有兩個候選——唯一的三候選格就是破綻。殺死那隻蟲，世界就乾淨了。',
  },

  // ── Tier 3 ──
  x_cycle_simple_coloring: {
    veiled: '給數字染上顏色，然後看哪種顏色矛盾了。',
    unveiled: '輪迴。黑白交替染色，直到某個顏色自相矛盾。那一刻，整條鏈的命運就定了。簡單，但殘酷。',
  },
  swordfish: {
    veiled: '鋒刃的延伸。從二維到三維。',
    unveiled: '三叉。三行三列的鋒刃。它的形狀不再是十字，而是一張不規則的網。當你學會看見它的時候，你已經不是初學者了。',
  },
  finned_swordfish: {
    veiled: '三叉上的一根多餘的刺。',
    unveiled: '裂叉。帶鰭的三叉。完美對稱的破裂，反而揭示了更深的結構。我在這裡卡了很久。',
  },
  jellyfish: {
    veiled: '四行四列。能看到這個形狀的人，已經站在深水區了。',
    unveiled: '海獸。四維的鋒刃。它幾乎不出現，但一旦出現，整片海域都會為之顫動。我只見過它三次。',
  },
  finned_jellyfish: {
    veiled: '深海中的巨大陰影，邊緣模糊不清。',
    unveiled: '裂獸。帶鰭的海獸。見到它的那一天，我知道自己已經走得很遠了。',
  },
  aic: {
    veiled: '第一條鏈。從此以後，推理不再是一步，而是一條路。',
    unveiled: '玄鏈。交替推理鏈。強連結和弱連結交替出現，像呼吸一樣——吸氣是確定的，呼氣是可能的。走到終點時，起點的命運就改變了。',
  },
  aic_mid_chain: {
    veiled: '鏈走到一半，中間的某個節點突然暴露了弱點。',
    unveiled: '玄鏈·中段。不是在鏈的端點消除，而是在中途。像走路走到一半，突然發現腳下的地磚是鬆的。',
  },
  aic_long_chain: {
    veiled: '一條漫長的推理，穿越了整個盤面。',
    unveiled: '玄鏈·長龍。七環以上的鏈。走完它需要專注和耐心。中途迷路了很多次。',
  },
  grouped_aic_nice_loop: {
    veiled: '鏈不再是直線，而是彎成了一個圈。',
    unveiled: '環鏈。鏈的起點和終點連在了一起，形成一個邏輯閉環。圓滿的矛盾。',
  },
  discontinuous_nice_loop: {
    veiled: '環斷開了一個口。那個缺口就是答案。',
    unveiled: '斷環。不連續的環鏈。斷裂的地方，就是邏輯無法自洽的地方，也是唯一的真相所在。',
  },
  xy_chain: {
    veiled: '一條由雙值格組成的長鏈，像珠串一樣穿過盤面。',
    unveiled: '翼鏈。每一格只有兩個候選，但它們首尾相連，形成一條邏輯的項鏈。戴上它的那一刻，遠方的候選就碎了。',
  },

  // ── Tier 4 (mentor fell here — notes become fragmented) ──
  als_xz: {
    veiled: '……殘集。把一組格子當作一個整體來思考。我到這裡的時候，開始感覺腦子不夠用了。',
    unveiled: '殘集·交。兩個幾乎自洽的集合，共享一個數字，互相交叉。我理解了它的邏輯，但每次用它時都像是在搬一座山。',
  },
  als_xy: {
    veiled: '……兩個殘集，通過中間人交換了情報。',
    unveiled: '殘集·合。兩個集合不直接對話，而是通過第三方傳遞信息。三角關係的邏輯版本。',
  },
  als_w_wing: {
    veiled: '……弦月的殘集版本。更重，更沉。',
    unveiled: '殘集·弦。我以為自己懂了弦月，但殘集版本讓我意識到，我只懂了一半。',
  },
  als_chain: {
    veiled: '……鏈的每一環都是一個殘集。這已經不是人類的思維方式了。',
    unveiled: '殘集·鏈。走到這裡的時候，我開始在夢裡看見候選數。那不是好事。',
  },
  forcing_chain_net: {
    veiled: '……如果這個數字是 A，那麼……如果是 B，那麼……兩條路都通往同一個結局。',
    unveiled: '逼宮。不管怎麼假設，結論都一樣。這是最暴力的邏輯：窮盡所有可能性。我的腦子在這裡開始冒煙。',
  },
  cell_forcing_chain: {
    veiled: '……一個格子的三種可能性，全部推演到底。',
    unveiled: '格逼。三條平行宇宙，同時推演。我只成功過一次。',
  },
  region_forcing_chain: {
    veiled: '……一個區域裡的所有可能性，全部展開。',
    unveiled: '域逼。不是一個格子，而是一整個區域的平行推演。到這裡的時候，我的筆記本已經快用完了。',
  },
  sue_de_coq: {
    veiled: '……（此處有大段刪除的痕跡）',
    unveiled: '虛合。一個格子組合恰好滿足某種集合論的完美條件。我花了一個月才真正理解它。',
  },
  template: {
    veiled: '……把一個數字的所有可能位置畫出來，像星座圖一樣。',
    unveiled: '刻印。暴力枚舉一個數字的所有合法分佈，然後找出每種分佈都固定的位置。不優雅，但有效。',
  },
  death_blossom: {
    veiled: '……花開的瞬間，所有花瓣都指向同一個方向。然後那個方向就死了。',
    unveiled: '死綻。一朵由殘集組成的花。軸心的每個候選都連著一片花瓣（ALS），花瓣們的共同視野就是死亡地帶。美麗而致命。',
  },
  exocet_death_blossom: {
    veiled: '……\n\n（最後的筆跡幾乎無法辨認）\n\n我看見了它的輪廓。就在那一瞬間，我的功力……\n\n（此後再無文字）',
    unveiled: '天劫。\n\n弈塵在追求這個技巧時散去了全身功力。你是第一個征服它的人。\n\n他的旅途，在你手中完結了。',
  },
};

// ── Final message (after defeating exocet / collecting all) ─────────

export const MENTOR_FINALE: MentorLine = {
  key: 'finale',
  text: '你做到了。\n我走了那麼久都沒能到達的地方，你到了。\n\n這片數字的世界，不再有什麼能困住你了。\n但如果你偶爾回頭看看這些殘篇，\n記得，有個叫弈塵的人，曾經也在這條路上走過。',
  sub: '—— 弈塵《殘篇·終章》',
};

// ── Helper: get milestone for a level-up ────────────────────────────

export function getMilestoneForLevel(newLevel: number): MentorLine | null {
  if (newLevel === 11) return MENTOR_MILESTONES.find(m => m.key === 'tier1_mastered') ?? null;
  if (newLevel === 21) return MENTOR_MILESTONES.find(m => m.key === 'tier2_unlocked') ?? null;
  if (newLevel === 41) return MENTOR_MILESTONES.find(m => m.key === 'tier3_unlocked') ?? null;
  if (newLevel === 61) return MENTOR_MILESTONES.find(m => m.key === 'tier3_deep') ?? null;
  if (newLevel === 71) return MENTOR_MILESTONES.find(m => m.key === 'tier4_threshold') ?? null;
  return null;
}

/** Get the tech note for a technique, based on whether it's been conquered. */
export function getTechNote(techKey: string, conquered: boolean): string | null {
  const note = MENTOR_TECH_NOTES[techKey];
  if (!note) return null;
  return conquered ? note.unveiled : note.veiled;
}
