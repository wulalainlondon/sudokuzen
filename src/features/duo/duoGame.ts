// Duo game logic — countdown, progress, emoji, result
// Extracted from duo.ts, adapted for tier/mode system.

import { gs, type DuoRoomData } from '../../game/state';
import { formatSeconds } from '../../game/utils';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { emitNavigation } from '../../app/navigation/navigationBus';
import { bumpDuoMetric } from './duoMetrics';
import {
  duoRoomRef,
  getFirebaseFieldValue,
  invalidateWaitingRoomsCache,
  stopDuoRoomHeartbeat,
  clearActiveRoomId,
  setSnapshotHandler,
  setResetHandler,
  DUO_STALE_HEARTBEAT_MS,
  setLastStaleGuestPruneMs,
  getLastStaleGuestPruneMs,
} from './duoRoom';
import { pickDuoPuzzle, loadDuoTierPuzzles, DUO_TIER_MAP, DUO_MODE_MAP } from './duoTiers';
import { loadDuoProfile, recordDuoMatch, checkNewUnlocks, type DuoProfile } from './duoProfile';
import type { SudokuWindow } from '../../facade/windowTypes';
import type { FirestoreTransaction } from '../../firebase/types';
import { escapeHtml } from '../../shared/html/escape';

// ── Module-level guards ──────────────────────────────────────────────

let _countdownLaunched = false;
let _countdownRafCancelled = false;
let _countdownRafHandle: number | null = null;
let _duoFinishSubmitted = false;
let _duoResultShown = false;
let _duoOpponentOfflineNotified = false;
let _lastSubmittedProgress = -1;
let _autoForfeitStarted = false;
let _gameStartedAtMs = 0;

// Grace period after game start: don't flag opponent offline during this window.
// Covers cases where heartbeat was briefly paused at the countdown→playing transition.
const GAME_START_GRACE_MS = 60_000;

// ── Register with duoRoom ────────────────────────────────────────────

setSnapshotHandler(handleDuoSnapshot);
setResetHandler(resetDuoState);

// ── Snapshot Handler ─────────────────────────────────────────────────

