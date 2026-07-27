// Duo lobby — tier/mode selection, room list, stats card
// Complete rewrite: no more level-select coupling.

import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { escapeHtml } from '../../shared/html/escape';
import { DUO_TIERS, DUO_MODES, DUO_TIER_MAP, DUO_MODE_MAP } from './duoTiers';
import { loadDuoProfile, getUnlockedTiers, getUnlockedModes } from './duoProfile';
import { type DuoRoomSummary } from './duoRoom';
import { saveScroll, restoreScroll } from '../../shared/ui/scrollMemory';
import { canOpenJourneyMode, getJourneyLockMessage } from '../journey';

type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'failed';
const LOBBY_POLL_FAST_MS = 6_000;
const LOBBY_POLL_SLOW_MS = 25_000;
const LOBBY_POLL_FAST_WINDOW_MS = 15_000;
const LOBBY_ENTRY_TIMEOUT_MS = 12_000;
// WS 路徑專用：與 DO 關房寬限（host 斷線 ~30s 後關房）對齊，壓縮「看得到點不進」窗口。
// 搭配 WS_LOBBY_TOUCH_MS=15s，健康 host 的 heartbeat 最舊也只 ~15s，不會被誤隱藏。
const ROOM_FRESHNESS_MS = 45_000;
let _duoLobbyPollTimer: ReturnType<typeof setTimeout> | null = null;
let _duoLobbyOpenedAtMs = 0;
let _selectedTier = 'tier0';
let _selectedMode = 'standard';
let _roomListListenerBound = false;
let _openDuoLobbyPromise: Promise<void> | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('duo lobby entry timed out')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function setDuoEntryBusy(busy: boolean): void {
  for (const id of ['duo-entry-btn', 'duo-journey-entry-btn']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) continue;
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }
}

function duoLobbyEl(): HTMLElement | null {
  return document.getElementById('duo-lobby');
}

function setDuoViewActive(active: boolean): void {
  const mainHeader = document.querySelector('.level-screen-header') as HTMLElement | null;
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const wildLobby = document.getElementById('wild-lobby');
  const duoLobby = duoLobbyEl();
  if (mainHeader) mainHeader.style.display = active ? 'none' : '';
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.toggle('hidden', true);
  if (wildLobby) wildLobby.classList.add('hidden');
  if (duoLobby) duoLobby.classList.toggle('hidden', !active);
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
    const isLocked = !!DUO_MODE_MAP.get(_selectedMode)?.lockedToTierId;
    if (isLocked) {
      pill.disabled = true;
      pill.title = tier.description + '（此模式固定使用此難度）';
    } else {
      pill.onclick = () => {
        _selectedTier = tier.id;
        renderTierSelector();
        renderModeRuleCard();
      };
    }
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
    pill.innerHTML = mode.beta ? `${mode.label}<span class="duo-mode-beta">BETA</span>` : mode.label;
    pill.onclick = () => {
      _selectedMode = mode.id;
      // Chess Clock 鎖定 Tier 0
      const lockedTier = DUO_MODE_MAP.get(_selectedMode)?.lockedToTierId;
      if (lockedTier) _selectedTier = lockedTier;
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
  if (!mode || !tier) {
    el.textContent = '';
    return;
  }
  el.innerHTML = `<div class="duo-rule-desc">${tier.description}</div><div class="duo-rule-detail">${mode.rules}</div>`;
}

// ── Room list ────────────────────────────────────────────────────────

// Bind a single delegated click listener on duo-room-list once.
// All dynamic .duo-room-item buttons inside share this listener — no per-render binding.
function bindRoomListDelegate(): void {
  if (_roomListListenerBound) return;
  const list = document.getElementById('duo-room-list');
  if (!list) return;
  _roomListListenerBound = true;
  list.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.duo-room-item');
    if (!btn || btn.disabled) return;
    const roomId = btn.dataset.room;
    if (!roomId) return;
    btn.disabled = true;
    try {
      const { joinDuoRoom } = await import('./duoRoom');
      const ok = await joinDuoRoom(roomId);
      if (!ok) {
        // 房間已關閉/不可加入（殘留麵包屑）：移除這個死 row 並重整，
        // 避免玩家對著鬼房反覆點。
        btn.remove();
        showFeedback(t('duo.noJoinableRoom'), 'error');
        void refreshRoomCard();
        return;
      }
      closeDuoLobby();
      const { openDuoRoomView } = await import('./duoRoomView');
      openDuoRoomView();
    } finally {
      btn.disabled = false;
    }
  });
}

