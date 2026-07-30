import { t } from '../../i18n/t';

export type DuoConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

function stateText(state: Exclude<DuoConnectionState, 'connected'>): string {
  if (state === 'connecting') return t('duo.connecting');
  if (state === 'reconnecting') return t('duo.connectionLost');
  return t('duo.connectionFailed');
}

export function renderDuoConnectionState(state: DuoConnectionState): void {
  for (const id of ['duo-conn-state', 'duo-room-conn-state']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (state === 'connected') {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.textContent = stateText(state);
  }

  const gameStatus = document.getElementById('duo-game-connection');
  if (!gameStatus) return;
  gameStatus.className = `duo-game-connection ${state}`;
  gameStatus.hidden = state === 'connected';
  gameStatus.textContent = state === 'connected' ? '' : stateText(state);
}
