export type TeachLaunchSource = 'tier' | 'library';

export type TeachEliminateTarget = {
  cell: number;
  digit: number;
};

export type TeachStepModel = {
  text: string;
  focusCells: number[];
  /** Optional explicit chain path for overlay; falls back to focusCells when omitted. */
  chainCells?: number[];
  visibleCells?: number[];
  highlightDigits: Record<string, number[]>;
  eliminateCells: TeachEliminateTarget[];
  /** Candidates to hide completely (show the "after" state) */
  removedCandidates?: TeachEliminateTarget[];
  /** Hide chain overlay lines for this step (default: show) */
  showChain?: boolean;
  /** Chain overlay mode: 'sequential' (default) or 'cross' (X-pattern for 4 cells) */
  chainMode?: 'sequential' | 'cross';
  warnCells: number[];
  warnDigit: number | null;
};

export type TeachExampleModel = {
  board: number[];
  given: number[];
  notes: Record<string, number[]>;
  steps: TeachStepModel[];
};

export type PracticeAnswer = {
  eliminates: Array<[number, number]>;
  patternCells: number[];
  description: string;
  proof: string[];
  aicChain: string[];
};

export type PracticeItemModel = {
  board: number[];
  given: number[];
  notes: Record<string, number[]>;
  answer: PracticeAnswer;
  solution: number[];
};

// ── Demo story — cinematic technique showcase ────────────────────

export type DemoActHighlight = {
  /** Cells to glow/focus (blue) */
  cells?: number[];
  /** Cells to warn/target (red border) */
  warnCells?: number[];
  /** Specific digits to ring within cells: { "49": [9], "50": [9] } */
  digits?: Record<string, number[]>;
  /** Highlight an entire row (0-8), column (9-17), or box (18-26) as a color band */
  units?: number[];
  /** Cells + digits to strike through (elimination) */
  eliminates?: TeachEliminateTarget[];
  /** Camera mode: 'in' = dim non-focus cells, 'out' = full board visible, 'none' = no change */
  camera?: 'in' | 'out' | 'none';
  /** Zoom focus point as cell index (used with camera:'in' to determine dim region). */
  cameraFocus?: number;
  /** Emit a ripple wave from these cells (cell indices). Ripple sweeps across the board. */
  rippleFrom?: number[];
  /** Draw X cross lines between 4 cells: [TL, TR, BL, BR]. Lines animate in then fade out. */
  crossLines?: number[];
  /** Draw chain links between cells in order (for pivot -> wings, AIC segments, etc.). */
  chainCells?: number[];
  /** Chain overlay mode for chainCells. */
  chainMode?: 'sequential' | 'cross';
  /** Use ✕ mark over eliminated digits instead of strikethrough */
  elimStyle?: 'strike' | 'cross-mark';
};

export type DemoAct = {
  /** Caption shown below the board */
  caption: string;
  /** Duration in ms (auto-advance after this) */
  durationMs: number;
  /** Visual highlights for this act */
  highlight: DemoActHighlight;
};

export type DemoStory = {
  /** Ordered acts — played sequentially, no user interaction */
  acts: DemoAct[];
};

export type TeachModuleModel = {
  stars: number;
  technique: string;
  name: string;
  subtitle: string;
  explanation: string[];
  example: TeachExampleModel | null;
  /** Custom cinematic demo story (overrides default auto-generated demo) */
  demoStory?: DemoStory;
  practice: PracticeItemModel[];
};

export type TeachFlowState = 'idle' | 'loading' | 'demo' | 'stepping' | 'practice' | 'result';

export type PracticeResultTone = 'success' | 'partial' | 'error' | 'neutral';

export type PracticeSessionState = {
  selected: Set<string>;
  revealed: boolean;
  message: string;
  success: boolean;
  tone: PracticeResultTone;
  hintLevel: number;
};

declare global {
  interface Window {
    TEACH_DATA?: Record<string, any>;
    __reactTeachBridge?: {
      openTeach: (stars: string | number, source?: TeachLaunchSource) => Promise<boolean>;
      closeTeach: () => void;
    };
  }
}
