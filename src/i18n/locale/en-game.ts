// English translations for game logic strings (Phase 2 extraction)
// These correspond to keys added to zh-TW.ts during i18n extraction.
// Merge into the main en.ts locale when ready.

export const enGame = {
  // ── Challenge modes (wildState.ts) ─────────────────────────────────
  challenge: {
    standardName: 'Standard',
    standardDesc: '3 lives, steady progress',
    ironmanName: 'Iron Man',
    ironmanDesc: 'Zero tolerance, one mistake ends it',
    blindName: 'Blind Judge',
    blindDesc: 'Fill everything first, then reveal results',
    timedName: 'Time Attack',
    timedDesc: 'Race against the clock',
    noNotesName: 'No Notes',
    noNotesDesc: 'Notes disabled, pure mental math',
    gauntletName: 'Gauntlet',
    gauntletDesc: '5 puzzles in a row, no breaks',
  },

  // ── Duo mode (extra runtime strings) ─────────────────────────────
  duoRuntime: {
    opponent: 'Opponent',
    statusReady: 'Ready',
    statusWaiting: 'Waiting',
    waitingJoin: 'Waiting for player...',
    streakBadge: '\uD83D\uDD25 {holder} {count}-win streak',
    streakBadgeExcl: '\uD83D\uDD25 {holder} {count}-win streak!',
    winsRecord: '{name} {wins} wins',
    winsVs: '{a} {aWins} wins \u2014 {b} {bWins} wins',
    readyConfirm: '\u2713 Ready',
    readyPrompt: "I'm ready",
    connectionRetry: 'Connection lost, reconnecting...',
    connectionFailed: 'Connection failed',
    connectionError: 'Connection error, please retry',
    opponentFinished: '\u26A1 {alias} finished! {time}{stars} \u2014 keep going!',
    forfeit: 'Forfeit',
    resultWin: 'Win',
    resultLose: 'Lose',
    resultDraw: "It's a tie! Great minds think alike \uD83D\uDC95",
    resultFaster: '{winner} was faster by {diff}',
    historyRecord: 'Match history: ',
    historyRecordSingle: 'Match history: {name} {wins} wins',
  },

  // ── Level grid (levels.ts runtime strings) ───────────────────────
  levelGrid: {
    speedrunSubmissions: '\u26A1 {submissions} submissions',
    speedrunNotCleared: '\u26A1 Not cleared',
    unnamedRealm: 'Unnamed Realm',
  },

  // ── Wild lobby (extra runtime strings) ────────────────────────────
  wildLobby: {
    nextRoundSub: 'Next round {next}/10 \u00B7 Wins {wins}/{round}',
    phaseFundamentals: 'Fundamentals',
    phaseMidIntuitive: 'Intermediate \u00B7 Intuitive',
    phaseMidDeductive: 'Intermediate \u00B7 Deductive',
    phaseAdvanced: 'Advanced',
    phaseChains: 'Chain Techniques',
    phaseALSForcing: 'ALS & Forcing',
    phaseUltimate: 'Ultimate',
    modeBadgeStandard: 'S',
    modeBadgeBlind: 'B',
    modeBadgeIronman: 'I',
    modeBadgeNoNotes: 'N',
    emptyByFilter: 'No entries for this filter',
    scrollForMore: 'Scroll down to load more',
    mentorAttr: '\u2014\u2014 Yi Chen "Remnant Pages"',
  },

  // ── Teach store (practice messages) ──────────────────────────────
  teachPractice: {
    noPractice: 'This module has no practice exercises yet.',
    perfect: 'Excellent! Completely correct!',
    missingCandidates: '{count} more candidates can be eliminated',
    missingHint: ', check near {regions}',
    wrongElim: '{descs} should not be eliminated \u2014 those candidates are still valid',
    wrongCellDesc: 'R{row}C{col} digit {digit}',
    hintLabel: 'Hint ({name}): {subtitle}. Look at the blue highlighted cells.',
    defaultTechName: 'Technique',
    defaultTechHint: 'Observe the relationships between candidates',
    chainNodes: 'Chain nodes:',
    chainProof: 'Reasoning chain:',
    fallbackExplanation: 'Observe candidate relationships to find eliminations.',
    answerRevealed: 'Answer revealed',
  },

  // ── Teach overlay (UI labels) ────────────────────────────────────
  teachOverlay: {
    defaultTitle: 'Tutorial',
    stageStudying: 'Studying',
    stageBeginner: 'Beginner',
    stageIntermediate: 'Intermediate',
    stageAdvanced: 'Advanced',
    stageExpert: 'Expert',
    stageGodlike: 'Godlike',
    chapterLabel: 'Chapter: {stage} tier',
    loading: 'Loading tutorial...',
    prevStep: '\u2190 Prev',
    nextStep: 'Next \u2192',
    practiceInstruction: 'Tap candidates to eliminate',
    selectedCount: '{count} selected',
    hint: '\uD83D\uDCA1 Hint',
    skip: 'Skip',
    breakdown: 'Step by step \u2192',
    skipStepping: 'Skip for now',
    startPractice: 'Practice now \u2192',
    revealAnswer: 'Show answer',
    confirmElim: 'Confirm elimination',
    backToSteps: 'Back to steps',
    retryPractice: 'Try another',
    close: 'Close',
  },

  // ── Replay (runtime strings) ─────────────────────────────────────
  replayRuntime: {
    filterLabelAll: 'All steps',
    filterLabelMistake: 'Mistakes',
    filterLabelKey: 'Key steps',
    noStepsForFilter: 'No steps for this filter',
    stepLabel: 'Step {current} / {total}',
    scoreGuess: 'Guess',
    scoreMistake: 'Mistake',
    scoreSpeedBonus: 'Speed bonus',
    scoreAccuracyBonus: 'Zero-mistake bonus',
    scorePoints: '{points} pts',
  },

  // ── Practice lobby (runtime strings) ──────────────────────────────
  practiceLobby: {
    levelFallback: 'Level {idx}',
    allCompleteQuote: "You walked thirty-nine paths,\nand two more I didn't mark.\n\nTraining complete. But the sword has no end.",
    allCompleteAttr: '\u2014\u2014 Yi Chen',
  },
} as const;
