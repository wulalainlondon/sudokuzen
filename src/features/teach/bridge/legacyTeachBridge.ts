import { useTeachStore } from '../state/teachStore';

type WinWithFacade = Window & {
  showTeachModal?: (stars: string | number, source?: 'tier' | 'library') => void;
  hideTeachModal?: () => void;
  openTeachFromLibrary?: (stars: string | number) => void;
  __legacyShowTeachModal?: (stars: string | number, source?: 'tier' | 'library') => void;
  __legacyHideTeachModal?: () => void;
  __legacyOpenTeachFromLibrary?: (stars: string | number) => void;
};

export function installLegacyTeachBridge(): void {
  const w = window as WinWithFacade;

  if (w.showTeachModal) w.__legacyShowTeachModal = w.showTeachModal;
  if (w.hideTeachModal) w.__legacyHideTeachModal = w.hideTeachModal;
  if (w.openTeachFromLibrary) w.__legacyOpenTeachFromLibrary = w.openTeachFromLibrary;

  window.__reactTeachBridge = {
    openTeach(stars: string | number, source: 'tier' | 'library' = 'tier') {
      return useTeachStore.getState().openTeach(stars, source);
    },
    closeTeach() {
      useTeachStore.getState().closeTeach();
    },
  };

  w.showTeachModal = (stars: string | number, source: 'tier' | 'library' = 'tier') => {
    const handled = window.__reactTeachBridge?.openTeach(stars, source) ?? false;
    if (!handled) w.__legacyShowTeachModal?.(stars, source);
  };

  w.openTeachFromLibrary = (stars: string | number) => {
    const handled = window.__reactTeachBridge?.openTeach(stars, 'library') ?? false;
    if (!handled) w.__legacyOpenTeachFromLibrary?.(stars);
  };

  w.hideTeachModal = () => {
    if (useTeachStore.getState().open) {
      window.__reactTeachBridge?.closeTeach();
      return;
    }
    w.__legacyHideTeachModal?.();
  };
}