export function handleDuoSnapshot(d: DuoRoomData): void {
  if (!d || !gs.duoRole) return;

  // ── 觀戰模式分發 ──────────────────────────────────────────────────
  const myFinishTime = gs.duoRole === 'host' ? d.hostFinishTime : d.guestFinishTime;
  const oppFinishTime = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;

  // 對手剛完成，我還在玩 → 開始被觀看（用 != null 避免 finishTime=0 被判為 falsy）
  if (myFinishTime == null && oppFinishTime != null) {
    import('./duoSpectator').then((m) => m.startBeingWatched()).catch(() => {});
  }
  // 炸彈處理（給正在被看的那方）
  if (myFinishTime == null && oppFinishTime != null && d.specBombAt) {
    import('./duoSpectator').then((m) => m.handleBombSnapshot(d)).catch(() => {});
  }
  // 我在觀戰 → 把 snapshot 轉給 spectator 模組
  if (myFinishTime != null && oppFinishTime == null) {
    import('./duoSpectator').then((m) => m.handleSpectatorSnapshot(d)).catch(() => {});
  }
  // 雙方都完成 → 退出觀戰
  if (myFinishTime != null && oppFinishTime != null) {
    import('./duoSpectator').then((m) => m.exitSpectatorMode()).catch(() => {});
    import('./duoSpectator').then((m) => m.stopBeingWatched()).catch(() => {});
  }

  import('./duoLobby')
    .then((m) => {
      m.setDuoLobbyConnectionState('connected');
      if (d.status === 'waiting') m.refreshDuoLobbyRoom();
    })
    .catch(() => {});

  if (d.status === 'waiting' || d.status === 'countdown') {
    const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
    const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
    if (!isInGame) {
      updateDuoRoomUI(d);
    }
  }

  if (d.status === 'waiting') {
    gs.duoRoundLaunched = false;
    gs.duoCountdownStartMs = null;
    _countdownLaunched = false;

    // Host: if both ready, trigger countdown
    if (gs.duoRole === 'host' && d.hostReady && d.guestReady && d.guestId && !_countdownLaunched) {
      duoRoomRef()
        .update({
          status: 'countdown',
          countdownStartedAt: getFirebaseFieldValue().serverTimestamp(),
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        })
        .catch(() => {});
      bumpDuoMetric('roomWriteOps');
    }

    // Host: prune stale guest
    const guestHb = Number(d.guestHeartbeatAtMs || 0);
    if (
      gs.duoRole === 'host' &&
      d.guestId &&
      guestHb > 0 &&
      Date.now() - guestHb > DUO_STALE_HEARTBEAT_MS &&
      Date.now() - getLastStaleGuestPruneMs() > 10_000
    ) {
      setLastStaleGuestPruneMs(Date.now());
      duoRoomRef()
        .update({
          guestId: null,
          guestAlias: null,
          guestTitle: null,
          guestReady: false,
          guestProgress: 0,
          guestFinishTime: null,
          guestStars: null,
          guestDuoWins: null,
          guestHeartbeatAtMs: null,
          guestOnline: false,
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        })
        .catch(() => {});
      bumpDuoMetric('staleGuestReleases');
      bumpDuoMetric('roomWriteOps');
    }
  }

  if (d.status === 'countdown') {
    // Derive startAt from server-stamped countdownStartedAt + 4 seconds
    const csAt = d.countdownStartedAt;
    const effectiveStartAt = csAt
      ? { toMillis: () => (csAt.toMillis ? csAt.toMillis() : (csAt.seconds ?? 0) * 1000) + 4000 }
      : d.startAt;
    if (effectiveStartAt) {
      if (d.tierId) {
        loadDuoTierPuzzles(d.tierId).catch(() => {});
      }
      const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
      const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
      if (!isInGame) {
        startDuoCountdown(effectiveStartAt);
      }
    }
  }

  if (d.status === 'playing' && d.modeId === 'chessClock') {
    import('./duoChessClock').then((m) => m.handleChessClockSnapshot(d)).catch(() => {});
    return; // chess clock 完全接管
  }

  if (d.status === 'playing') {
    gs.duoRoundLaunched = true;
    const oppProgress = gs.duoRole === 'host' ? d.guestProgress : d.hostProgress;
    const oppAlias =
      gs.duoRole === 'host' ? d.guestAlias || t('duoRuntime.opponent') : d.hostAlias || t('duoRuntime.opponent');
    updateDuoProgressUI(oppAlias, oppProgress || 0);

    // Detect opponent disconnect
    {
      const now = Date.now();
      const oppHeartbeat = gs.duoRole === 'host' ? Number(d.guestHeartbeatAtMs || 0) : Number(d.hostHeartbeatAtMs || 0);
      const oppOnline = gs.duoRole === 'host' ? d.guestOnline : d.hostOnline;
      const isOppStale = (oppHeartbeat > 0 && now - oppHeartbeat > DUO_STALE_HEARTBEAT_MS) || oppOnline === false;
      // Don't flag during the grace period right after game start — heartbeats may
      // be momentarily stale during the countdown→playing transition.
      const inGracePeriod = _gameStartedAtMs > 0 && now - _gameStartedAtMs < GAME_START_GRACE_MS;

      if (isOppStale && !inGracePeriod) {
        if (!_duoOpponentOfflineNotified) {
          _duoOpponentOfflineNotified = true;
          showFeedback(t('duoRuntime.opponentOffline'), 'error');
        }
      } else if (!isOppStale && _duoOpponentOfflineNotified) {
        // Opponent's heartbeat recovered — retract the offline flag so that
        // auto-forfeit doesn't fire if we finish later in the same game.
        _duoOpponentOfflineNotified = false;
      }
    }

    // Auto-forfeit offline opponent if we have already finished
    // Covers two scenarios:
    //   A) We finished first, then opponent disconnects → offline flag just set above → forfeit now
    //   B) Opponent disconnected first, we finish later → _duoFinishSubmitted becomes true →
    //      next snapshot hits here with both flags true → forfeit now
    if (_duoFinishSubmitted && _duoOpponentOfflineNotified) {
      const oppFinishCheck = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
      if (oppFinishCheck == null) {
        void autoForfeitOpponent();
      }
    }

    handleDuoEmoji(d);

    // Check opponent finished
    const oppFinish = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
    const oppStars = gs.duoRole === 'host' ? d.guestStars : d.hostStars;
    if (oppFinish !== null && oppFinish !== undefined) {
      showDuoOpponentFinished(oppAlias, oppFinish, oppStars);
    }

    // Check if both finished — guard gs.isDuoMode to prevent stale snapshots
    // from triggering a result before the game has actually launched.
    console.log('[duo] snap hT=', d.hostFinishTime, 'gT=', d.guestFinishTime, 'role=', gs.duoRole, 'resultShown=', _duoResultShown);
    if (d.hostFinishTime != null && d.guestFinishTime != null && gs.isDuoMode) {
      showDuoResult(d);
    }
  }

  if (d.status === 'finished' && gs.isDuoMode) {
    showDuoResult(d);
  }
}

// ── Room View UI ─────────────────────────────────────────────────────

