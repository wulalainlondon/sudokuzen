// Bridge: legacy practiceLobby.ts → React PracticeTree store

import { usePracticeTreeStore, type TechNodeState } from './practiceTreeStore';

export function bridgeOpenPracticeTree(nodes: Map<string, TechNodeState>, completedCount: number): void {
  usePracticeTreeStore.getState().open(nodes, completedCount);
}

export function bridgeClosePracticeTree(): void {
  usePracticeTreeStore.getState().close();
}

export function bridgeRefreshPracticeTree(nodes: Map<string, TechNodeState>, completedCount: number): void {
  usePracticeTreeStore.getState().refresh(nodes, completedCount);
}
