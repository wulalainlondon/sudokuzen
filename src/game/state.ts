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

export interface ActionRecord {
  t: number;
  type: string;
  detail: string;
  idx: number | null;
  val: number | null;
  notes: number[] | null;
}

export interface ReplayCellState {
  value: number;
  fixed: boolean;
  notes: number[];
  _mistake?: boolean;
  _mistakeVal?: number | null;
}

export interface AchievementToastItem {
  icon: string;
  name: string;
}

export interface DuoRoomData {
  levelId: number;
  status: 'idle' | 'waiting' | 'countdown' | 'playing' | 'finished';
  hostId: string;
  hostAlias: string;
  hostTitle: string | null;
  hostReady: boolean;
  hostProgress: number;
  hostFinishTime: number | null;
  hostStars: number | null;
  guestId: string | null;
  guestAlias: string | null;
  guestTitle: string | null;
  guestReady: boolean;
  guestProgress: number;
  guestFinishTime: number | null;
  guestStars: number | null;
  startAt: { toMillis?: () => number; seconds?: number } | null;
  updatedAt: { toDate?: () => Date } | null;
  hostEmoji?: string | null;
  hostEmojiTs?: number | null;
  guestEmoji?: string | null;
  guestEmojiTs?: number | null;
}

export interface SkillModeState {
  enabled: boolean;
  selectedCells: number[];
  castMessage: string;
  casting: boolean;
  litCandidates: Array<{ cell: number; digit: number }>;
  preview: import('../features/skills/types').SkillPreview | null;
}

export type GameMode = 'normal' | 'practice' | 'world';

export interface LevelData {
  id: number;
  stars: number;
  difficultyName: string;
  displayName: string;
  puzzle: number[];
  solution: number[];
  maxTechnique?: string;
  techTier?: string;
  difficultyScore?: number;
  logicSolvable?: boolean;
  singleRatio?: number;
  mode?: GameMode;
  hidden?: boolean;
  source?: string;
}

export const gs = {
  // ── DOM refs (populated once by initDom) ──────────────────────────
  // Note: overlay, win-celebration, confetti-layer, pre-level-modal, stats-modal
  // are now React-managed — their refs have been removed.
  gridEl: null as HTMLElement | null,
  livesEl: null as HTMLElement | null,
  timerEl: null as HTMLElement | null,
  leaderboardListEl: null as HTMLElement | null,
  aliasInputEl: null as HTMLInputElement | null,
  // Note: replayModalEl, replaySummaryEl, replayListEl, replayFilter*Btn
  // are now React-managed — their refs have been removed.
  // Note: libraryOverlayEl, libraryListEl are now React-managed — their refs have been removed.

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
  actionHistory: [] as ActionRecord[],
  undoStack: [] as { idx: number; prevValue: number; prevNotes: number[] }[],
  replayFilter: 'all',
  numButtons: [] as HTMLButtonElement[],

  // ── Firebase ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase Firestore instance, typed in firebase/client.ts
  db: null as any,
  firebaseReady: false,

  // ── Ghost mode ────────────────────────────────────────────────────
  isGhostMode: false,
  ghostHistory: [] as ActionRecord[],
  ghostIdx: 0,
  playerFilledCount: 0,
  ghostFilledCount: 0,

  // ── Duo mode ──────────────────────────────────────────────────────
  isDuoMode: false,
  duoUnsubscribe: null as (() => void) | null,
  duoGlowUnsubscribe: null as (() => void) | null,
  duoRole: null as 'host' | 'guest' | null,
  duoRoomData: null as DuoRoomData | null,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex teach data, typed in features/teach/
  teachSteps: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex teach data, typed in features/teach/
  teachData: null as any,
  teachStarsKey: null as string | null,
  teachLaunchSource: 'tier',

  // ── Practice ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex practice state, typed in features/teach/
  practiceState: null as any,
  practiceActiveTech: null as string | null,

  // ── Skill Mode ───────────────────────────────────────────────────
  // Access through features/skills/skillController.ts — do NOT read/write directly.
  skillMode: {
    enabled: false,
    selectedCells: [],
    castMessage: '',
    casting: false,
    litCandidates: [],
    preview: null,
  } as SkillModeState,

  // ── Wild challenge mode ──────────────────────────────────────────
  wildChallengeMode: null as import('../features/wild/wildState').ChallengeMode | null,
  wildBlindMode: false,
  wildNotesDisabled: false,
  wildTimerCountdown: 0,
  wildTimerInterval: null as ReturnType<typeof setInterval> | null,

  // ── Visual replay ─────────────────────────────────────────────────
  rbState: [] as ReplayCellState[],
  rbStepIdx: 0,
  rbIsPlaying: false,
  rbTimer: null as ReturnType<typeof setInterval> | null,
  rbSpeed: 1,

  // ── UI chrome ─────────────────────────────────────────────────────
  feedbackTimer: null as ReturnType<typeof setTimeout> | null,
  feedbackToast: null as HTMLDivElement | null,
  currentTab: null as string | null,
  pendingLevelId: null as number | null,
  achievementToastQueue: [] as AchievementToastItem[],
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
  gs.timerEl = document.getElementById('timer');
  gs.leaderboardListEl = document.getElementById('leaderboard-list');
  gs.aliasInputEl = document.getElementById('alias-input') as HTMLInputElement | null;
  // Replay modal DOM refs are now React-managed
  // libraryOverlayEl and libraryListEl are now React-managed

  const toast = document.createElement('div');
  toast.id = 'feedback-toast';
  document.body.appendChild(toast);
  gs.feedbackToast = toast;
}
