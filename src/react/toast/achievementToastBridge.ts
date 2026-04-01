// Bridge: legacy stats.ts achievement toasts → React achievementToastStore

import { useAchievementToastStore } from './achievementToastStore';

export function bridgeEnqueueToast(icon: string, name: string): void {
  useAchievementToastStore.getState().enqueue({ icon, name });
}

export function bridgeShowNextToast(): void {
  useAchievementToastStore.getState().showNext();
}

export function bridgeDismissToast(): void {
  useAchievementToastStore.getState().dismiss();
}