function renderRoomList(rooms: DuoRoomSummary[]): void {
  const list = document.getElementById('duo-room-list');
  if (!list) return;
  const now = Date.now();
  const fresh = rooms.filter((r) => {
    const hb = r.hostHeartbeatAtMs || r.updatedAtMs;
    return hb > 0 && now - hb < ROOM_FRESHNESS_MS;
  });
  if (!fresh.length) {
    list.innerHTML = `<div class="duo-room-empty">${t('duo.noPublicRoom')}</div>`;
    return;
  }
  list.innerHTML = fresh
    .map((r) => {
      const tierLabel = DUO_TIER_MAP.get(r.tierId)?.label || '';
      const modeLabel = DUO_MODE_MAP.get(r.modeId)?.label || '';
      return `<button class="duo-room-item" data-room="${r.roomId}">
        <div class="duo-room-host">${escapeHtml(r.hostAlias)}</div>
        <div class="duo-room-meta">${escapeHtml(tierLabel)} · ${escapeHtml(modeLabel)}</div>
        <div class="duo-room-join-hint">${t('duo.joinRoom')}</div>
      </button>`;
    })
    .join('');
  bindRoomListDelegate();
}

async function refreshRoomCard(): Promise<void> {
  const { listWaitingDuoRooms } = await import('./duoRoom');
  const rooms = await listWaitingDuoRooms(20);
  const statusEl = document.getElementById('duo-room-status');
  if (statusEl) statusEl.textContent = '';
  renderRoomList(rooms);
}

// ── Polling ──────────────────────────────────────────────────────────

function startLobbyPolling(): void {
  if (_duoLobbyPollTimer) return;
  _duoLobbyOpenedAtMs = Date.now();
  const poll = () => {
    if (!isDuoLobbyOpen() || document.visibilityState !== 'visible') return;
    void import('./duoRoom').then((m) => m.cleanupStaleDuoRooms()).catch(() => {});
    void refreshDuoLobbyRoom();
  };
  const scheduleNext = () => {
    if (!isDuoLobbyOpen()) return;
    const elapsed = Date.now() - _duoLobbyOpenedAtMs;
    const nextMs = elapsed < LOBBY_POLL_FAST_WINDOW_MS ? LOBBY_POLL_FAST_MS : LOBBY_POLL_SLOW_MS;
    _duoLobbyPollTimer = setTimeout(() => {
      poll();
      scheduleNext();
    }, nextMs);
  };
  scheduleNext();
}

