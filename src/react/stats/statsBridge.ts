import { useStatsStore } from './statsStore';

export function bridgeOpenStats(): void {
  useStatsStore.getState().open();
}

export function bridgeCloseStats(): void {
  useStatsStore.getState().close();
}

export function bridgeIsStatsOpen(): boolean {
  return useStatsStore.getState().visible;
}