export function updateDuoRoomUI(d: DuoRoomData): void {
  const readyBtn = document.getElementById('duo-ready-btn');
  const countdownArea = document.getElementById('duo-countdown-area');

  // Tier + mode display
  const tierLabel = DUO_TIER_MAP.get(d.tierId)?.label || '';
  const modeLabel = DUO_MODE_MAP.get(d.modeId)?.label || '';
  const tierModeEl = document.getElementById('duo-room-tier-mode');
  if (tierModeEl) tierModeEl.textContent = `${tierLabel} · ${modeLabel}`;

  // Host slot
  const hostAliasEl = document.getElementById('duo-host-alias');
  if (hostAliasEl) hostAliasEl.textContent = d.hostAlias || '--';
  const hostTitleEl = document.getElementById('duo-host-title');
  if (hostTitleEl) {
    hostTitleEl.textContent = d.hostTitle || '';
    hostTitleEl.style.display = d.hostTitle ? '' : 'none';
  }
  const hostSlot = document.getElementById('duo-slot-host');
  const hostStatus = document.getElementById('duo-host-status');
  if (hostSlot) hostSlot.classList.toggle('ready', !!d.hostReady);
  if (hostStatus) {
    hostStatus.textContent = d.hostReady ? t('duoRuntime.statusReady') : t('duoRuntime.statusWaiting');
    hostStatus.classList.toggle('is-ready', !!d.hostReady);
  }
  // Host totem
  const hostTotem = document.getElementById('duo-host-totem');
  if (hostTotem && d.hostAlias) hostTotem.textContent = d.hostAlias.charAt(0).toUpperCase();

  // Guest slot
  const guestSlot = document.getElementById('duo-slot-guest');
  const guestAlias = document.getElementById('duo-guest-alias');
  const guestStatus = document.getElementById('duo-guest-status');
  const guestTotem = document.getElementById('duo-guest-totem');
  if (d.guestId) {
    if (guestSlot) {
      guestSlot.classList.remove('empty');
      guestSlot.classList.toggle('ready', !!d.guestReady);
    }
    if (guestAlias) guestAlias.textContent = d.guestAlias || '--';
    if (guestTotem && d.guestAlias) guestTotem.textContent = d.guestAlias.charAt(0).toUpperCase();
    const guestTitleEl = document.getElementById('duo-guest-title');
    if (guestTitleEl) {
      guestTitleEl.textContent = d.guestTitle || '';
      guestTitleEl.style.display = d.guestTitle ? '' : 'none';
    }
    if (guestStatus) {
      guestStatus.textContent = d.guestReady ? t('duoRuntime.statusReady') : t('duoRuntime.statusWaiting');
      guestStatus.classList.toggle('is-ready', !!d.guestReady);
    }
  } else {
    if (guestSlot) guestSlot.classList.add('empty');
    if (guestAlias) guestAlias.textContent = t('duoRuntime.waitingJoin');
    if (guestTotem) guestTotem.textContent = '?';
    const guestTitleEl = document.getElementById('duo-guest-title');
    if (guestTitleEl) guestTitleEl.style.display = 'none';
    if (guestStatus) {
      guestStatus.textContent = '';
      guestStatus.classList.remove('is-ready');
    }
  }

  // VS badge — battle mode when both ready
  const vsBadge = document.getElementById('duo-vs-badge');
  if (vsBadge) {
    const bothReady = !!d.hostReady && !!d.guestReady && !!d.guestId;
    vsBadge.classList.toggle('battle', bothReady);
    vsBadge.textContent = bothReady ? '⚔️' : 'VS';
  }

  // Stats — show only when guest has joined
  const preStreak = document.getElementById('duo-pre-streak');
  const roomStats = document.getElementById('duo-room-stats');
  const roomStatsContent = document.getElementById('duo-room-stats-content');
  if (d.guestId) {
    const profile = loadDuoProfile();
    if (preStreak) {
      preStreak.textContent = '';
      if (profile.currentStreak >= 2) {
        const badge = document.createElement('div');
        badge.className = 'duo-streak-badge';
        badge.textContent = t('duoRuntime.streakBadge', { holder: '你', count: String(profile.currentStreak) });
        preStreak.appendChild(badge);
      }
    }
    if (roomStats && roomStatsContent) {
      roomStats.classList.remove('hidden');
      const total = profile.wins + profile.losses + profile.draws;
      const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;
      const ringDeg = total > 0 ? Math.round((profile.wins / total) * 360) : 0;
      let html = `<div class="duo-stats-header">
        <div class="duo-winrate-ring" style="background: conic-gradient(var(--duo-accent) ${ringDeg}deg, color-mix(in srgb, var(--cell-border) 30%, transparent) ${ringDeg}deg)">${winRate}%</div>
        <div><div class="duo-stats-summary"><span>${profile.wins}W</span> <span>${profile.losses}L</span> <span>${profile.draws}D</span></div>
        <div class="duo-stats-row" style="margin-top:4px"><span>${t('duo.statsStreak')}</span><span>${profile.currentStreak} (${t('duo.statsBest')}: ${profile.bestStreak})</span></div></div>
      </div>`;
      if (d.hostDuoWins != null && d.guestDuoWins != null) {
        html += `<div class="duo-stats-row duo-stats-vs"><span>${escapeHtml(d.hostAlias)} vs ${escapeHtml(d.guestAlias || '--')}</span><span>${d.hostDuoWins} : ${d.guestDuoWins}</span></div>`;
      }
      roomStatsContent.innerHTML = html;
    }
  } else {
    if (preStreak) preStreak.textContent = '';
    if (roomStats) roomStats.classList.add('hidden');
  }

  // Ready button
  const myReady = gs.duoRole === 'host' ? d.hostReady : d.guestReady;
  const backBtn = document.getElementById('duo-room-back-btn');
  if (d.status === 'countdown') {
    if (readyBtn) readyBtn.style.display = 'none';
    if (countdownArea) countdownArea.style.display = 'block';
    if (backBtn) backBtn.style.display = 'none';
  } else {
    if (readyBtn) {
      readyBtn.style.display = d.guestId ? 'inline-block' : 'none';
      readyBtn.textContent = myReady ? t('duoRuntime.readyConfirm') : t('duoRuntime.readyPrompt');
      readyBtn.classList.toggle('is-ready', myReady);
    }
    if (countdownArea) countdownArea.style.display = 'none';
    if (backBtn) backBtn.style.display = '';
  }
}

// ── Ready Toggle ─────────────────────────────────────────────────────

export async function toggleDuoReady(): Promise<void> {
  if (!gs.firebaseReady || !gs.duoRole) return;
  const field = gs.duoRole === 'host' ? 'hostReady' : 'guestReady';
  const newReady = !gs.duoMyReady;
  try {
    await gs.db!.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data() as unknown as DuoRoomData;
      const update: Record<string, unknown> = {
        [field]: newReady,
        updatedAt: getFirebaseFieldValue().serverTimestamp(),
      };
      if (gs.duoRole === 'host') {
        const hostReady = newReady;
        const guestReady = d.guestReady;
        if (hostReady && guestReady && d.guestId) {
          update.status = 'countdown';
          update.countdownStartedAt = getFirebaseFieldValue().serverTimestamp();
        }
      }
      tx.update(duoRoomRef(), update);
    });
    gs.duoMyReady = newReady;
  } catch (e) {
    console.warn('toggleDuoReady failed:', e);
  }
}

