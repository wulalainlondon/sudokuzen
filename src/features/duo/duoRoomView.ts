// Duo room view — independent full-screen room page shown after creating/joining a room.

import { gs } from '../../game/state';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { DUO_TIER_MAP, DUO_MODE_MAP } from './duoTiers';
import { getActiveDuoRoomId, leaveDuoRoom } from './duoRoom';

let _roomViewOpen = false;

function roomViewEl(): HTMLElement | null {
  return document.getElementById('duo-room-view');
}

// ── Show / Hide ──────────────────────────────────────────────────────

export function openDuoRoomView(): void {
  const el = roomViewEl();
  if (!el) return;

  // Ensure level-screen is visible (needed for resume case)
  const levelScreen = document.getElementById('level-screen');
  if (levelScreen) levelScreen.style.display = 'flex';
  const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
  if (gameContainer) gameContainer.style.display = 'none';

  // Hide other sibling views + main header
  const mainHeader = document.querySelector('.level-screen-header') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const duoLobby = document.getElementById('duo-lobby');
  const wildLobby = document.getElementById('wild-lobby');
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;

  if (mainHeader) mainHeader.style.display = 'none';
  if (stageView) stageView.style.display = 'none';
  if (tierView) tierView.classList.add('hidden');
  if (duoLobby) duoLobby.classList.add('hidden');
  if (wildLobby) wildLobby.classList.add('hidden');
  if (aliasConfig) aliasConfig.style.display = 'none';

  el.classList.remove('hidden');
  _roomViewOpen = true;

  // Populate room info
  const roomId = getActiveDuoRoomId();
  const roomIdValue = document.getElementById('duo-room-id-value');
  if (roomIdValue) roomIdValue.textContent = roomId || '--';

  const roomData = gs.duoRoomData;
  const tierMode = document.getElementById('duo-room-tier-mode');
  if (tierMode && roomData) {
    const tierLabel = DUO_TIER_MAP.get(roomData.tierId)?.label || '';
    const modeLabel = DUO_MODE_MAP.get(roomData.modeId)?.label || '';
    tierMode.textContent = `${tierLabel} · ${modeLabel}`;
  }
}

export function closeDuoRoomView(): void {
  const el = roomViewEl();
  if (el) el.classList.add('hidden');
  _roomViewOpen = false;
}

export function isDuoRoomViewOpen(): boolean {
  return _roomViewOpen;
}

// ── Copy Room ID ─────────────────────────────────────────────────────

export function copyDuoRoomId(): void {
  const roomId = getActiveDuoRoomId();
  if (!roomId) return;
  const copyBtn = document.getElementById('duo-room-id-copy');
  navigator.clipboard
    .writeText(roomId)
    .then(() => {
      showFeedback(t('duoRoom.copied'), 'success');
      if (copyBtn) {
        const origText = copyBtn.textContent;
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = origText;
          copyBtn.classList.remove('copied');
        }, 1500);
      }
    })
    .catch(() => {
      showFeedback(roomId, 'neutral');
    });
}

// ── Leave room (back button) ────────────────────────────────────────

export async function leaveDuoRoomFromView(): Promise<void> {
  closeDuoRoomView();
  await leaveDuoRoom();
  // Re-open the duo lobby
  const { openDuoLobby } = await import('./duoLobby');
  await openDuoLobby();
}