function stopLobbyPolling(): void {
  if (_duoLobbyPollTimer) {
    clearTimeout(_duoLobbyPollTimer);
    _duoLobbyPollTimer = null;
  }
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

export function openDuoLobby(): Promise<void> {
  if (!canOpenJourneyMode('duo')) {
    showFeedback(getJourneyLockMessage('duo'), 'error', 4_000);
    return Promise.resolve();
  }

  if (_openDuoLobbyPromise) return _openDuoLobbyPromise;
  _openDuoLobbyPromise = openDuoLobbyInternal().finally(() => {
    setDuoEntryBusy(false);
    _openDuoLobbyPromise = null;
  });
  return _openDuoLobbyPromise;
}

async function openDuoLobbyInternal(): Promise<void> {
  setDuoEntryBusy(true);
  saveScroll('stage-map');
  const levelScreen = document.getElementById('level-screen');
  if (levelScreen) levelScreen.style.display = 'flex';
  const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
  if (gameContainer) gameContainer.style.display = 'none';
  hydrateLabels();
  renderTierSelector();
  renderModeSelector();
  renderModeRuleCard();
  setDuoViewActive(true);
  setDuoLobbyConnectionState('connecting');

  try {
    const { resumeDuoRoomIfAny, cleanupStaleDuoRooms, getActiveDuoRoomId } = await import('./duoRoom');
    const { isDuoWsEnabled } = await import('./duoTransport');
    // An active WebSocket match is authoritative in the Durable Object and
    // must remain resumable even when Firebase lobby discovery/auth is slow.
    if (isDuoWsEnabled() && getActiveDuoRoomId()) {
      const resumed = await withTimeout(resumeDuoRoomIfAny(), LOBBY_ENTRY_TIMEOUT_MS);
      if (resumed && getActiveDuoRoomId()) {
        const { openDuoRoomView } = await import('./duoRoomView');
        openDuoRoomView();
        return;
      }
    }

    const { whenFirebaseReady } = await import('../../firebase/client');
    const ready = await withTimeout(whenFirebaseReady(), LOBBY_ENTRY_TIMEOUT_MS);
    if (!ready) throw new Error('Firebase unavailable');

    // Wait for anonymous auth so authUid is available before any room operations.
    const { initAnonymousAuth } = await import('../../firebase/runtime');
    const authUid = await withTimeout(initAnonymousAuth(), LOBBY_ENTRY_TIMEOUT_MS);
    if (!authUid) throw new Error('Anonymous auth unavailable');

    void cleanupStaleDuoRooms();
    const resumed = await withTimeout(resumeDuoRoomIfAny(), LOBBY_ENTRY_TIMEOUT_MS);
    if (resumed && getActiveDuoRoomId()) {
      const { openDuoRoomView } = await import('./duoRoomView');
      openDuoRoomView();
      return;
    }

    setDuoLobbyConnectionState('connected');
    startLobbyPolling();
    await refreshRoomCard();
  } catch (error) {
    console.warn('openDuoLobby failed:', error);
    stopLobbyPolling();
    setDuoLobbyConnectionState('failed');
    setDuoViewActive(false);
    showFeedback(t('duo.networkRequired'), 'error', 4_000);
  }
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
  if (createBtn) {
    createBtn.textContent = '...';
    (createBtn.closest('button') as HTMLButtonElement | null)?.setAttribute('disabled', '');
  }
  try {
    const { createDuoRoom } = await import('./duoRoom');
    const roomId = await createDuoRoom(_selectedTier, _selectedMode);
    if (!roomId) {
      showFeedback(t('duo.roomCreateFailed'), 'error');
      return;
    }
    // Switch to independent room view
    closeDuoLobby();
    const { openDuoRoomView } = await import('./duoRoomView');
    openDuoRoomView();
  } finally {
    if (createBtn) {
      createBtn.textContent = savedText;
      (createBtn.closest('button') as HTMLButtonElement | null)?.removeAttribute('disabled');
    }
  }
}

export async function joinDuoRoomFromLobby(): Promise<void> {
  const joinBtn = document.getElementById('duo-join-btn') as HTMLButtonElement | null;
  // Auto-match: pick the first fresh waiting room
  const { listWaitingDuoRooms } = await import('./duoRoom');
  const rooms = await listWaitingDuoRooms(10, { force: true });
  const now = Date.now();
  const fresh = rooms.filter((r) => {
    const hb = r.hostHeartbeatAtMs || r.updatedAtMs;
    return hb > 0 && now - hb < ROOM_FRESHNESS_MS && r.tierId === _selectedTier && r.modeId === _selectedMode;
  });
  const roomId = fresh[0]?.roomId || '';
  if (!roomId) {
    showFeedback(t('duo.noJoinableRoom'), 'error');
    await refreshRoomCard();
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
    if (state === 'connected') {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.textContent =
      state === 'connecting'
        ? t('duo.connecting')
        : state === 'reconnecting'
          ? t('duo.connectionLost')
          : t('duo.connectionFailed');
  }
}

export async function refreshDuoLobbyRoom(opts: { force?: boolean } = {}): Promise<void> {
  if (opts.force) {
    const { listWaitingDuoRooms } = await import('./duoRoom');
    await listWaitingDuoRooms(20, { force: true });
  }
  await refreshRoomCard();
}
