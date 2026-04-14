import { useSettingsStore } from './settingsStore';

export function bridgeOpenSettings(): void {
  useSettingsStore.getState().open();
}

export function bridgeCloseSettings(): void {
  useSettingsStore.getState().close();
}
