// Bridge: legacy mentorController.ts → React mentorStore

import { useMentorStore } from './mentorStore';

export function bridgeShowMentor(text: string, subText: string, dismissLabelKey = 'mentor.continue'): void {
  useMentorStore.getState().open({ text, subText, dismissLabelKey });
}

export function bridgeDismissMentor(): void {
  useMentorStore.getState().close();
}

export function bridgeIsMentorOpen(): boolean {
  return useMentorStore.getState().visible;
}
