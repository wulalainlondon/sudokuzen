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
    console.log('[Bridge] showTeachModal called, stars=', stars, 'source=', source);
    const handled = window.__reactTeachBridge?.openTeach(stars, source) ?? false;
    console.log('[Bridge] React handled=', handled, 'store.open=', useTeachStore.getState().open);
    if (!handled) {
      console.log('[Bridge] Falling back to legacy');
      w.__legacyShowTeachModal?.(stars, source);
    }
  };

  w.openTeachFromLibrary = (stars: string | number) => {
    console.log('[Bridge] openTeachFromLibrary called, stars=', stars);
    const handled = window.__reactTeachBridge?.openTeach(stars, 'library') ?? false;
    console.log('[Bridge] React handled=', handled);
    if (!handled) {
      console.log('[Bridge] Falling back to legacy');
      w.__legacyOpenTeachFromLibrary?.(stars);
    }
  };

  w.hideTeachModal = () => {
    if (useTeachStore.getState().open) {
      window.__reactTeachBridge?.closeTeach();
      return;
    }
    w.__legacyHideTeachModal?.();
  };
}