// ── Countdown ────────────────────────────────────────────────────────

function playCountdownBeep(final = false): void {
  try {
    const win = window as unknown as SudokuWindow;
    const AudioCtx = win.AudioContext || win.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = final ? 880 : 440;
    gain.gain.value = 0.15;
    osc.start();
    const duration = final ? 0.3 : 0.15;
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close().catch(() => {}), duration * 1000 + 200);
  } catch {}
}

export function startDuoCountdown(startAtTs: { toMillis?: () => number; seconds?: number }): void {
  if (gs.duoRoundLaunched || _countdownLaunched) return;
  const area = document.getElementById('duo-countdown-area');
  if (!area) return;

  const targetMs = startAtTs.toMillis ? startAtTs.toMillis() : (startAtTs.seconds ?? 0) * 1000;

  // Stale countdown: startAt expired >30s ago — room is stuck; host resets it back to waiting
  const STALE_THRESHOLD_MS = 30_000;
  if (Date.now() - targetMs > STALE_THRESHOLD_MS) {
    if (gs.duoRole === 'host') {
      duoRoomRef()
        .update({
          status: 'waiting',
          startAt: null,
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        })
        .catch(() => {});
    }
    return;
  }

  if (gs.duoCountdownTimer && gs.duoCountdownStartMs === targetMs) return;
  if (gs.duoCountdownTimer && gs.duoCountdownStartMs !== targetMs) {
    clearTimeout(gs.duoCountdownTimer as ReturnType<typeof setTimeout>);
    gs.duoCountdownTimer = null;
  }
  gs.duoCountdownStartMs = targetMs;
  _countdownLaunched = true;
  _countdownRafCancelled = false;

  // Create overlay for countdown
  let overlay = document.getElementById('duo-countdown-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'duo-countdown-overlay';
    overlay.className = 'duo-countdown-overlay';
    document.body.appendChild(overlay);
  }

  let lastShown: number | null = null;
  function updateCountdownUI() {
    if (_countdownRafCancelled) {
      _countdownRafHandle = null;
      return;
    }
    const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
    if (remaining > 0) {
      if (remaining !== lastShown) {
        if (overlay) overlay.innerHTML = `<div class="duo-countdown-display">${remaining}</div>`;
        area!.innerHTML = `<div class="duo-countdown-display">${remaining}</div>`;
        lastShown = remaining;
        playCountdownBeep();
        if (navigator.vibrate) navigator.vibrate(50);
      }
      _countdownRafHandle = requestAnimationFrame(updateCountdownUI);
    } else {
      _countdownRafHandle = null;
    }
  }
  // Cancel any previous countdown RAF before starting new one
  if (_countdownRafHandle !== null) {
    cancelAnimationFrame(_countdownRafHandle);
    _countdownRafHandle = null;
  }
  updateCountdownUI();

  const now = Date.now();
  const delay = Math.max(0, targetMs - now);
  gs.duoCountdownTimer = setTimeout(() => {
    gs.duoCountdownTimer = null;
    if (gs.duoRoundLaunched) return;
    gs.duoRoundLaunched = true;
    if (overlay)
      overlay.innerHTML = `<div class="duo-countdown-display go">GO!</div><div class="duo-countdown-flash"></div>`;
    area!.innerHTML = `<div class="duo-countdown-display go">GO!</div>`;
    playCountdownBeep(true);
    if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 100]);
    setTimeout(() => {
      const ovl = document.getElementById('duo-countdown-overlay');
      if (ovl) ovl.remove();
      launchDuoGame();
    }, 600);
  }, delay) as unknown as ReturnType<typeof setInterval>;
}

// ── Launch Game ──────────────────────────────────────────────────────

