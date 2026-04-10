import type { TeachLaunchSource, TeachOpenOptions } from '../../../entities/teach';
import { useTeachStore } from '../state/teachStore';

type WinWithFacade = Window & {
  showTeachModal?: (stars: string | number, source?: TeachLaunchSource) => void;
  hideTeachModal?: () => void;
  openTeachFromLibrary?: (stars: string | number) => void;
  __legacyShowTeachModal?: (stars: string | number, source?: TeachLaunchSource) => void;
  __legacyHideTeachModal?: () => void;
  __legacyOpenTeachFromLibrary?: (stars: string | number) => void;
};

export function installLegacyTeachBridge(): void {
  const w = window as WinWithFacade;

  if (w.showTeachModal) w.__legacyShowTeachModal = w.showTeachModal;
  if (w.hideTeachModal) w.__legacyHideTeachModal = w.hideTeachModal;
  if (w.openTeachFromLibrary) w.__legacyOpenTeachFromLibrary = w.openTeachFromLibrary;

  window.__reactTeachBridge = {
    openTeach(stars: string | number, source: TeachLaunchSource = 'tier', options?: TeachOpenOptions) {
      return useTeachStore.getState().openTeach(stars, source, options);
    },
    closeTeach() {
      useTeachStore.getState().closeTeach();
    },
  };

  w.showTeachModal = (stars: string | number, source: TeachLaunchSource = 'tier') => {
    // openTeach sets flow='loading' synchronously, then fetches shard async
    window.__reactTeachBridge?.openTeach(stars, source).then((handled) => {
      if (!handled) {
        w.__legacyShowTeachModal?.(stars, source);
      }
    });
  };

  w.openTeachFromLibrary = (stars: string | number) => {
    window.__reactTeachBridge?.openTeach(stars, 'library').then((handled) => {
      if (!handled) {
        w.__legacyOpenTeachFromLibrary?.(stars);
      }
    });
  };

  w.hideTeachModal = () => {
    if (useTeachStore.getState().open) {
      window.__reactTeachBridge?.closeTeach();
      return;
    }
    w.__legacyHideTeachModal?.();
  };
}
