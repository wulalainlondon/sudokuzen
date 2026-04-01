// Bridge: legacy teach-legacy.ts → React libraryStore

import { useLibraryStore } from './libraryStore';

export function bridgeOpenLibrary(): void {
  useLibraryStore.getState().open();
}

export function bridgeCloseLibrary(): void {
  useLibraryStore.getState().close();
}

export function bridgeIsLibraryOpen(): boolean {
  return useLibraryStore.getState().visible;
}
