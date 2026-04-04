import { getAllLevels } from '../data/dataRegistry';
import { getPlayerIdentity } from '../firebase/client';
import { gs, type DuoRoomData, type LevelData } from '../game/state';
import { showFeedback } from '../ui/feedback';
import { t } from '../i18n/t';
import type { DuoRoomSummary } from './duo';

type ConnState = 'connected' | 'reconnecting' | 'failed';
const LOBBY_POLL_MS = 10_000;
let _duoLobbyPollTimer: ReturnType<typeof setInterval> | null = null;

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

function waitingRoomText(room: DuoRoomSummary): string {
  const level = getAllLevels().find((l) => l.id === room.levelId);
  const levelName = level ? `${level.difficultyName} · ${level.displayName}` : `Level ${room.levelId}`;
  return t('duo.roomHostLevel', { host: room.hostAlias || '--', level: levelName });
}

function ensureDuoReadyZoneHost(): void {
  const host = document.getElementById('duo-ready-zone-host');
  const zone = document.getElementById('duo-ready-zone');
  if (!host || !zone) return;
  if (!host.contains(zone)) host.appendChild(zone);
}

function restoreDuoReadyZoneToBody(): void {
  const zone = document.getElementById('duo-ready-zone');
  if (!zone) return;
  if (zone.parentElement !== document.body) document.body.appendChild(zone);
}

function renderRoomList(rooms: DuoRoomSummary[]): void {
  const list = document.getElementById('duo-room-list');
  if (!list) return;
  if (!rooms.length) {
    list.innerHTML = `<div class="duo-room-empty">${t('duo.noPublicRoom')}</div>`;
    return;
  }
  list.innerHTML = rooms
    .map((r) => {
      const guest = r.guestAlias ? ` · ${r.guestAlias}` : '';
      const lock = r.levelLocked ? ` · ${t('duo.locked')}` : '';
      return `<button class="duo-room-item" data-room="${r.roomId}">
        <span class="duo-room-line1">${waitingRoomText(r)}</span>
        <span class="duo-room-line2">${r.roomId}${guest}${lock}</span>
      </button>`;
    })
    .join('');
  list.querySelectorAll('.duo-room-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const roomId = (el as HTMLElement).dataset.room;
      if (!roomId) return;
      const { joinDuoRoom } = await import('./duo');
      const ok = await joinDuoRoom(roomId);
      if (!ok) showFeedback(t('duo.noJoinableRoom'), 'error');
      await refreshDuoLobbyRoom({ force: true });
    });
  });
}

async function refreshRoomCard(): Promise<void> {
  const statusEl = document.getElementById('duo-room-status');
  const joinBtn = document.getElementById('duo-join-btn') as HTMLButtonElement | null;
  const roomIdEl = document.getElementById('duo-room-id-text');
  const updateBtn = document.getElementById('duo-update-level-btn') as HTMLButtonElement | null;
  const lockBtn = document.getElementById('duo-lock-level-btn') as HTMLButtonElement | null;
  if (!statusEl || !joinBtn) return;
  const { listWaitingDuoRooms, getActiveDuoRoomId } = await import('./duo');
  const rooms = await listWaitingDuoRooms(20);
  const activeRoomId = getActiveDuoRoomId();
  const activeRoom = activeRoomId ? rooms.find((r) => r.roomId === activeRoomId) ?? null : null;
  const { playerId } = getPlayerIdentity();
  const joinable = rooms.find((r) => r.status === 'waiting' && r.roomId !== activeRoomId && r.hostId !== playerId);
  statusEl.textContent = activeRoom ? waitingRoomText(activeRoom) : t('duo.noPublicRoom');
  joinBtn.disabled = !joinable;
  joinBtn.dataset.roomId = joinable?.roomId || '';
  renderRoomList(rooms);
  if (roomIdEl) roomIdEl.textContent = activeRoomId ? `${t('duo.roomId')}: ${activeRoomId}` : '';
  if (updateBtn) updateBtn.disabled = gs.duoRole !== 'host';
  if (lockBtn) {
    lockBtn.disabled = gs.duoRole !== 'host';
    lockBtn.textContent = activeRoom?.levelLocked ? t('duo.unlockLevel') : t('duo.lockLevel');
  }
}

function startLobbyPolling(): void {
  if (_duoLobbyPollTimer) return;
  _duoLobbyPollTimer = setInterval(() => {
    if (!isDuoLobbyOpen() || document.visibilityState !== 'visible') return;
    void import('./duo').then((m) => m.cleanupStaleDuoRooms()).catch(() => {});
    void refreshDuoLobbyRoom();
  }, LOBBY_POLL_MS);
}

function stopLobbyPolling(): void {
  if (_duoLobbyPollTimer) {
    clearInterval(_duoLobbyPollTimer);
    _duoLobbyPollTimer = null;
  }
}

