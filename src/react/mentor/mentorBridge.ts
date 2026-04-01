// Bridge: legacy mentorController.ts → React mentorStore

import { useMentorStore } from './mentorStore';

export function bridgeShowMentor(text: string, subText: string): void {
  useMentorStore.getState().open({ text, subText });
}

export function bridgeDismissMentor(): void {
  useMentorStore.getState().close();
}

export function bridgeIsMentorOpen(): boolean {
  return useMentorStore.getState().visible;
}
