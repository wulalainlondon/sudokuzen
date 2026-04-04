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
  if (!room || room.status === 'idle' || room.status === 'finished') return t('duo.noPublicRoom');
  if (room.status !== 'waiting') return t('duo.roomInProgress');
  const level = getAllLevels().find((l) => l.id === room.levelId);
  const levelName = level ? `${level.difficultyName} · ${level.displayName}` : `Level ${room.levelId}`;
  return t('duo.roomHostLevel', { host: room.hostAlias || '--', level: levelName });
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
    showFeedback(t('duo.networkRequired'), 'error');
    return;
  }
  const titleEl = document.getElementById('duo-lobby-title');
  const backBtnEl = document.getElementById('duo-back-btn');
  const createTitleEl = document.getElementById('duo-create-title');
  const levelLabelEl = document.getElementById('duo-level-label');
  const hostChipEl = document.getElementById('duo-host-chip');
  const createBtnTextEl = document.getElementById('duo-create-btn-text');
  const createBtnSubEl = document.getElementById('duo-create-btn-sub');
  const joinTitleEl = document.getElementById('duo-join-title');
  const refreshBtnEl = document.getElementById('duo-refresh-btn');
  const joinChipEl = document.getElementById('duo-join-chip');
  const joinBtnTextEl = document.getElementById('duo-join-btn-text');
  const joinBtnSubEl = document.getElementById('duo-join-btn-sub');
  if (titleEl) titleEl.textContent = t('duo.lobbyTitle');
  if (backBtnEl) backBtnEl.textContent = t('nav.back');
  if (createTitleEl) createTitleEl.textContent = t('duo.createRoom');
  if (levelLabelEl) levelLabelEl.textContent = t('duo.selectLevel');
  if (hostChipEl) hostChipEl.textContent = t('duo.hostChip');
  if (createBtnTextEl) createBtnTextEl.textContent = t('duo.createRoom');
  if (createBtnSubEl) createBtnSubEl.textContent = t('duo.createSub');
  if (joinTitleEl) joinTitleEl.textContent = t('duo.joinRoom');
  if (refreshBtnEl) refreshBtnEl.textContent = t('duo.refreshRoom');
  if (joinChipEl) joinChipEl.textContent = t('duo.joinChip');
  if (joinBtnTextEl) joinBtnTextEl.textContent = t('duo.joinRoom');
  if (joinBtnSubEl) joinBtnSubEl.textContent = t('duo.joinSub');
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
  showPreLevelModal(levelId, true, undefined, { skipDuoEnter: true });
}

export async function joinDuoRoomFromLobby(): Promise<void> {
  const room = await loadCurrentRoom();
  const { playerId } = getPlayerIdentity();
  if (!room || room.status !== 'waiting' || room.hostId === playerId || !room.levelId) {
    showFeedback(t('duo.noJoinableRoom'), 'error');
    await refreshRoomCard();
    return;
  }
  const { enterDuoRoom } = await import('./duo');
  const { showPreLevelModal } = await import('./levels');
  await enterDuoRoom(room.levelId);
  showPreLevelModal(room.levelId, true, undefined, { skipDuoEnter: true });
}

export async function refreshDuoLobbyRoom(): Promise<void> {
  await refreshRoomCard();
}
