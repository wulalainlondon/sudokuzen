export type TeachLaunchSource = 'tier' | 'library';

export type TeachEliminateTarget = {
  cell: number;
  digit: number;
};

export type TeachStepModel = {
  text: string;
  focusCells: number[];
  visibleCells?: number[];
  highlightDigits: Record<string, number[]>;
  eliminateCells: TeachEliminateTarget[];
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

export type TeachModuleModel = {
  stars: number;
  technique: string;
  name: string;
  subtitle: string;
  explanation: string[];
  example: TeachExampleModel | null;
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
      openTeach: (stars: string | number, source?: TeachLaunchSource) => boolean;
      closeTeach: () => void;
    };
  }
}
