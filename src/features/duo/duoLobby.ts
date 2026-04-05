// Duo lobby — tier/mode selection, room list, stats card
// Complete rewrite: no more level-select coupling.

import { gs } from '../../game/state';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { DUO_TIERS, DUO_MODES, DUO_TIER_MAP, DUO_MODE_MAP } from './duoTiers';
import { loadDuoProfile, getUnlockedTiers, getUnlockedModes } from './duoProfile';
import type { DuoRoomSummary } from './duoRoom';
import { saveScroll, restoreScroll } from '../levels';

type ConnState = 'connected' | 'reconnecting' | 'failed';
const LOBBY_POLL_MS = 10_000;
let _duoLobbyPollTimer: ReturnType<typeof setInterval> | null = null;
let _selectedTier = 'tierI';
let _selectedMode = 'standard';

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

function relativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return t('duo.timeJustNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('duo.timeMinAgo', { min: String(min) });
  return t('duo.timeHourAgo');
}


// ── Tier/Mode selectors ──────────────────────────────────────────────

function renderTierSelector(): void {
  const container = document.getElementById('duo-tier-selector');
  if (!container) return;
  const profile = loadDuoProfile();
  const unlocked = new Set(getUnlockedTiers(profile));
  container.innerHTML = '';
  for (const tier of DUO_TIERS) {
    if (!unlocked.has(tier.id)) continue;
    const pill = document.createElement('button');
    pill.className = `duo-tier-pill${tier.id === _selectedTier ? ' active' : ''}`;
    pill.textContent = tier.label;
    pill.title = tier.description;
    pill.onclick = () => {
      _selectedTier = tier.id;
      renderTierSelector();
      renderModeRuleCard();
    };
    container.appendChild(pill);
  }
}

function renderModeSelector(): void {
  const container = document.getElementById('duo-mode-selector');
  if (!container) return;
  const profile = loadDuoProfile();
  const unlocked = new Set(getUnlockedModes(profile));
  container.innerHTML = '';
  for (const mode of DUO_MODES) {
    if (!unlocked.has(mode.id)) continue;
    const pill = document.createElement('button');
    pill.className = `duo-mode-pill${mode.id === _selectedMode ? ' active' : ''}`;
    pill.textContent = mode.label;
    pill.onclick = () => {
      _selectedMode = mode.id;
      renderModeSelector();
      renderModeRuleCard();
    };
    container.appendChild(pill);
  }
}

function renderModeRuleCard(): void {
  const el = document.getElementById('duo-mode-rules');
  if (!el) return;
  const mode = DUO_MODE_MAP.get(_selectedMode);
  const tier = DUO_TIER_MAP.get(_selectedTier);
  if (!mode || !tier) { el.textContent = ''; return; }
  el.innerHTML = `<div class="duo-rule-desc">${tier.description}</div><div class="duo-rule-detail">${mode.rules}</div>`;
}

function renderStatsCard(): void {
  const el = document.getElementById('duo-stats-card');
  if (!el) return;
  const p = loadDuoProfile();
  el.innerHTML = `
    <div class="duo-stats-row"><span>${t('duo.statsWins')}</span><span>${p.wins}</span></div>
    <div class="duo-stats-row"><span>${t('duo.statsLosses')}</span><span>${p.losses}</span></div>
    <div class="duo-stats-row"><span>${t('duo.statsDraws')}</span><span>${p.draws}</span></div>
    <div class="duo-stats-row"><span>${t('duo.statsStreak')}</span><span>${p.currentStreak} (${t('duo.statsBest')}: ${p.bestStreak})</span></div>
  `;
}

// ── Room list ────────────────────────────────────────────────────────

