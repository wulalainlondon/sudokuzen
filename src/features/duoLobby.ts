import { getAllLevels } from '../data/dataRegistry';
import { getPlayerIdentity } from '../firebase/client';
import { gs, type DuoRoomData, type LevelData } from '../game/state';
import { showFeedback } from '../ui/feedback';
import { t } from '../i18n/t';

function duoLobbyEl(): HTMLElement | null {
  return document.getElementById('duo-lobby');
}

function setDuoViewActive(active: boolean): void {
  const levelTitle = document.getElementById('level-title');
  const levelModeChip = document.getElementById('level-mode-chip');
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const wildLobby = document.getElementById('wild-lobby');
  const duoLobby = duoLobbyEl();
  if (levelTitle) levelTitle.textContent = active ? t('mode.duo') : 'SUDOKU ZEN';
  if (levelModeChip) levelModeChip.textContent = t('mode.duo');
  if (levelModeChip) levelModeChip.classList.toggle('hidden', !active);
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.toggle('hidden', true);
  if (wildLobby) wildLobby.classList.add('hidden');
  if (duoLobby) duoLobby.classList.toggle('hidden', !active);
}

function getNormalLevels(): LevelData[] {
  return getAllLevels().filter((l) => !l.hidden && (l.id ?? 0) > 0 && l.mode !== 'practice');
}

function renderLevelOptions(selectedLevelId: number | null): void {
  const select = document.getElementById('duo-level-select') as HTMLSelectElement | null;
  if (!select) return;
  const levels = getNormalLevels();
  const current = selectedLevelId ?? levels[0]?.id ?? 1;
  select.innerHTML = levels
    .map((l) => `<option value="${l.id}" ${l.id === current ? 'selected' : ''}>${l.difficultyName} · ${l.displayName}</option>`)
    .join('');
}

function roomSummaryText(room: DuoRoomData | null): string {
  if (!room || room.status === 'idle' || room.status === 'finished') return '目前沒有公開房間';
  if (room.status !== 'waiting') return '房間進行中，稍後再試';
  const level = getAllLevels().find((l) => l.id === room.levelId);
  const levelName = level ? `${level.difficultyName} · ${level.displayName}` : `Level ${room.levelId}`;
  return `房主 ${room.hostAlias || '--'} · ${levelName}`;
}

async function loadCurrentRoom(): Promise<DuoRoomData | null> {
  if (!gs.firebaseReady) return null;
  try {
    const snap = await gs.db.collection('duo_room').doc('current').get();
    if (!snap.exists) return null;
    return (snap.data() ?? null) as DuoRoomData | null;
  } catch {
    return null;
  }
}

async function refreshRoomCard(): Promise<void> {
  const statusEl = document.getElementById('duo-room-status');
  const joinBtn = document.getElementById('duo-join-btn') as HTMLButtonElement | null;
  if (!statusEl || !joinBtn) return;
  const room = await loadCurrentRoom();
  const { playerId } = getPlayerIdentity();
  const joinable = !!(room && room.status === 'waiting' && room.hostId !== playerId);
  statusEl.textContent = roomSummaryText(room);
  joinBtn.disabled = !joinable;
}

export async function openDuoLobby(): Promise<void> {
  if (!gs.firebaseReady) {
    showFeedback('Duo 需要連線，請稍後再試', 'error');
    return;
  }
  renderLevelOptions(gs.pendingLevelId);
  setDuoViewActive(true);
  await refreshRoomCard();
}

export function closeDuoLobby(): void {
  setDuoViewActive(false);
}

export function isDuoLobbyOpen(): boolean {
  const lobby = duoLobbyEl();
  if (!lobby) return false;
  return !lobby.classList.contains('hidden');
}

export async function createDuoRoomFromLobby(): Promise<void> {
  const select = document.getElementById('duo-level-select') as HTMLSelectElement | null;
  if (!select) return;
  const levelId = Number(select.value);
  if (!Number.isFinite(levelId)) return;
  const { enterDuoRoom } = await import('./duo');
  const { showPreLevelModal } = await import('./levels');
  await enterDuoRoom(levelId);
  showPreLevelModal(levelId, true);
}

export async function joinDuoRoomFromLobby(): Promise<void> {
  const room = await loadCurrentRoom();
  const { playerId } = getPlayerIdentity();
  if (!room || room.status !== 'waiting' || room.hostId === playerId || !room.levelId) {
    showFeedback('目前沒有可加入的房間', 'error');
    await refreshRoomCard();
    return;
  }
  const { enterDuoRoom } = await import('./duo');
  const { showPreLevelModal } = await import('./levels');
  await enterDuoRoom(room.levelId);
  showPreLevelModal(room.levelId, true);
}

export async function refreshDuoLobbyRoom(): Promise<void> {
  await refreshRoomCard();
}
