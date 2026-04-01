// 繁體中文 (Traditional Chinese) — default locale
// All user-visible strings in the app.

export const zhTW = {
  // ── App chrome ──────────────────────────────────────────────────────
  app: {
    title: 'SUDOKU ZEN',
    version: 'v{version}',
  },

  // ── Mode labels ─────────────────────────────────────────────────────
  mode: {
    normal: '一般',
    practice: '修行',
    world: '世界',
    speedrun: '競速',
    duo: '雙人',
  },

  // ── Navigation ──────────────────────────────────────────────────────
  nav: {
    back: '← 返回',
    close: '關閉',
    cancel: '取消',
    confirm: '確認',
    retry: '重新開始',
    nextLevel: '下一關',
    backToLevels: '返回選關',
    backToPractice: '返回修行',
    leaveWorld: '離開世界',
    continueWorld: '繼續世界',
    continueSession: '繼續修行 ({round}/10)',
    newSession: '新的修行輪',
    startChallenge: '開始挑戰',
    selectOther: '選擇其他關卡',
    abandonLevel: '放棄關卡',
    resumeGame: '繼續遊戲',
    quitNormal: 'Quit',
    quitPractice: '返回修行',
    quitWild: '離開世界',
  },

  // ── Stage map & tier ────────────────────────────────────────────────
  stage: {
    notChallenged: '尚未挑戰',
    inProgress: '進行中',
    unlocked: '已解鎖',
    locked: '🔒 境界未達',
    lockHint: '完成前一境界後解鎖',
    unlockRequired: '需先全通「{prev}」({cleared}/{needed}) 才能挑戰後續境界',
    unlockGeneric: '境界尚未達成，暫時無法挑戰。',
  },

  // ── Practice mode ───────────────────────────────────────────────────
  practice: {
    entryMain: '修行',
    entrySub: '41 技法 · 精準磨練',
    lobbyTitle: '修行',
    progress: '{completed}/41',
    dataLoadError: '修行資料載入失敗，請重試',
    prerequisiteRequired: '需先完成：{prereqs}（各通 {threshold} 關）',
    techLocked: '此技巧尚未解鎖',
    techComplete: '【{name}】修行圓滿',
    allComplete: '本技巧全部通關！',
    // Phase names
    phase1: '基礎定式流',
    phase2: '三流分歧',
    phase3: '匯合·著色',
    phase4: '鏈術',
    phase5: '終局',
    branchFish: '魚翼流',
    branchColor: '著色鏈',
    branchALS: '唯一·ALS',
  },

  // ── Wild / World mode ───────────────────────────────────────────────
  wild: {
    entryMain: '世界',
    entrySub: '隨機遭遇 · 十輪修行',
    lobbyTitle: '世界',
    // Profile
    online: '{count} 位修士在線',
    hunts: '狩獵數',
    bestiary: '圖鑑',
    encounters: '遭遇數',
    // Session
    sessionTitle: '修行輪進度',
    freeExplore: '自由探索',
    sessionUnlock: 'Lv.{level} 解鎖修行輪',
    techEncountered: '已遭遇 {count} 種技巧',
    newSession: '新修行輪',
    sessionStart: '啟動後將進入 10 輪連續遭遇',
    noTechThisRound: '本輪尚未遭遇任何技巧',
    roundProgress: '目前第 {round}/10 輪',
    bossComplete: 'Boss 輪完成',
    startNewSession: '開啟新修行輪',
    continueSession: '繼續修行',
    sessionMeta: '本輪累積 EXP {exp} · 勝場 {wins}/{round}',
    sessionTechs: '本輪已遭遇 {count} 種技巧',
    enterWorld: '進入世界',
    enterSub: '隨機遭遇 · 技巧修煉',
    roundSub: '第 {round}/10 輪 · 隨機遭遇 · 技巧修煉',
    lastRoundSub: '上一輪勝場 {wins}/10 · 總 EXP {exp}',
    // Encounter pools
    poolStable: '穩定遭遇池',
    poolAdvanced: '進階遭遇池',
    poolElite: '菁英遭遇池',
    poolHighRisk: '高風險遭遇池',
    // AutoCast
    autoCastLabel: '精通技巧自動施放',
    autoCastHint: '已精通的技巧將自動推演',
    autoCastMastered: '已精通 {count} 項（已討伐 {conquered}/{total}）',
    autoCastNone: '尚未精通任何技巧',
    autoCastOff: '所有技巧皆需手動施放',
    // Bestiary
    bestiaryTitle: '妖獸圖鑑',
    bestiaryCount: '{discovered} / {total}',
    filterAll: '全部',
    filterDiscovered: '已發現',
    filterConquered: '已討伐',
    rarityAll: '全稀有度',
    rarityCommon: '常見',
    rarityRare: '稀有',
    rarityLegendary: '傳說',
    rarityMythic: '神話',
    unknown: '？',
    undiscovered: '未發現',
    kills: '討伐 {kills} · 遭遇 {encounters}',
    studied: '已研習',
    study: '研習',
    fragments: '{current}/{required} 碎片',
    phaseLock: '🔒 Lv.{level} 解鎖「{name}」',
    phaseHeader: '── {name} ({discovered}/{total}) ──',
    unlockMore: 'Lv.{level} 解鎖更多',
    bestiaryFooter: '已發現 {discovered} / {total}',
    // Level titles
    levelTitle1: '見習修士',
    levelTitle5: '初階修士',
    levelTitle11: '中階修士',
    levelTitle21: '高階修士',
    levelTitle31: '精銳修士',
    levelTitle41: '煉獄修士',
    levelTitle51: '超凡修士',
    levelTitle61: '鏈術大師',
    levelTitle71: '殘集宗師',
    levelTitle80: '不朽真仙',
    // Encounter feedback
    sessionRound: '修行輪 {round}/10',
    encounterLoading: '遭遇中...',
    poolLoadError: '題庫載入失敗，請稍後重試',
    bossEncounter: 'Boss 遭遇！',
    firstEncounter: '初遇 — ？？？',
    gauntletCount: '百鬼夜行 {idx}/5',
    studyComplete: '{name} · {subtitle} 研習完成！',
    allBasicsComplete: '所有基礎技巧研習完成——修行輪已解鎖！',
    longPressHint: '提示：長按兩個格子可施放技能',
    continuousFillHint: '提示：開啟後可直接點擊空格填入選取中的數字',
    worldLoadError: '進入世界失敗，請稍後再試',
  },

  // ── Timer & game chrome ─────────────────────────────────────────────
  timer: {
    wildPrefix: '世界 {mode}',
    practicePrefix: '修行',
    // Challenge mode names
    modeStandard: '修行',
    modeIronman: '鐵壁',
    modeBlind: '盲審',
    modeTimed: '疾風',
    modeNoNotes: '無念',
    modeGauntlet: '百鬼',
  },

  // ── Input feedback ──────────────────────────────────────────────────
  feedback: {
    errorRemaining: '錯誤！{remaining} 次機會剩餘',
    livesExhausted: '命用完了！之後答錯將會冷卻',
    cooldown: '錯誤！冷卻 {seconds}s',
    complete: '完成！太棒了！',
    practiceComplete: '修行完成！',
    blindRevealing: '盲審揭曉中... 正確: {correct} / 錯誤: {errors}',
    blindResult: '盲審結果：{correct} 正確 / {errors} 錯誤',
    noNotesMode: '無念模式：筆記已禁用',
    continuousFillNote: '連續填入：切換為筆記模式',
    continuousFillAnswer: '連續填入：切換為答案模式',
    candidatesFilled: '已填入 {count} 個候選',
    boardError: '盤面有誤！已重置最後一步 (第 {count} 次提交)',
    speedrunToggle: '已切換至純粹競速模式 ⚡',
    unitComplete: '完成 {parts}！',
    unitRow: '一列',
    unitCol: '一欄',
    unitBox: '一宮',
  },

  // ── Win celebration ─────────────────────────────────────────────────
  win: {
    headingNormal: 'PERFECT FLOW',
    headingPractice: '修行完成',
    headingWild: '狩獵成功',
    sessionComplete: '修行輪完成！',
    sessionWins: '{wins}/10 勝 · +{exp} EXP',
    streakBonus: '連勝加成 ×{mult}',
    expGained: '+{exp} EXP',
    expLevelUp: '+{exp} EXP — Lv.{level}!',
    beatMentor: ' ⚡ 超越弈塵！',
    speedrunSubmissions: '⚡ 總提交: {count}次',
    firstKill: '「{name} · {sub}」首次討伐！',
    practiceProgress: '{tech} · {cleared}/{total}',
    mentorNoteTitle: '── 弈塵《殘篇》──',
    viewReplay: '查看回放',
    ghostChallenge: '👻 挑戰本局幽靈',
    viewBestReplay: '🎬 觀看最佳通關回放',
    tierAllCleared: '本境界已全部通關！',
  },

  // ── Game over ───────────────────────────────────────────────────────
  gameover: {
    headingNormal: 'GAME OVER',
    headingWild: '逃脫了。',
    subtextNormal: '你犯了 3 次錯誤',
    subtextWild: '「{tech}」消失在候選數的迷霧裡。',
    ironmanQuoteAttr: '── 弈塵《殘篇》──',
    ironmanQuote: '「鐵壁不是永遠不犯錯。\n是犯錯的時候，不會再犯第二次。」',
  },

  // ── Pre-level modal ─────────────────────────────────────────────────
  prelevel: {
    leaderboardTitle: '首通榜 TOP 3',
    loading: '載入中...',
    noRecord: '尚無通關紀錄',
    bestRecord: '最佳紀錄：{time} 星級：{stars}',
    bestRecordSpeed: '最佳紀錄：{time} ⚡ {submissions}次提交',
    techDisplay: '💡 核心技巧: {tech}',
    techDisplayTier: '💡 核心技巧: {tech} ({tier})',
  },

  // ── Stats modal ─────────────────────────────────────────────────────
  stats: {
    title: '個人統計',
    tabOverview: '總覽',
    tabAchievements: '成就',
    sectionGameData: '遊戲數據',
    sectionTierProgress: '各難度進度',
    sectionAchievements: '成就徽章',
    cleared: '通關數 ({pct}%)',
    threeStar: '三星通關',
    avgTime: '平均用時',
    fastestTime: '最速通關',
    fastestLevel: '最速 {name}',
    totalStars: '總星數',
    totalTime: '最佳用時總計',
    practiceProgress: '修行通關 ({pct}%) · {techs}/41 技巧全通',
    achievementsUnlocked: '已解鎖 {unlocked} / {total}',
  },

  // ── Library ─────────────────────────────────────────────────────────
  library: {
    title: '境界秘笈',
    subtitle: '依境界由淺入深研讀',
  },

  // ── Duo mode ────────────────────────────────────────────────────────
  duo: {
    zoneTitle: '💑 雙人對決',
    waiting: '等待中',
    waitingGuest: '等待加入...',
    ready: '準備完成',
    streak: '🔥 {holder} 連勝 {count} 場',
    surrender: '認輸',
    resultTitle: '💑 雙人對決結果',
    playAgain: '再來一局',
    connectionLost: '連線中斷，嘗試重新連接...',
    connectionFailed: '連線失敗',
    connectionError: '連線異常，請重試',
    opponentFinished: '⚡ {alias} 已完成！{time}{stars} — 加油！',
  },

  // ── Replay ──────────────────────────────────────────────────────────
  replay: {
    title: '本局步驟回放',
    filterAll: '全部',
    filterMistake: '錯誤',
    filterKey: '關鍵步',
    noSteps: '此篩選下暫無步驟',
    play: '▶ 播放',
    pause: '⏸ 暫停',
    reset: '重置',
    prevStep: '上一步',
    nextStep: '下一步',
    stepInfo: '步驟 {current} / {total}',
  },

  // ── Encounter transition ────────────────────────────────────────────
  encounter: {
    firstEncounterBadge: '初遇',
    bossStamp: '天劫',
    modeStamp: { standard: '修', blind: '盲', ironman: '鐵', noNotes: '念' },
  },

  // ── Alias ───────────────────────────────────────────────────────────
  alias: {
    placeholder: '輸入你的暱稱（1~24字）',
    save: '儲存暱稱',
    tooShort: '暱稱至少 1 個字',
    updated: '暱稱已更新：{alias}',
    cloudRestore: '已依暱稱「{alias}」恢復雲端進度',
  },

  // ── Firebase / leaderboard ──────────────────────────────────────────
  firebase: {
    disabled: '尚未啟用 Firebase 排行。',
    noRecords: '尚無玩家首通紀錄',
    loadFailed: '載入失敗',
  },

  // ── Skills ──────────────────────────────────────────────────────────
  skill: {
    cast: '施放',
    domainExpansion: '領域展開',
    domainHint: '領域展開：填入所有合法候選',
  },

  // ── Teach ───────────────────────────────────────────────────────────
  teach: {
    bookTitle: '境界秘笈',
    prevStep: '← 上一步',
    nextStep: '下一步 →',
    skip: '先跳過',
    startPractice: '馬上練習 →',
    practiceInstruction: '點擊要消去的候選數',
    practiceSelected: '已選 {count} 個',
    hint: '💡 提示',
    confirmElim: '確認消去',
    revealAnswer: '看答案',
    // Group names
    group1: '第一層・基礎定式',
    group1Hint: '先建立基本觀念與候選數紀律',
    group2: '第二層・候選數結構',
    group2Hint: '看懂線上/宮內候選關係與初階刪減',
    group3: '第三層・圖形與刪減',
    group3Hint: '翼型、魚型與鎖定鏈的實戰應用',
    group4: '第四層・鏈式推理',
    group4Hint: '進入顏色鏈、唯一矩形與高階魚型',
    group5: '第五層・高階整合',
    group5Hint: 'ALS、Template、Sue de Coq 等高階可訓練整合技',
    group6: '第六層・宗師結構',
    group6Hint: 'Exocet / Death Blossom 等超高難結構技巧',
  },

  // ── Toast ───────────────────────────────────────────────────────────
  toast: {
    achievementUnlock: '成就解鎖',
  },

  // ── Misc ────────────────────────────────────────────────────────────
  misc: {
    resetConfirm: '確定要重新開始本關嗎？當前進度將遺失。',
    worldLoadingFeedback: '世界載入中...',
    blindLabel: '盲審',
    noLivesRemaining: '⚠ 無剩餘',
  },
} as const;

export type Locale = typeof zhTW;