export async function launchDuoGame(): Promise<void> {
  if (!gs.duoRoomData) return;
  gs.isDuoMode = true;
  gs.continuousFillDigit = null;
  gs.duoProgressThrottle = 0;
  _lastSubmittedProgress = -1;

  // Safety reset: clear per-round flags that may be stale if resetDuoState() was
  // skipped (e.g., user pressed hardware back button from the result screen).
  // Without this, _duoFinishSubmitted + _duoOpponentOfflineNotified from the
  // previous round cause autoForfeitOpponent() to fire immediately in game 2.
  _duoFinishSubmitted = false;
  _duoOpponentOfflineNotified = false;
  _autoForfeitStarted = false;
  _duoResultShown = false;
  gs.duoOpponentNotified = false;
  _gameStartedAtMs = Date.now();

  const roomData = gs.duoRoomData;
  const tierId: string = roomData.tierId || 'tierI';
  const puzzleSeed: number = roomData.puzzleSeed || 0;
  const modeId: string = roomData.modeId || 'standard';

  // Pick puzzle from tier pool using shared seed
  const level = await pickDuoPuzzle(tierId, puzzleSeed);
  if (!level) {
    showFeedback(t('duo.puzzleLoadFailed'), 'error');
    gs.isDuoMode = false;
    _countdownLaunched = false;
    gs.duoRoundLaunched = false;
    if (gs.duoRole === 'host') {
      // Also reset hostReady so the waiting-handler doesn't immediately re-trigger countdown
      duoRoomRef()
        .update({
          status: 'waiting',
          startAt: null,
          hostReady: false,
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        })
        .catch(() => {});
    } else {
      duoRoomRef()
        .update({
          guestReady: false,
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        })
        .catch(() => {});
    }
    return;
  }

  gs.duoTotalToFill = level.puzzle.filter((v: number) => v === 0).length;

  // Apply mode rules
  const mode = DUO_MODE_MAP.get(modeId);
  if (mode) {
    gs.maxErrors = mode.maxErrors;
    if (!mode.allowNotes) gs.wildNotesDisabled = true;
  }

  // Hide room view & lobby, start game
  emitNavigation({ type: 'hide-pre-level-modal' });
  import('./duoRoomView').then((m) => m.closeDuoRoomView()).catch(() => {});
  import('./duoLobby').then((m) => m.closeDuoLobby()).catch(() => {});
  const levelScreen = document.getElementById('level-screen');
  if (levelScreen) levelScreen.style.display = 'none';
  const { initGame } = await import('../../game/core');
  initGame(level.id, true, false, null, level);

  // Show duo progress bar and emoji bar
  const progressContainer = document.getElementById('duo-progress-container');
  console.log('[duo] launchDuoGame: setting progressContainer display=flex, el=', !!progressContainer);
  if (progressContainer) progressContainer.style.display = 'flex';
  const emojiBar = document.getElementById('duo-emoji-bar');
  if (emojiBar) emojiBar.style.display = 'flex';
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.style.display = 'none';
  const quitBtn = document.getElementById('quit-btn');
  if (quitBtn) quitBtn.style.display = 'none';
  const levelTechHint = document.getElementById('level-tech-hint');
  if (levelTechHint) levelTechHint.style.display = 'none';

  // Update room status to playing via transaction — only host resets progress.
  // IMPORTANT: Never reset finishTimes here. Each round uses a fresh room where
  // finishTimes are already null from createDuoRoom. Resetting them in this
  // transaction creates a race: if submitDuoFinish writes between the tx read
  // and commit, the tx retries and overwrites the finishTime with null.
  try {
    bumpDuoMetric('roomWriteOps');
    await gs.db!.runTransaction(async (tx: FirestoreTransaction) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data() as unknown as DuoRoomData;
      if (d.status === 'playing') return; // already transitioned
      if (gs.duoRole === 'host') {
        tx.update(duoRoomRef(), {
          status: 'playing',
          hostProgress: 0,
          guestProgress: 0,
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        });
      } else {
        tx.update(duoRoomRef(), {
          status: 'playing',
          updatedAt: getFirebaseFieldValue().serverTimestamp(),
        });
      }
    });
  } catch (e) {
    console.warn('launchDuoGame transaction failed:', e);
    showFeedback(t('duoRuntime.roomSyncFailed'), 'error');
  }

  // Chess Clock 模式：由 duoChessClock 接管後續邏輯
  if (modeId === 'chessClock') {
    const { launchChessClockGame } = await import('./duoChessClock');
    await launchChessClockGame();
  }
}

// ── Progress ─────────────────────────────────────────────────────────

export function updateDuoProgress(): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoProgressThrottle < 1000) return;
  gs.duoProgressThrottle = now;
  const filled = gs.cellsData.filter((c) => !c.fixed && c.value !== 0).length;
  if (filled === _lastSubmittedProgress) return;
  _lastSubmittedProgress = filled;
  const field = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  duoRoomRef()
    .update({ [field]: filled, updatedAt: getFirebaseFieldValue().serverTimestamp() })
    .catch(() => {});
  bumpDuoMetric('roomWriteOps');

  // 同步觀戰盤面（如果對手正在觀看）
  import('./duoSpectator').then((m) => m.syncSpecBoardNow()).catch(() => {});
}

function updateDuoProgressUI(oppAlias: string, oppProgress: number): void {
  const oppFill = document.getElementById('duo-progress-fill-opp');
  const oppPct = document.getElementById('duo-progress-opp-pct');
  const oppLabel = document.getElementById('duo-progress-opp-label');
  if (!oppFill) return;
  const pct = gs.duoTotalToFill > 0 ? Math.min(100, Math.round((oppProgress / gs.duoTotalToFill) * 100)) : 0;
  oppFill.style.width = `${pct}%`;
  if (oppPct) oppPct.textContent = `${pct}%`;
  if (oppLabel) oppLabel.textContent = oppAlias;

  // Update self progress
  const selfFill = document.getElementById('duo-progress-fill-self');
  const selfPct = document.getElementById('duo-progress-self-pct');
  if (selfFill) {
    const filled = gs.cellsData.filter((c) => !c.fixed && c.value !== 0).length;
    const myPct = gs.duoTotalToFill > 0 ? Math.min(100, Math.round((filled / gs.duoTotalToFill) * 100)) : 0;
    selfFill.style.width = `${myPct}%`;
    if (selfPct) selfPct.textContent = `${myPct}%`;

    // Add trailing pulse if behind
    if (myPct < pct && pct - myPct > 10) {
      selfFill.classList.add('trailing');
    } else {
      selfFill.classList.remove('trailing');
    }
  }
}

// ── Opponent finished ────────────────────────────────────────────────