function hydrateLabels(): void {
  const titleEl = document.getElementById('duo-lobby-title');
  const backBtnEl = document.getElementById('duo-back-btn');
  const createTitleEl = document.getElementById('duo-create-title');
  const levelLabelEl = document.getElementById('duo-level-label');
  const hostChipEl = document.getElementById('duo-host-chip');
  const createBtnTextEl = document.getElementById('duo-create-btn-text');
  const createBtnSubEl = document.getElementById('duo-create-btn-sub');
  const joinTitleEl = document.getElementById('duo-join-title');
  const readyTitleEl = document.getElementById('duo-ready-title');
  const refreshBtnEl = document.getElementById('duo-refresh-btn');
  const joinChipEl = document.getElementById('duo-join-chip');
  const joinBtnTextEl = document.getElementById('duo-join-btn-text');
  const joinBtnSubEl = document.getElementById('duo-join-btn-sub');
  const updateBtn = document.getElementById('duo-update-level-btn');
  const lockBtn = document.getElementById('duo-lock-level-btn');
  if (titleEl) titleEl.textContent = t('duo.lobbyTitle');
  if (backBtnEl) backBtnEl.textContent = t('nav.back');
  if (createTitleEl) createTitleEl.textContent = t('duo.createRoom');
  if (levelLabelEl) levelLabelEl.textContent = t('duo.selectLevel');
  if (hostChipEl) hostChipEl.textContent = t('duo.hostChip');
  if (createBtnTextEl) createBtnTextEl.textContent = t('duo.createRoom');
  if (createBtnSubEl) createBtnSubEl.textContent = t('duo.createSub');
  if (joinTitleEl) joinTitleEl.textContent = t('duo.joinRoom');
  if (readyTitleEl) readyTitleEl.textContent = t('duo.readySection');
  if (refreshBtnEl) refreshBtnEl.textContent = t('duo.refreshRoom');
  if (joinChipEl) joinChipEl.textContent = t('duo.joinChip');
  if (joinBtnTextEl) joinBtnTextEl.textContent = t('duo.joinRoom');
  if (joinBtnSubEl) joinBtnSubEl.textContent = t('duo.joinSub');
  if (updateBtn) updateBtn.textContent = t('duo.updateLevel');
  if (lockBtn) lockBtn.textContent = t('duo.lockLevel');
}

export async function openDuoLobby(): Promise<void> {
  if (!gs.firebaseReady) {
    showFeedback(t('duo.networkRequired'), 'error');
    return;
  }
  const { resumeDuoRoomIfAny, startDuoGlowListener, cleanupStaleDuoRooms } = await import('./duo');
  startDuoGlowListener();
  void cleanupStaleDuoRooms();
  await resumeDuoRoomIfAny();
  hydrateLabels();
  renderLevelOptions(gs.pendingLevelId);
  setDuoViewActive(true);
  ensureDuoReadyZoneHost();
  startLobbyPolling();
  await refreshRoomCard();
}

export function closeDuoLobby(): void {
  setDuoViewActive(false);
  restoreDuoReadyZoneToBody();
  stopLobbyPolling();
  import('./duo').then((m) => m.stopDuoGlowListener()).catch(() => {});
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
  const { createDuoRoom } = await import('./duo');
  const roomId = await createDuoRoom(levelId);
  if (!roomId) showFeedback(t('duo.connectionError'), 'error');
  await refreshDuoLobbyRoom({ force: true });
}

export async function joinDuoRoomFromLobby(): Promise<void> {
  const joinBtn = document.getElementById('duo-join-btn') as HTMLButtonElement | null;
  const roomId = joinBtn?.dataset.roomId || '';
  if (!roomId) {
    showFeedback(t('duo.noJoinableRoom'), 'error');
    await refreshDuoLobbyRoom();
    return;
  }
  const { joinDuoRoom } = await import('./duo');
  const ok = await joinDuoRoom(roomId);
  if (!ok) showFeedback(t('duo.noJoinableRoom'), 'error');
  await refreshDuoLobbyRoom({ force: true });
}

export async function updateDuoRoomLevelFromLobby(): Promise<void> {
  const select = document.getElementById('duo-level-select') as HTMLSelectElement | null;
  if (!select) return;
  const levelId = Number(select.value);
  if (!Number.isFinite(levelId)) return;
  const { updateDuoRoomLevel } = await import('./duo');
  const ok = await updateDuoRoomLevel(levelId);
  if (!ok) showFeedback(t('duo.hostOnlyAction'), 'error');
  await refreshDuoLobbyRoom({ force: true });
}

export async function toggleDuoLevelLockFromLobby(): Promise<void> {
  const { toggleDuoLevelLock } = await import('./duo');
  const ok = await toggleDuoLevelLock();
  if (!ok) showFeedback(t('duo.hostOnlyAction'), 'error');
  await refreshDuoLobbyRoom({ force: true });
}

export function syncDuoLobbyRoomState(room: DuoRoomData | null, roomId: string | null): void {
  const roomIdEl = document.getElementById('duo-room-id-text');
  const select = document.getElementById('duo-level-select') as HTMLSelectElement | null;
  if (roomIdEl) roomIdEl.textContent = roomId ? `${t('duo.roomId')}: ${roomId}` : '';
  if (select && room?.levelId) {
    select.value = String(room.levelId);
    select.disabled = !!(room as any).levelLocked && gs.duoRole !== 'host';
  }
}

export function setDuoLobbyConnectionState(state: ConnState): void {
  const el = document.getElementById('duo-conn-state');
  if (!el) return;
  if (state === 'connected') {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.textContent = state === 'reconnecting' ? t('duo.connectionLost') : t('duo.connectionFailed');
}

export async function refreshDuoLobbyRoom(opts: { force?: boolean } = {}): Promise<void> {
  if (opts.force) {
    const { listWaitingDuoRooms } = await import('./duo');
    await listWaitingDuoRooms(20, { force: true });
  }
  await refreshRoomCard();
}
