// Replay modal state — zustand store
// Bridges legacy replay.ts into React-managed modal chrome.

import { create } from 'zustand';

export type ReplayFilter = 'all' | 'mistake' | 'key';

export type ReplayDiagnosisPace = 'idle' | 'fast' | 'steady' | 'slow';

export type ReplayLearningFocusType = 'mistake' | 'key_step' | 'pace' | 'balanced';

export interface ReplayLearningFocus {
  focusType: ReplayLearningFocusType;
  focusLabel: string;
}

export interface ReplayDiagnosis {
  totalActions: number;
  elapsedSeconds: number;
  mistakeCount: number;
  keyCount: number;
  keyRatePct: number;
  mistakeRatePct: number;
  paceSecondsPerAction: number;
  paceLabel: ReplayDiagnosisPace;
  learningFocus: ReplayLearningFocus;
  summary: string;
  insights: string[];
}

export interface ReplayState {
  visible: boolean;

  // Summary line
  summaryText: string;

  // Step list HTML (rendered by legacy, injected via dangerouslySetInnerHTML)
  listHtml: string;

  // Filter
  filter: ReplayFilter;

  // Playback controls
  stepIdx: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;

  // Step info HTML (may contain technique span)
  stepInfoHtml: string;

  // Progress bar percentage (0-100)
  progressPct: number;

  // Diagnosis payload
  diagnosis: ReplayDiagnosis | null;

  // Control button states
  prevDisabled: boolean;
  nextDisabled: boolean;

  // Actions
  open: () => void;
  close: () => void;
  setFilter: (filter: ReplayFilter) => void;
  setSummary: (text: string) => void;
  setListHtml: (html: string) => void;
  setDiagnosis: (diagnosis: ReplayDiagnosis | null) => void;
  setPlaybackState: (
    partial: Partial<
      Pick<
        ReplayState,
        | 'stepIdx'
        | 'totalSteps'
        | 'isPlaying'
        | 'speed'
        | 'stepInfoHtml'
        | 'progressPct'
        | 'prevDisabled'
        | 'nextDisabled'
      >
    >,
  ) => void;
}

export const useReplayStore = create<ReplayState>((set) => ({
  visible: false,
  summaryText: '-',
  listHtml: '',
  filter: 'all',
  stepIdx: 0,
  totalSteps: 0,
  isPlaying: false,
  speed: 1,
  stepInfoHtml: '',
  progressPct: 0,
  diagnosis: null,
  prevDisabled: true,
  nextDisabled: false,

  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  setFilter: (filter) => set({ filter }),
  setSummary: (text) => set({ summaryText: text }),
  setListHtml: (html) => set({ listHtml: html }),
  setDiagnosis: (diagnosis) => set({ diagnosis }),
  setPlaybackState: (partial) => set(partial),
}));
