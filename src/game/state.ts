// Shared mutable game state — singleton
// All modules import `gs` and read/write directly.
// This preserves the mutation pattern of the original monolith while enabling
// the code to live in separate files.

export interface CellData {
  value: number;
  fixed: boolean;
  notes: number[];
  isError: boolean;
}

export interface LevelData {
  id: number;
  stars: number;
  difficultyName: string;
  displayName: string;
  puzzle: number[];
  solution: number[];
  maxTechnique?: string;
  techTier?: string;
  hidden?: boolean;
  source?: string;
}

export const gs = {
  // ── DOM refs (populated once by initDom) ──────────────────────────
  gridEl: null as HTMLElement | null,
  livesEl: null as HTMLElement | null,
  overlay: null as HTMLElement | null,
  timerEl: null as HTMLElement | null,
  winCelebrationEl: null as HTMLElement | null,
  confettiLayerEl: null as HTMLElement | null,
  leaderboardListEl: null as HTMLElement | null,
  winLeaderboardListEl: null as HTMLElement | null,
  aliasInputEl: null as HTMLInputElement | null,
  replayModalEl: null as HTMLElement | null,
  replaySummaryEl: null as HTMLElement | null,
  replayListEl: null as HTMLElement | null,
  replayFilterAllBtn: null as HTMLElement | null,
  replayFilterMistakeBtn: null as HTMLElement | null,
  replayFilterKeyBtn: null as HTMLElement | null,
  preLevelModalEl: null as HTMLElement | null,
  preLevelNameEl: null as HTMLElement | null,
  preLevelBestRecordEl: null as HTMLElement | null,
  preLevelTechEl: null as HTMLElement | null,
  preLevelLeaderboardEl: null as HTMLElement | null,
  preLevelStartBtn: null as HTMLElement | null,
  preLevelGhostBtn: null as HTMLElement | null,
  preLevelReplayBtn: null as HTMLElement | null,
  preLevelBackBtn: null as HTMLElement | null,
  libraryOverlayEl: null as HTMLElement | null,
  libraryListEl: null as HTMLElement | null,

  // ── Core game state ───────────────────────────────────────────────
  selectedIdx: null as number | null,
  isNotesMode: false,
  continuousFillDigit: null as number | null,
  isSpeedrunMode: false,
  submissionCount: 0,
  errors: 0,
  maxErrors: 3,
  seconds: 0,
  timerInterval: null as ReturnType<typeof setInterval> | null,
  currentLevel: null as LevelData | null,
  cellsData: [] as CellData[],
  actionHistory: [] as any[],
  replayFilter: 'all',
  numButtons: [] as HTMLButtonElement[],

  // ── Firebase ──────────────────────────────────────────────────────
  db: null as any,
  firebaseReady: false,

  // ── Ghost mode ────────────────────────────────────────────────────
  isGhostMode: false,
  ghostHistory: [] as any[],
  ghostIdx: 0,
  playerFilledCount: 0,
  ghostFilledCount: 0,

  // ── Duo mode ──────────────────────────────────────────────────────
  isDuoMode: false,
  duoUnsubscribe: null as (() => void) | null,
  duoGlowUnsubscribe: null as (() => void) | null,
  duoRole: null as 'host' | 'guest' | null,
  duoRoomData: null as any,
  duoCountdownTimer: null as ReturnType<typeof setInterval> | null,
  duoCountdownStartMs: null as number | null,
  duoRoundLaunched: false,
  duoProgressThrottle: 0,
  duoMyReady: false,
  duoTotalToFill: 0,
  duoPenaltySeconds: 0,
  duoCooldownUntil: 0,
  duoCooldownTimer: null as ReturnType<typeof setInterval> | null,
  duoLastErrorCell: -1,
  duoLastErrorTime: 0,
  duoSameCellStreak: 0,
  duoEmojiCooldown: 0,
  duoLastEmojiSeen: '',
  duoOpponentNotified: false,

  // ── Teach (legacy) ────────────────────────────────────────────────
  teachCurrentStep: 0,
  teachSteps: [] as any[],
  teachData: null as any,
  teachStarsKey: null as string | null,
  teachLaunchSource: 'tier',

  // ── Practice ──────────────────────────────────────────────────────
  practiceState: null as any,

  // ── Visual replay ─────────────────────────────────────────────────
  rbState: [] as any[],
  rbStepIdx: 0,
  rbIsPlaying: false,
  rbTimer: null as ReturnType<typeof setInterval> | null,
  rbSpeed: 1,

  // ── UI chrome ─────────────────────────────────────────────────────
  feedbackTimer: null as ReturnType<typeof setTimeout> | null,
  feedbackToast: null as HTMLDivElement | null,
  currentTab: null as string | null,
  pendingLevelId: null as number | null,
  achievementToastQueue: [] as any[],
  achievementToastActive: false,

  // ── Audio ─────────────────────────────────────────────────────────
  _audioCtx: null as AudioContext | null,
  _masterGain: null as GainNode | null,
  _reverbNode: null as ConvolverNode | null,
  _reverbGain: null as GainNode | null,
  _dryGain: null as GainNode | null,
  _noiseBuffer: null as AudioBuffer | null,

  // ── App ───────────────────────────────────────────────────────────
  appVersion: '',
};

export function initDom(): void {
  gs.gridEl = document.getElementById('grid');
  gs.livesEl = document.getElementById('lives');
  gs.overlay = document.getElementById('overlay');
  gs.timerEl = document.getElementById('timer');
  gs.winCelebrationEl = document.getElementById('win-celebration');
  gs.confettiLayerEl = document.getElementById('confetti-layer');
  gs.leaderboardListEl = document.getElementById('leaderboard-list');
  gs.winLeaderboardListEl = document.getElementById('win-leaderboard-list');
  gs.aliasInputEl = document.getElementById('alias-input') as HTMLInputElement | null;
  gs.replayModalEl = document.getElementById('replay-modal');
  gs.replaySummaryEl = document.getElementById('replay-summary');
  gs.replayListEl = document.getElementById('replay-list');
  gs.replayFilterAllBtn = document.getElementById('replay-filter-all');
  gs.replayFilterMistakeBtn = document.getElementById('replay-filter-mistake');
  gs.replayFilterKeyBtn = document.getElementById('replay-filter-key');
  gs.preLevelModalEl = document.getElementById('pre-level-modal');
  gs.preLevelNameEl = document.getElementById('pre-level-name');
  gs.preLevelBestRecordEl = document.getElementById('pre-level-best-record');
  gs.preLevelTechEl = document.getElementById('pre-level-tech');
  gs.preLevelLeaderboardEl = document.getElementById('pre-level-leaderboard');
  gs.preLevelStartBtn = document.getElementById('pre-level-start-btn');
  gs.preLevelGhostBtn = document.getElementById('pre-level-ghost-btn');
  gs.preLevelReplayBtn = document.getElementById('pre-level-replay-btn');
  gs.preLevelBackBtn = document.getElementById('pre-level-back-btn');
  gs.libraryOverlayEl = document.getElementById('library-overlay');
  gs.libraryListEl = document.getElementById('library-list');

  const toast = document.createElement('div');
  toast.id = 'feedback-toast';
  document.body.appendChild(toast);
  gs.feedbackToast = toast;
}
