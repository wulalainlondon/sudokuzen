// Practice Tree zustand store — manages unlock state + selected technique.
// Bridges legacy computeUnlockState() into React-land.

import { create } from 'zustand';

export type TechStatus = 'locked' | 'unlocked' | 'partial' | 'completed';

export interface TechNodeState {
  key: string;
  name: string;
  status: TechStatus;
  cleared: number;
  total: number;
}

export interface PracticeTreeState {
  visible: boolean;
  nodes: Map<string, TechNodeState>;
  completedCount: number;

  open: (nodes: Map<string, TechNodeState>, completedCount: number) => void;
  close: () => void;
  refresh: (nodes: Map<string, TechNodeState>, completedCount: number) => void;
}

export const usePracticeTreeStore = create<PracticeTreeState>((set) => ({
  visible: false,
  nodes: new Map(),
  completedCount: 0,

  open: (nodes, completedCount) => set({ visible: true, nodes, completedCount }),
  close: () => set({ visible: false }),
  refresh: (nodes, completedCount) => set({ nodes, completedCount }),
}));
