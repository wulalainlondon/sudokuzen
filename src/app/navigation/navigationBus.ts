import type { LevelData } from '../../game/state';

export type NavigationIntent =
  | { type: 'show-level-screen'; returnToTier: boolean }
  | { type: 'hide-pre-level-modal' }
  | { type: 'show-pre-level-modal'; levelId: number; ignoreTierLock: boolean; externalLevel?: LevelData }
  | { type: 'back-to-stage-map' };

type Listener = (intent: NavigationIntent) => void;
const listeners = new Set<Listener>();

export function emitNavigation(intent: NavigationIntent): void {
  for (const fn of listeners) fn(intent);
}

export function onNavigation(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