function showDuoOpponentFinished(alias: string, timeSec: number, stars: number | null): void {
  if (gs.duoOpponentNotified) return;
  gs.duoOpponentNotified = true;
  const starsStr = stars ? ' ' + '\u2605'.repeat(stars) : '';
  showFeedback(t('duoRuntime.opponentFinished', { alias, time: formatSeconds(timeSec), stars: starsStr }), 'error');
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50]);

  const existing = document.getElementById('duo-forfeit-btn');
  if (!existing) {
    const btn = document.createElement('button');
    btn.id = 'duo-forfeit-btn';
    btn.className = 'duo-forfeit-btn';
    btn.textContent = t('duoRuntime.forfeit');
    btn.onclick = async () => {
      btn.remove();
      await submitDuoFinish(9999, 0);
    };
    const emojiBarEl = document.getElementById('duo-emoji-bar');
    if (emojiBarEl) emojiBarEl.insertAdjacentElement('afterend', btn);
  }
}

// ── Submit Finish ────────────────────────────────────────────────────

export async function submitDuoFinish(timeSec: number, stars: number): Promise<void> {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  if (_duoFinishSubmitted) return;
  _duoFinishSubmitted = true;
  const timeField = gs.duoRole === 'host' ? 'hostFinishTime' : 'guestFinishTime';
  const starsField = gs.duoRole === 'host' ? 'hostStars' : 'guestStars';
  const progressField = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  console.log('[duo] submitDuoFinish START role=', gs.duoRole, 'time=', timeSec, 'fill=', gs.duoTotalToFill);
  try {
    bumpDuoMetric('roomWriteOps');
    await duoRoomRef().update({
      [timeField]: timeSec,
      [starsField]: stars,
      [progressField]: gs.duoTotalToFill,
      updatedAt: getFirebaseFieldValue().serverTimestamp(),
    });
    console.log('[duo] submitDuoFinish OK role=', gs.duoRole);
    // 進入觀戰模式（如果對手還未完成；用 != null 避免 finishTime=0 被判為 falsy）
    const oppDone = gs.duoRole === 'host'
      ? gs.duoRoomData?.guestFinishTime != null
      : gs.duoRoomData?.hostFinishTime != null;
    if (!oppDone) {
      import('./duoSpectator').then((m) => m.enterSpectatorMode(gs.duoRoomData!)).catch(() => {});
    }
  } catch (e) {
    console.warn('[duo] submitDuoFinish FAILED:', e);
  }
}

// ── Auto-forfeit disconnected opponent ───────────────────────────────

async function autoForfeitOpponent(): Promise<void> {
  if (_autoForfeitStarted || !gs.isDuoMode || !gs.firebaseReady) return;
  _autoForfeitStarted = true;
  const timeField = gs.duoRole === 'host' ? 'guestFinishTime' : 'hostFinishTime';
  const starsField = gs.duoRole === 'host' ? 'guestStars' : 'hostStars';
  try {
    await duoRoomRef().update({
      [timeField]: 9999,
      [starsField]: 0,
      updatedAt: getFirebaseFieldValue().serverTimestamp(),
    });
  } catch (e) {
    console.warn('autoForfeitOpponent failed:', e);
  }
}

// ── Result ───────────────────────────────────────────────────────────

let _duoResultRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function showDuoResult(d: DuoRoomData): void {
  if (_duoResultShown) return;

  const hTime = d.hostFinishTime;
  const gTime = d.guestFinishTime;
  if (hTime == null || gTime == null) {
    if (d.status === 'finished') {
      // One player abandoned — treat missing time as forfeit (9999)
      const hFallback = hTime ?? 9999;
      const gFallback = gTime ?? 9999;
      _duoResultShown = true;
      if (_duoResultRetryTimer) {
        clearTimeout(_duoResultRetryTimer);
        _duoResultRetryTimer = null;
      }
      showDuoResultInner(d, hFallback, gFallback);
      return;
    }
    if (!_duoResultRetryTimer) {
      _duoResultRetryTimer = setTimeout(() => {
        _duoResultRetryTimer = null;
        if (!_duoResultShown && gs.duoRoomData) showDuoResult(gs.duoRoomData);
      }, 3000);
    }
    return;
  }
  _duoResultShown = true;
  if (_duoResultRetryTimer) {
    clearTimeout(_duoResultRetryTimer);
    _duoResultRetryTimer = null;
  }
  showDuoResultInner(d, hTime, gTime);
}