function renderRoomList(rooms: DuoRoomSummary[]): void {
  const list = document.getElementById('duo-room-list');
  if (!list) return;
  if (!rooms.length) {
    list.innerHTML = `<div class="duo-room-empty">${t('duo.noPublicRoom')}</div>`;
    return;
  }
  list.innerHTML = rooms
    .map((r) => {
      const tierLabel = DUO_TIER_MAP.get(r.tierId)?.label || '';
      const modeLabel = DUO_MODE_MAP.get(r.modeId)?.label || '';
      const time = r.updatedAtMs ? ` · ${relativeTime(r.updatedAtMs)}` : '';
      return `<button class="duo-room-item" data-room="${r.roomId}">
        <span class="duo-room-line1">${r.hostAlias} · ${tierLabel} · ${modeLabel}</span>
        <span class="duo-room-line2">${r.roomId}${time}</span>
      </button>`;
    })
    .join('');
  list.querySelectorAll('.duo-room-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const btn = el as HTMLButtonElement;
      const roomId = btn.dataset.room;
      if (!roomId || btn.disabled) return;
      btn.disabled = true;
      try {
        const { joinDuoRoom } = await import('./duoRoom');
        const ok = await joinDuoRoom(roomId);
        if (!ok) {
          showFeedback(t('duo.noJoinableRoom'), 'error');
          return;
        }
        closeDuoLobby();
        const { openDuoRoomView } = await import('./duoRoomView');
        openDuoRoomView();
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function refreshRoomCard(): Promise<void> {
  const { listWaitingDuoRooms, getActiveDuoRoomId } = await import('./duoRoom');
  const rooms = await listWaitingDuoRooms(20);
  const activeRoomId = getActiveDuoRoomId();
  const statusEl = document.getElementById('duo-room-status');
  if (statusEl) {
    const activeRoom = activeRoomId ? rooms.find((r) => r.roomId === activeRoomId) ?? null : null;
    statusEl.textContent = activeRoom ? `${activeRoom.hostAlias} · ${DUO_TIER_MAP.get(activeRoom.tierId)?.label || ''}` : t('duo.noPublicRoom');
  }
  const roomIdEl = document.getElementById('duo-room-id-text');
  if (roomIdEl) roomIdEl.textContent = activeRoomId ? `${t('duo.roomId')}: ${activeRoomId}` : '';
  renderRoomList(rooms);
}

// ── Polling ──────────────────────────────────────────────────────────

function startLobbyPolling(): void {
  if (_duoLobbyPollTimer) return;
  _duoLobbyPollTimer = setInterval(() => {
    if (!isDuoLobbyOpen() || document.visibilityState !== 'visible') return;
    void import('./duoRoom').then((m) => m.cleanupStaleDuoRooms()).catch(() => {});
    void refreshDuoLobbyRoom();
  }, LOBBY_POLL_MS);
}

function stopLobbyPolling(): void {
  if (_duoLobbyPollTimer) { clearInterval(_duoLobbyPollTimer); _duoLobbyPollTimer = null; }
}

// ── Labels ───────────────────────────────────────────────────────────

function hydrateLabels(): void {
  const titleEl = document.getElementById('duo-lobby-title');
  const backBtnEl = document.getElementById('duo-back-btn');
  const createBtnTextEl = document.getElementById('duo-create-btn-text');
  const createBtnSubEl = document.getElementById('duo-create-btn-sub');
  const joinTitleEl = document.getElementById('duo-join-title');
  const readyTitleEl = document.getElementById('duo-ready-title');
  const refreshBtnEl = document.getElementById('duo-refresh-btn');
  const joinBtnTextEl = document.getElementById('duo-join-btn-text');
  const joinBtnSubEl = document.getElementById('duo-join-btn-sub');
  if (titleEl) titleEl.textContent = t('duo.lobbyTitle');
  if (backBtnEl) backBtnEl.textContent = t('nav.back');
  if (createBtnTextEl) createBtnTextEl.textContent = t('duo.createRoom');
  if (createBtnSubEl) createBtnSubEl.textContent = t('duo.createSub');
  if (joinTitleEl) joinTitleEl.textContent = t('duo.joinRoom');
  if (readyTitleEl) readyTitleEl.textContent = t('duo.readySection');
  if (refreshBtnEl) refreshBtnEl.textContent = t('duo.refreshRoom');
  if (joinBtnTextEl) joinBtnTextEl.textContent = t('duo.joinRoom');
  if (joinBtnSubEl) joinBtnSubEl.textContent = t('duo.joinSub');
}

// ── Public API ───────────────────────────────────────────────────────

export async function openDuoLobby(): Promise<void> {
  if (!gs.firebaseReady) {
    showFeedback(t('duo.networkRequired'), 'error');
    return;
  }
  saveScroll('stage-map');
  const { resumeDuoRoomIfAny, cleanupStaleDuoRooms, getActiveDuoRoomId } = await import('./duoRoom');
  void cleanupStaleDuoRooms();
  const resumed = await resumeDuoRoomIfAny();
  // If we have an active room, go straight to room view
  if (resumed && getActiveDuoRoomId()) {
    const { openDuoRoomView } = await import('./duoRoomView');
    openDuoRoomView();
    return;
  }
  hydrateLabels();
  renderTierSelector();
  renderModeSelector();
  renderModeRuleCard();
  renderStatsCard();
  setDuoViewActive(true);
  startLobbyPolling();
  await refreshRoomCard();
}

export function closeDuoLobby(): void {
  saveScroll('duo-lobby');
  setDuoViewActive(false);
  stopLobbyPolling();
  restoreScroll('stage-map');
}

export function isDuoLobbyOpen(): boolean {
  const lobby = duoLobbyEl();
  if (!lobby) return false;
  return !lobby.classList.contains('hidden');
}

export async function createDuoRoomFromLobby(): Promise<void> {
  const createBtn = document.getElementById('duo-create-btn-text') as HTMLButtonElement | null;
  const savedText = createBtn?.textContent ?? '';
  if (createBtn) { createBtn.textContent = '...'; (createBtn.closest('button') as HTMLButtonElement | null)?.setAttribute('disabled', ''); }
  try {
    const { createDuoRoom } = await import('./duoRoom');
    const roomId = await createDuoRoom(_selectedTier, _selectedMode);
    if (!roomId) {
      showFeedback(t('duo.connectionError'), 'error');
      return;
    }
    // Switch to independent room view
    closeDuoLobby();
    const { openDuoRoomView } = await import('./duoRoomView');
    openDuoRoomView();
  } finally {
    if (createBtn) { createBtn.textContent = savedText; (createBtn.closest('button') as HTMLButtonElement | null)?.removeAttribute('disabled'); }
  }
}

export async function joinDuoRoomFromLobby(): Promise<void> {
  const joinBtn = document.getElementById('duo-join-btn') as HTMLButtonElement | null;
  const roomId = joinBtn?.dataset.roomId || '';
  if (!roomId) {
    showFeedback(t('duo.noJoinableRoom'), 'error');
    await refreshDuoLobbyRoom();
    return;
  }
  const joinBtnText = document.getElementById('duo-join-btn-text');
  const savedText = joinBtnText?.textContent ?? '';
  if (joinBtn) joinBtn.disabled = true;
  if (joinBtnText) joinBtnText.textContent = '...';
  try {
    const { joinDuoRoom } = await import('./duoRoom');
    const ok = await joinDuoRoom(roomId);
    if (!ok) {
      showFeedback(t('duo.noJoinableRoom'), 'error');
      return;
    }
    // Switch to independent room view
    closeDuoLobby();
    const { openDuoRoomView } = await import('./duoRoomView');
    openDuoRoomView();
  } finally {
    if (joinBtn) joinBtn.disabled = false;
    if (joinBtnText) joinBtnText.textContent = savedText;
  }
}

export function setDuoLobbyConnectionState(state: ConnState): void {
  for (const id of ['duo-conn-state', 'duo-room-conn-state']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (state === 'connected') { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.textContent = state === 'reconnecting' ? t('duo.connectionLost') : t('duo.connectionFailed');
  }
}

export async function refreshDuoLobbyRoom(opts: { force?: boolean } = {}): Promise<void> {
  if (opts.force) {
    const { listWaitingDuoRooms } = await import('./duoRoom');
    await listWaitingDuoRooms(20, { force: true });
  }
  await refreshRoomCard();
}