function showDuoResultInner(d: DuoRoomData, hTime: number, gTime: number): void {
  const hWin = hTime < gTime;
  const gWin = gTime < hTime;
  const isDraw = hTime === gTime;
  const diff = Math.abs(hTime - gTime);

  // Record match using new DuoProfile
  const profileBefore = loadDuoProfile();
  const beforeSnapshot: DuoProfile = JSON.parse(JSON.stringify(profileBefore));
  const tierId = d.tierId || 'tierI';
  const modeId = d.modeId || 'standard';
  const myTime = gs.duoRole === 'host' ? hTime : gTime;
  const oppTime = gs.duoRole === 'host' ? gTime : hTime;
  const iWon = myTime < oppTime;
  const oppAlias = gs.duoRole === 'host' ? d.guestAlias || '' : d.hostAlias;

  let result: 'win' | 'loss' | 'draw';
  if (isDraw) result = 'draw';
  else if (iWon) result = 'win';
  else result = 'loss';

  const profileAfter = recordDuoMatch(profileBefore, tierId, modeId, result, oppAlias);

  // Check for new unlocks
  const unlocks = checkNewUnlocks(beforeSnapshot, profileAfter);

  // Build content HTML
  let contentHtml = '';

  if (profileAfter.currentStreak >= 2) {
    contentHtml += `<div id="duo-result-streak"><div class="duo-streak-badge">${t('duoRuntime.streakBadgeExcl', { holder: '你', count: String(profileAfter.currentStreak) })}</div></div>`;
  }

  const FORFEIT_SENTINEL = 9999;
  const hostForfeited = hTime === FORFEIT_SENTINEL;
  const guestForfeited = gTime === FORFEIT_SENTINEL;

  function makeCard(alias: string, time: number, stars: number | null, isWinner: boolean, forfeited: boolean): string {
    const resultLabel = isWinner
      ? `<div class="duo-result-label win">${t('duoRuntime.resultWin')}</div>`
      : isDraw
        ? ''
        : `<div class="duo-result-label lose">${t('duoRuntime.resultLose')}</div>`;
    const timeDisplay = forfeited
      ? `<div class="duo-result-time forfeit">${t('duoRuntime.resultForfeitTime')}</div>`
      : `<div class="duo-result-time">${formatSeconds(time)}</div>`;
    const starsDisplay = forfeited ? '' : `<div class="duo-result-stars">${stars ? '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars) : ''}</div>`;
    return `<div class="duo-result-card ${isWinner ? 'winner' : ''}">
      ${resultLabel}
      <div class="duo-result-crown">${isWinner ? '\u{1F451}' : ''}</div>
      <div class="duo-result-alias">${alias || '--'}</div>
      ${timeDisplay}
      ${starsDisplay}
    </div>`;
  }

  contentHtml += `<div class="duo-result-cards" id="duo-result-cards">${makeCard(d.hostAlias, hTime, d.hostStars, hWin, hostForfeited)}${makeCard(d.guestAlias || '', gTime, d.guestStars, gWin, guestForfeited)}</div>`;

  // Tier + mode info
  const tierLabel = DUO_TIER_MAP.get(tierId)?.label || tierId;
  const modeLabelStr = DUO_MODE_MAP.get(modeId)?.label || modeId;
  contentHtml += `<div class="duo-result-tier-mode">${tierLabel} · ${modeLabelStr}</div>`;

  if (isDraw) {
    contentHtml += `<div class="duo-result-diff" id="duo-result-diff">${t('duoRuntime.resultDraw')}</div>`;
  } else if (hostForfeited || guestForfeited) {
    // One player forfeited — show that instead of a meaningless time diff
    contentHtml += `<div class="duo-result-diff" id="duo-result-diff">${t('duoRuntime.resultOpponentForfeit')}</div>`;
  } else {
    const winnerAlias = hWin ? d.hostAlias : d.guestAlias || '';
    const diffClass = iWon ? 'faster' : 'slower';
    contentHtml += `<div class="duo-result-diff ${diffClass}" id="duo-result-diff">${t('duoRuntime.resultFaster', { winner: winnerAlias, diff: formatSeconds(diff) })}</div>`;
  }

  // Stats
  contentHtml += `<div class="duo-result-record" id="duo-result-record">${t('duoRuntime.historyRecord')}<span>${profileAfter.wins}W ${profileAfter.losses}L ${profileAfter.draws}D</span></div>`;

  // Unlock notification
  if (unlocks.newTiers.length || unlocks.newModes.length) {
    const items = [
      ...unlocks.newTiers.map((tid) => DUO_TIER_MAP.get(tid)?.label || tid),
      ...unlocks.newModes.map((mid) => DUO_MODE_MAP.get(mid)?.label || mid),
    ];
    contentHtml += `<div class="duo-unlock-toast">${t('duo.unlockNew')}: ${items.join(', ')}</div>`;
    showFeedback(t('duo.unlockNew') + ': ' + items.join(', '), 'success');
  }

  // Hide emoji bar
  const emojiBarEl = document.getElementById('duo-emoji-bar');
  if (emojiBarEl) emojiBarEl.style.display = 'none';
  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();

  if (iWon) {
    if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25, 70, 50]);
  } else if (isDraw) {
    if (navigator.vibrate) navigator.vibrate([25, 45, 25, 45, 25]);
  }

  import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeOpenDuoResult }) => {
      bridgeOpenDuoResult({ contentHtml, iWon, isDraw, levelId: d.levelId ?? null });
    })
    .catch(() => {});
}

// ── Emoji ────────────────────────────────────────────────────────────

export function sendDuoEmoji(emoji: string): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoEmojiCooldown < 1500) return;
  gs.duoEmojiCooldown = now;
  const field = gs.duoRole === 'host' ? 'hostEmoji' : 'guestEmoji';
  const tsField = gs.duoRole === 'host' ? 'hostEmojiTs' : 'guestEmojiTs';
  duoRoomRef()
    .update({ [field]: emoji, [tsField]: Date.now() })
    .catch(() => {});
  spawnEmojiFloat(emoji, true);
  // Sent ring feedback on the button
  const btns = document.querySelectorAll('.duo-emoji-btn');
  btns.forEach((btn) => {
    if (btn.textContent?.trim() === emoji) {
      btn.classList.remove('sent');
      void (btn as HTMLElement).offsetWidth; // reflow
      btn.classList.add('sent');
      setTimeout(() => btn.classList.remove('sent'), 500);
    }
  });
}

function handleDuoEmoji(d: DuoRoomData): void {
  if (!gs.isDuoMode) return;
  const emojiField = gs.duoRole === 'host' ? 'guestEmoji' : 'hostEmoji';
  const tsField = gs.duoRole === 'host' ? 'guestEmojiTs' : 'hostEmojiTs';
  const emoji = d[emojiField];
  const ts = d[tsField];
  if (!emoji || !ts) return;
  const key = `${ts}`;
  if (key === gs.duoLastEmojiSeen) return;
  gs.duoLastEmojiSeen = key;
  spawnEmojiFloat(emoji, false);

  // Show bubble with opponent name
  const oppAlias = gs.duoRole === 'host' ? d.guestAlias || '' : d.hostAlias;
  spawnEmojiBubble(emoji, oppAlias);
}

function spawnEmojiBubble(emoji: string, alias: string): void {
  const existing = document.querySelector('.duo-emoji-bubble');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'duo-emoji-bubble';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'duo-emoji-bubble-name';
  nameSpan.textContent = alias;
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'duo-emoji-bubble-emoji';
  emojiSpan.textContent = emoji;
  el.appendChild(nameSpan);
  el.appendChild(emojiSpan);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function spawnEmojiFloat(emoji: string, isSelf: boolean): void {
  const el = document.createElement('div');
  el.className = 'duo-emoji-float';
  el.textContent = emoji;
  const x = 50 + (Math.random() - 0.5) * 30;
  if (isSelf) {
    el.style.bottom = '120px';
    el.style.left = `${x}%`;
  } else {
    el.style.top = '80px';
    el.style.left = `${x}%`;
    if (navigator.vibrate) navigator.vibrate(15);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ── Surrender ────────────────────────────────────────────────────────

export async function surrenderDuo(): Promise<void> {
  if (!gs.isDuoMode) return;
  await submitDuoFinish(9999, 0);
  showFeedback(t('duo.surrender'), 'success');
}

// ── Close Result ─────────────────────────────────────────────────────

export async function closeDuoResult(): Promise<void> {
  import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeCloseDuoResult }) => bridgeCloseDuoResult())
    .catch(() => {});
  if (gs.firebaseReady) {
    try {
      bumpDuoMetric('roomWriteOps');
      await duoRoomRef().update({ status: 'finished', updatedAt: getFirebaseFieldValue().serverTimestamp() });
    } catch {
      /* ignore */
    }
  }
  resetDuoState();
  // Navigate back to duo lobby instead of level screen
  emitNavigation({ type: 'show-duo-lobby' });
}

// ── Reset ────────────────────────────────────────────────────────────

export function resetDuoState(): void {
  void import('../../game/bgm').then(({ stopBgm }) => stopBgm());
  _countdownRafCancelled = true;
  if (_countdownRafHandle !== null) {
    cancelAnimationFrame(_countdownRafHandle);
    _countdownRafHandle = null;
  }
  _duoResultShown = false;
  _countdownLaunched = false;
  _duoFinishSubmitted = false;
  if (_duoResultRetryTimer) {
    clearTimeout(_duoResultRetryTimer);
    _duoResultRetryTimer = null;
  }
  _duoOpponentOfflineNotified = false;
  _autoForfeitStarted = false;
  _lastSubmittedProgress = -1;
  _gameStartedAtMs = 0;
  gs.duoEmojiCooldown = 0;
  gs.duoPenaltySeconds = 0;
  gs.duoCooldownUntil = 0;
  gs.duoLastErrorCell = -1;
  gs.duoLastErrorTime = 0;
  gs.duoSameCellStreak = 0;
  if (gs.duoCooldownTimer) {
    clearInterval(gs.duoCooldownTimer);
    gs.duoCooldownTimer = null;
  }
  gs.isDuoMode = false;
  gs.duoRole = null;
  gs.duoRoomData = null;
  gs.duoMyReady = false;
  gs.duoRoundLaunched = false;
  gs.duoCountdownStartMs = null;
  gs.duoOpponentNotified = false;
  gs.duoProgressThrottle = 0;
  gs.maxErrors = 3; // restore default
  gs.wildNotesDisabled = false; // restore
  if (gs.duoCountdownTimer) {
    clearTimeout(gs.duoCountdownTimer as unknown as ReturnType<typeof setTimeout>);
    gs.duoCountdownTimer = null;
  }
  if (gs.duoUnsubscribe) {
    gs.duoUnsubscribe();
    gs.duoUnsubscribe = null;
  }
  stopDuoRoomHeartbeat();
  // Clean up emoji fields
  if (gs.firebaseReady) {
    try {
      duoRoomRef()
        .update({
          hostEmoji: null,
          hostEmojiTs: null,
          guestEmoji: null,
          guestEmojiTs: null,
        })
        .catch(() => {});
    } catch {
      /* no active room */
    }
  }
  if (gs.isChessClockMode) {
    import('./duoChessClock').then((m) => m.resetChessClockState()).catch(() => {});
  }
  import('./duoSpectator').then((m) => m.resetSpectatorState()).catch(() => {});
  import('./duoRoomView').then((m) => m.closeDuoRoomView()).catch(() => {});
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
  const emojiBarEl = document.getElementById('duo-emoji-bar');
  if (emojiBarEl) emojiBarEl.style.display = 'none';
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.style.display = '';
  const quitBtn = document.getElementById('quit-btn');
  if (quitBtn) quitBtn.style.display = '';
  const levelTechHint = document.getElementById('level-tech-hint');
  if (levelTechHint) levelTechHint.style.display = '';
  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();
  gs.duoLastEmojiSeen = '';
  const countdownOverlay = document.getElementById('duo-countdown-overlay');
  if (countdownOverlay) countdownOverlay.remove();
  document.querySelectorAll('.duo-emoji-bubble, .duo-emoji-float').forEach((el) => el.remove());
  clearActiveRoomId();
  invalidateWaitingRoomsCache();
  import('./duoLobby').then((m) => m.refreshDuoLobbyRoom()).catch(() => {});
}
