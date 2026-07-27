// Duo game logic — countdown, progress, result
import { vibrate } from '../../platform/haptics';
// Extracted from duo.ts, adapted for tier/mode system.

import { gs, type DuoRoomData, type MoveRecord } from '../../game/state';
import { formatSeconds } from '../../game/utils';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { publicPlayerAlias } from '../../platform/publicAlias';
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
  getActiveDuoRoomId,
} from './duoRoom';
import { pickDuoPuzzle, loadDuoTierPuzzles, DUO_TIER_MAP, DUO_MODE_MAP } from './duoTiers';
import {
  loadDuoProfile,
  recordDuoMatch,
  checkNewUnlocks,
  markDuoRoomResultRecorded,
  type DuoProfile,
} from './duoProfile';
import type { SudokuWindow } from '../../facade/windowTypes';
import { escapeHtml } from '../../shared/html/escape';
import { callDuoFunction } from '../../firebase/runtime';
import { isDuoWsEnabled } from './duoTransport';
import { playOpponentFinishedCue, playOpponentThreatCue, playDefeatCue } from '../../game/audio';
import {
  clearDuoRoundSnapshot,
  loadDuoRoundSnapshot,
  restoreDuoCells,
  saveDuoRoundSnapshot,
} from './duoRoundPersistence';

// ── Module-level guards ──────────────────────────────────────────────

let _localMoves: MoveRecord[] = [];

let _countdownLaunched = false;
// WS 模式：本地倒數 timer 一旦進入 GO 序列就設為 true，讓「playing snapshot」
// 知道 launch 已在途、不要搶先觸發（避免 GO! 動畫被切斷）。Firebase 路徑不使用。
let _launchScheduled = false;
let _countdownRafCancelled = false;
let _countdownRafHandle: number | null = null;
let _goLaunchTimer: ReturnType<typeof setTimeout> | null = null;
let _duoFinishSubmitted = false;
let _duoResultShown = false;
let _duoOpponentOfflineNotified = false;
let _lastSubmittedProgress = -1;
let _autoForfeitStarted = false;
let _gameStartedAtMs = 0;
let _oppStaleSince = 0;
let _countdownBeepTimers: ReturnType<typeof setTimeout>[] = [];
// 上一次快照時「我方領先對手的格數」（filled - oppProgress），用來偵測反超/逼近的轉折。
let _prevDuoLead: number | null = null;
// 上一次快照的對手格數，用來確認威脅提示只在「對手真的前進」時觸發（而非我方擦除導致 lead 下降）。
let _prevOppProgress: number | null = null;

// Grace period longer than DUO_STALE_HEARTBEAT_MS (60s) so the stale check has margin
// after grace ends. Background-tab throttling stretches setInterval to 60s+, which
// would otherwise fire the offline toast at exactly the grace boundary.
const GAME_START_GRACE_MS = 90_000;
// Opponent must remain stale for this long before showing the offline toast.
const STALE_CONFIRM_MS = 20_000;

// ── Register with duoRoom ────────────────────────────────────────────

setSnapshotHandler(handleDuoSnapshot);
setResetHandler(resetDuoState);

// ── Snapshot Handler ─────────────────────────────────────────────────

export function handleDuoSnapshot(d: DuoRoomData): void {
  if (!d || !gs.duoRole) return;
  d = {
    ...d,
    hostAlias: publicPlayerAlias(d.hostId, d.hostAlias || ''),
    guestAlias: d.guestId ? publicPlayerAlias(d.guestId, d.guestAlias || '') : null,
  };

  // ── 觀戰模式分發 ──────────────────────────────────────────────────
  const myFinishTime = gs.duoRole === 'host' ? d.hostFinishTime : d.guestFinishTime;
  const oppFinishTime = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;

  // 對手剛完成，我還在玩 → 開始被觀看（用 != null 避免 finishTime=0 被判為 falsy）
  if (myFinishTime == null && oppFinishTime != null) {
    import('./duoSpectator')
      .then((m) => m.startBeingWatched())
      .catch((e) => console.warn('[duo] startBeingWatched failed:', e));
  }
  // 炸彈處理（給正在被看的那方）
  if (myFinishTime == null && oppFinishTime != null && d.specBombAt) {
    import('./duoSpectator')
      .then((m) => m.handleBombSnapshot(d))
      .catch((e) => console.warn('[duo] handleBombSnapshot failed:', e));
  }
  // 我在觀戰 → 把 snapshot 轉給 spectator 模組
  if (myFinishTime != null && oppFinishTime == null) {
    import('./duoSpectator')
      .then((m) => m.handleSpectatorSnapshot(d))
      .catch((e) => console.warn('[duo] handleSpectatorSnapshot failed:', e));
  }
  // 雙方都完成 → 退出觀戰
  if (myFinishTime != null && oppFinishTime != null) {
    import('./duoSpectator')
      .then((m) => m.exitSpectatorMode())
      .catch((e) => console.warn('[duo] exitSpectatorMode failed:', e));
    import('./duoSpectator')
      .then((m) => m.stopBeingWatched())
      .catch((e) => console.warn('[duo] stopBeingWatched failed:', e));
  }

  import('./duoLobby')
    .then((m) => {
      m.setDuoLobbyConnectionState('connected');
      if (d.status === 'waiting') m.refreshDuoLobbyRoom();
    })
    .catch((e) => console.warn('[duo] duoLobby sync failed:', e));

  // WS 大廳麵包屑：host 房一旦有人加入或進入倒數，即從大廳下架（只在開局前檢查）
  if (isDuoWsEnabled() && gs.duoRole === 'host' && (d.status === 'waiting' || d.status === 'countdown')) {
    import('./duoLobbyMirror').then((m) => m.syncWsLobbyRoom(d, getActiveDuoRoomId())).catch(() => {});
  }

  if (d.status === 'waiting' || d.status === 'countdown') {
    const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
    const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
    if (!isInGame) {
      updateDuoRoomUI(d);
    }
  }

  if (d.status === 'waiting') {
    const returningForRematch = _duoResultShown && gs.isDuoMode;
    cancelLocalDuoCountdown();
    resetDuoProgressUI();
    if (returningForRematch) void enterDuoRematchRoom();

    // Host: prune stale guest
    const guestHb = Number(d.guestHeartbeatAtMs || 0);
    if (
      !isDuoWsEnabled() && // WS 模式：presence/沒收由 DO 處理，不寫 Firestore
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
        .catch((e) => console.warn('[duo] staleGuestPrune failed:', e));
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
        loadDuoTierPuzzles(d.tierId).catch((e) => console.warn('[duo] loadDuoTierPuzzles failed:', e));
      }
      const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
      const isInGame = gameContainer && gameContainer.style.display !== 'none' && !gs.isDuoMode;
      if (!isInGame) {
        startDuoCountdown(effectiveStartAt);
      }
    }
  }

  if (d.status === 'playing' && d.modeId === 'chessClock') {
    import('./duoChessClock')
      .then((m) => m.handleChessClockSnapshot(d))
      .catch((e) => console.warn('[duo] handleChessClockSnapshot failed:', e));
    return;
  }

  if (d.status === 'playing') {
    if (isDuoWsEnabled()) {
      // WS：DO alarm 獨立把 status 轉 playing，與本地倒數 timer 是兩個觸發源。
      // 若本地 timer 尚未進入 GO 序列（snapshot 搶先到，或重連直接進 playing），
      // 由 snapshot 負責 launch；否則讓 GO 序列跑完由 timer launch。兩者互斥。
      if (!gs.isDuoMode && !_launchScheduled) {
        gs.duoRoundLaunched = true;
        void launchDuoGame();
      }
    } else {
      gs.duoRoundLaunched = true;
    }
    const oppProgress = gs.duoRole === 'host' ? d.guestProgress : d.hostProgress;
    const oppAlias =
      gs.duoRole === 'host' ? d.guestAlias || t('duoRuntime.opponent') : d.hostAlias || t('duoRuntime.opponent');
    const oppFinishedNow = (gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime) != null;
    updateDuoProgressUI(oppAlias, oppProgress || 0, oppFinishedNow);

    // Detect opponent disconnect
    {
      const now = Date.now();
      const oppHeartbeat = gs.duoRole === 'host' ? Number(d.guestHeartbeatAtMs || 0) : Number(d.hostHeartbeatAtMs || 0);
      const oppOnline = gs.duoRole === 'host' ? d.guestOnline : d.hostOnline;
      const isOppStale = (oppHeartbeat > 0 && now - oppHeartbeat > DUO_STALE_HEARTBEAT_MS) || oppOnline === false;
      const inGracePeriod = _gameStartedAtMs > 0 && now - _gameStartedAtMs < GAME_START_GRACE_MS;

      if (isOppStale && !inGracePeriod) {
        // Require sustained staleness before notifying — avoids false alarms from
        // background-tab throttling (browser stretches setInterval to 60s+).
        if (_oppStaleSince === 0) _oppStaleSince = now;
        if (now - _oppStaleSince >= STALE_CONFIRM_MS && !_duoOpponentOfflineNotified) {
          _duoOpponentOfflineNotified = true;
          showFeedback(t('duoRuntime.opponentOffline'), 'error');
        }
        // 狀態燈：一偵測到不穩立刻轉橙（玩家不再乾等猜測），確認離線才轉紅。
        setOppConnIndicator(_duoOpponentOfflineNotified ? 'offline' : 'uncertain');
      } else {
        _oppStaleSince = 0;
        if (!isOppStale && _duoOpponentOfflineNotified) {
          // Opponent's heartbeat recovered — retract so auto-forfeit doesn't misfire.
          _duoOpponentOfflineNotified = false;
        }
        if (!isOppStale) {
          setOppConnIndicator('online');
        } else if (inGracePeriod && oppOnline === false) {
          // P2b：開局 90s 寬限內，server 權威判定對手離線（非本地心跳推測）→
          // 至少給橙燈，消除「開局就掉線卻一路顯示在線」的盲區。toast / 自動沒收
          // 仍受 !inGracePeriod 守衛，不會在寬限內誤觸。
          setOppConnIndicator('uncertain');
        }
      }
    }

    // Auto-forfeit offline opponent if we have already finished
    // Covers two scenarios:
    //   A) We finished first, then opponent disconnects → offline flag just set above → forfeit now
    //   B) Opponent disconnected first, we finish later → _duoFinishSubmitted becomes true →
    //      next snapshot hits here with both flags true → forfeit now
    if (!isDuoWsEnabled() && _duoFinishSubmitted && _duoOpponentOfflineNotified) {
      // WS 模式：斷線沒收由 DO 寬限期 alarm 處理，client 不呼叫 CF
      const oppFinishCheck = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
      if (oppFinishCheck == null) {
        void autoForfeitOpponent();
      }
    }

    // Check opponent finished
    const oppFinish = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
    const oppStars = gs.duoRole === 'host' ? d.guestStars : d.hostStars;
    if (oppFinish !== null && oppFinish !== undefined) {
      showDuoOpponentFinished(oppAlias, oppFinish, oppStars);
    }

    // Check if both finished — guard gs.isDuoMode to prevent stale snapshots
    // from triggering a result before the game has actually launched.
    if (d.hostFinishTime != null && d.guestFinishTime != null && gs.isDuoMode) {
      showDuoResult(d);
    }
  }

  // A full browser/app restart resets the in-memory `isDuoMode` flag, but the
  // stored room breadcrumb can still reclaim an authoritative finished room.
  // The direct `hello` response already proves this client owns the seat, so
  // show the result even when no local board was relaunched. Keeping the old
  // `isDuoMode` guard trapped both players on an empty room shell after a
  // dual-disconnect forfeit.
  if (d.status === 'finished') {
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
  // Cloudflare WebSocket 路徑（feature flag）
  if (isDuoWsEnabled()) {
    if (!gs.duoRole) return;
    const newReady = !gs.duoMyReady;
    const { duoWsReady } = await import('./duoSocket');
    duoWsReady(newReady);
    gs.duoMyReady = newReady;
    return;
  }

  if (!gs.firebaseReady || !gs.duoRole) return;
  const roomId = getActiveDuoRoomId();
  if (!roomId) return;
  const newReady = !gs.duoMyReady;
  try {
    await callDuoFunction('duoToggleReady', { roomId });
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
    const beepTimer = setTimeout(
      () => {
        ctx.close().catch(() => {});
        _countdownBeepTimers = _countdownBeepTimers.filter((t) => t !== beepTimer);
      },
      duration * 1000 + 200,
    );
    _countdownBeepTimers.push(beepTimer);
  } catch {}
}

export function startDuoCountdown(startAtTs: { toMillis?: () => number; seconds?: number }): void {
  if (gs.duoRoundLaunched || _countdownLaunched) return;
  const area = document.getElementById('duo-countdown-area');
  if (!area) return;

  const targetMs = startAtTs.toMillis ? startAtTs.toMillis() : (startAtTs.seconds ?? 0) * 1000;

  // Stale countdown: startAt expired >30s ago — Watchdog handles server-side reset
  const STALE_THRESHOLD_MS = 30_000;
  if (Date.now() - targetMs > STALE_THRESHOLD_MS) {
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
        vibrate(50);
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
    _launchScheduled = true; // GO 序列開始：WS 的 playing snapshot 不要搶先 launch
    if (overlay)
      overlay.innerHTML = `<div class="duo-countdown-display go">GO!</div><div class="duo-countdown-flash"></div>`;
    area!.innerHTML = `<div class="duo-countdown-display go">GO!</div>`;
    playCountdownBeep(true);
    vibrate([50, 30, 50, 30, 100]);
    _goLaunchTimer = setTimeout(() => {
      _goLaunchTimer = null;
      if (isDuoWsEnabled() && gs.duoRoomData?.status !== 'playing') {
        cancelLocalDuoCountdown();
        return;
      }
      const ovl = document.getElementById('duo-countdown-overlay');
      if (ovl) ovl.remove();
      void launchDuoGame();
    }, 600);
  }, delay) as unknown as ReturnType<typeof setInterval>;
}

function cancelLocalDuoCountdown(): void {
  _countdownRafCancelled = true;
  if (_countdownRafHandle !== null) {
    cancelAnimationFrame(_countdownRafHandle);
    _countdownRafHandle = null;
  }
  if (gs.duoCountdownTimer) {
    clearTimeout(gs.duoCountdownTimer as unknown as ReturnType<typeof setTimeout>);
    gs.duoCountdownTimer = null;
  }
  if (_goLaunchTimer !== null) {
    clearTimeout(_goLaunchTimer);
    _goLaunchTimer = null;
  }
  _countdownBeepTimers.forEach((timer) => clearTimeout(timer));
  _countdownBeepTimers = [];
  document.getElementById('duo-countdown-overlay')?.remove();
  gs.duoRoundLaunched = false;
  gs.duoCountdownStartMs = null;
  _countdownLaunched = false;
  _launchScheduled = false;
}

function resetDuoProgressUI(): void {
  for (const id of ['duo-progress-fill-self', 'duo-progress-fill-opp']) {
    const fill = document.getElementById(id);
    if (fill) {
      fill.style.width = '0%';
      fill.classList.remove('trailing');
    }
  }
  for (const id of ['duo-progress-self-pct', 'duo-progress-opp-pct']) {
    const pct = document.getElementById(id);
    if (pct) pct.textContent = '0%';
  }
}

function roomStartAtMs(d: DuoRoomData): number {
  const startAt = d.startAt;
  if (!startAt) return Date.now();
  const value = startAt.toMillis ? startAt.toMillis() : (startAt.seconds ?? 0) * 1000;
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

export function persistDuoRoundState(): void {
  const roomId = getActiveDuoRoomId();
  const role = gs.duoRole;
  const room = gs.duoRoomData;
  if (!gs.isDuoMode || !roomId || !role || !room || gs.cellsData.length !== 81) return;
  saveDuoRoundSnapshot({
    roomId,
    role,
    puzzleSeed: Number(room.puzzleSeed) || 0,
    startedAtMs: _gameStartedAtMs || roomStartAtMs(room),
    seconds: gs.seconds,
    errors: gs.errors,
    cells: gs.cellsData.map((cell) => ({ value: cell.value, notes: [...cell.notes] })),
    moves: _localMoves,
  });
}

// ── Launch Game ──────────────────────────────────────────────────────

export async function launchDuoGame(): Promise<void> {
  if (!gs.duoRoomData) return;
  if (isDuoWsEnabled() && gs.duoRoomData.status !== 'playing') {
    cancelLocalDuoCountdown();
    return;
  }
  // 兜底移除倒數 overlay：WS 模式下 DO 的 playing snapshot 可能搶在本地 GO 序列前
  // launch（網路時序競態）。此時 GO 序列的 setTimeout 會因 gs.duoRoundLaunched 提早 return，
  // 漏掉移除全螢幕 overlay(position:fixed/inset:0/z-index:500)，蓋住棋盤導致格子不可點。
  // 不論哪條路徑 launch，這裡都確保 overlay 被清掉、倒數 RAF 停止。
  _countdownRafCancelled = true;
  if (_countdownRafHandle !== null) {
    cancelAnimationFrame(_countdownRafHandle);
    _countdownRafHandle = null;
  }
  const leftoverCountdownOverlay = document.getElementById('duo-countdown-overlay');
  if (leftoverCountdownOverlay) leftoverCountdownOverlay.remove();
  gs.isDuoMode = true;
  gs.continuousFillDigit = null;
  gs.duoProgressThrottle = 0;
  _lastSubmittedProgress = -1;
  resetDuoProgressUI();

  // Safety reset: clear per-round flags that may be stale if resetDuoState() was
  // skipped (e.g., user pressed hardware back button from the result screen).
  // Without this, _duoFinishSubmitted + _duoOpponentOfflineNotified from the
  // previous round cause autoForfeitOpponent() to fire immediately in game 2.
  _duoFinishSubmitted = false;
  _duoOpponentOfflineNotified = false;
  _oppStaleSince = 0;
  _prevDuoLead = null;
  _prevOppProgress = null;
  _autoForfeitStarted = false;
  _duoResultShown = false;
  _localMoves = [];
  gs.duoOpponentNotified = false;
  _gameStartedAtMs = roomStartAtMs(gs.duoRoomData);

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
    const roomId = getActiveDuoRoomId();
    if (roomId) {
      await callDuoFunction('duoAbortGame', { roomId }).catch((e) => console.warn('[duo] duoAbortGame failed:', e));
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
  import('./duoRoomView')
    .then((m) => m.closeDuoRoomView())
    .catch((e) => console.warn('[duo] closeDuoRoomView failed:', e));
  import('./duoLobby').then((m) => m.closeDuoLobby()).catch((e) => console.warn('[duo] closeDuoLobby failed:', e));
  const levelScreen = document.getElementById('level-screen');
  if (levelScreen) levelScreen.style.display = 'none';
  const { initGame } = await import('../../game/core');
  initGame(level.id, true, false, null, level);

  const roomId = getActiveDuoRoomId();
  const role = gs.duoRole;
  if (roomId && role) {
    const saved = loadDuoRoundSnapshot(roomId, role, puzzleSeed);
    if (saved) {
      restoreDuoCells(gs.cellsData, level.puzzle, level.solution, saved);
      _localMoves = saved.moves;
      _gameStartedAtMs = Math.min(saved.startedAtMs || _gameStartedAtMs, _gameStartedAtMs);
      gs.seconds = Math.max(saved.seconds, Math.floor((Date.now() - _gameStartedAtMs) / 1000));
      gs.errors = Math.min(gs.maxErrors, saved.errors);
      const { renderGrid } = await import('../../game/board');
      const { startTimer } = await import('../../game/timer');
      renderGrid();
      startTimer(false);
    }
  }

  // Show duo progress bar
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'flex';
  updateDuoProgressUI(
    gs.duoRole === 'host'
      ? roomData.guestAlias || t('duoRuntime.opponent')
      : roomData.hostAlias || t('duoRuntime.opponent'),
    gs.duoRole === 'host' ? roomData.guestProgress || 0 : roomData.hostProgress || 0,
  );
  updateDuoProgress();
  setOppConnIndicator('online'); // 每局開始狀態燈歸零（綠）
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.style.display = 'none';
  const quitBtn = document.getElementById('quit-btn');
  if (quitBtn) quitBtn.style.display = 'none';
  const levelTechHint = document.getElementById('level-tech-hint');
  if (levelTechHint) levelTechHint.style.display = 'none';

  // Update room status to playing via Cloud Function — only host resets progress.
  // WebSocket 路徑：DO alarm 在 startAt 自動轉 playing，client 不需呼叫。
  if (!isDuoWsEnabled()) {
    try {
      await callDuoFunction('duoSetPlaying', { roomId: getActiveDuoRoomId()! });
    } catch (e) {
      console.warn('duoSetPlaying failed:', e);
      showFeedback(t('duoRuntime.roomSyncFailed'), 'error');
    }
  }

  // Chess Clock 模式：由 duoChessClock 接管後續邏輯
  if (modeId === 'chessClock') {
    const { launchChessClockGame } = await import('./duoChessClock');
    await launchChessClockGame();
  }
}

// ── Progress ─────────────────────────────────────────────────────────

export function updateDuoProgress(): void {
  if (!gs.isDuoMode) return;
  if (!isDuoWsEnabled() && !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoProgressThrottle < 1000) return;
  gs.duoProgressThrottle = now;
  const filled = gs.cellsData.filter((c) => !c.fixed && c.value !== 0).length;
  if (filled === _lastSubmittedProgress) return;
  _lastSubmittedProgress = filled;

  if (isDuoWsEnabled()) {
    void import('./duoSocket').then((m) => m.duoWsProgress(filled));
    return; // 觀戰盤面同步是 Phase 4
  }

  const field = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  duoRoomRef()
    .update({ [field]: filled, updatedAt: getFirebaseFieldValue().serverTimestamp() })
    .catch((e) => console.warn('[duo] updateDuoProgress failed:', e));
  bumpDuoMetric('roomWriteOps');

  // 同步觀戰盤面（如果對手正在觀看）
  import('./duoSpectator')
    .then((m) => m.syncSpecBoardNow())
    .catch((e) => console.warn('[duo] syncSpecBoardNow import failed:', e));
}

function updateDuoProgressUI(oppAlias: string, oppProgress: number, oppFinished = false): void {
  const oppFill = document.getElementById('duo-progress-fill-opp');
  const oppPct = document.getElementById('duo-progress-opp-pct');
  const oppLabel = document.getElementById('duo-progress-opp-label');
  if (!oppFill) return;
  const pct = gs.duoTotalToFill > 0 ? Math.min(100, Math.round((oppProgress / gs.duoTotalToFill) * 100)) : 0;
  oppFill.style.width = `${pct}%`;
  if (oppPct) oppPct.textContent = `${pct}%`;
  if (oppLabel) oppLabel.textContent = oppAlias;

  // Update self progress
  const filled = gs.cellsData.filter((c) => !c.fixed && c.value !== 0).length;
  const selfFill = document.getElementById('duo-progress-fill-self');
  const selfPct = document.getElementById('duo-progress-self-pct');
  if (selfFill) {
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

  // P1a：以格數比較偵測「對手反超 / 逼近」轉折 → 閃自己的進度列 + 輕音效。
  // 只在對局進行中（雙方皆未完成）才提示，避免結算前後誤觸。
  const total = gs.duoTotalToFill;
  const iAmDone = total > 0 && filled >= total;
  if (!gs.duoOpponentNotified && !oppFinished && !iAmDone) {
    const lead = filled - oppProgress;
    // 只在「對手真的前進」時評估威脅 → 避免我方擦除讓 lead 下降誤判反超，
    // 也避免對手完成瞬間（oppProgress 停滯）與完成音效疊放。
    const oppAdvanced = _prevOppProgress !== null && oppProgress > _prevOppProgress;
    if (_prevDuoLead !== null && oppAdvanced) {
      const overtaken = _prevDuoLead >= 0 && lead < 0; // 對手剛從落後/平手變成領先
      const tightened = !overtaken && Math.abs(_prevDuoLead) > 1 && Math.abs(lead) <= 1; // 差距縮到 ±1 格
      if (overtaken) {
        flashDuoSelfRow('threat-strong');
        playOpponentThreatCue(true);
      } else if (tightened) {
        flashDuoSelfRow('threat-soft');
        playOpponentThreatCue(false);
      }
    }
    _prevDuoLead = lead;
    _prevOppProgress = oppProgress;
  } else {
    _prevDuoLead = null;
    _prevOppProgress = null;
  }
}

// 閃一下自己的進度列以提示賽況轉折（reflow 重啟動畫，可重複觸發）。
function flashDuoSelfRow(cls: 'threat-strong' | 'threat-soft'): void {
  const row = document.getElementById('duo-progress-fill-self')?.closest('.duo-progress-row') as HTMLElement | null;
  if (!row) return;
  row.classList.remove('threat-strong', 'threat-soft');
  void row.offsetWidth; // 強制 reflow，讓同名動畫能重新播放
  row.classList.add(cls);
}

// 對手連線狀態燈：online(綠)/uncertain(橙脈衝)/offline(紅)
function setOppConnIndicator(state: 'online' | 'uncertain' | 'offline'): void {
  const dot = document.getElementById('duo-progress-opp-conn');
  if (!dot) return;
  dot.classList.toggle('uncertain', state === 'uncertain');
  dot.classList.toggle('offline', state === 'offline');
}

// ── Opponent finished ────────────────────────────────────────────────

function showDuoOpponentFinished(alias: string, timeSec: number, stars: number | null): void {
  if (gs.duoOpponentNotified) return;
  gs.duoOpponentNotified = true;
  const starsStr = stars ? ' ' + '\u2605'.repeat(stars) : '';
  showFeedback(t('duoRuntime.opponentFinished', { alias, time: formatSeconds(timeSec), stars: starsStr }), 'error');
  vibrate([50, 30, 50, 30, 50]);
  playOpponentFinishedCue(); // P1b：對手完成的標誌性音效（過去只有震動）

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
    const progressContainer = document.getElementById('duo-progress-container');
    if (progressContainer) progressContainer.insertAdjacentElement('afterend', btn);
    else document.body.appendChild(btn);
  }
}

// ── Move Recorder ────────────────────────────────────────────────────

export function recordDuoMove(cell: number, val: number, ok: boolean): void {
  if (!gs.isDuoMode || !_gameStartedAtMs) return;
  _localMoves.push({ t: Date.now() - _gameStartedAtMs, cell, val, ok });
  if (ok || val === 0) persistDuoRoundState();
  else setTimeout(() => persistDuoRoundState(), 450);
}

// ── Submit Finish ────────────────────────────────────────────────────

export async function submitDuoFinish(timeSec: number, stars: number): Promise<void> {
  if (!gs.isDuoMode) return;
  if (!isDuoWsEnabled() && !gs.firebaseReady) return;
  if (_duoFinishSubmitted) return;
  _duoFinishSubmitted = true;

  if (isDuoWsEnabled()) {
    const { duoWsFinish } = await import('./duoSocket');
    duoWsFinish(timeSec, stars, _localMoves);
    return;
  }

  const roomId = getActiveDuoRoomId();
  if (!roomId) return;
  try {
    await callDuoFunction('duoSubmitFinish', {
      roomId,
      timeSec,
      stars,
      progress: gs.duoTotalToFill,
      moves: _localMoves,
    });
    // 進入觀戰模式（如果對手還未完成；用 != null 避免 finishTime=0 被判為 falsy）
    const oppDone =
      gs.duoRole === 'host' ? gs.duoRoomData?.guestFinishTime != null : gs.duoRoomData?.hostFinishTime != null;
    if (!oppDone) {
      import('./duoSpectator')
        .then((m) => m.enterSpectatorMode(gs.duoRoomData!))
        .catch((e) => console.warn('[duo] enterSpectatorMode failed:', e));
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'functions/failed-precondition') {
      // duoSetPlaying not yet complete — reset flag and retry in 1s
      _duoFinishSubmitted = false;
      setTimeout(() => submitDuoFinish(timeSec, stars), 1000);
    } else {
      console.warn('[duo] submitDuoFinish FAILED:', e);
    }
  }
}

// ── Auto-forfeit disconnected opponent ───────────────────────────────

async function autoForfeitOpponent(): Promise<void> {
  if (_autoForfeitStarted || !gs.isDuoMode || !gs.firebaseReady) return;
  _autoForfeitStarted = true;
  const roomId = getActiveDuoRoomId();
  if (!roomId) return;
  try {
    await callDuoFunction('duoAutoForfeitOpponent', { roomId });
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

  const roomId = getActiveDuoRoomId();
  const roundKey = roomId ? `${roomId}:${d.puzzleSeed || 0}` : '';
  const profileAfter = markDuoRoomResultRecorded(roundKey)
    ? recordDuoMatch(profileBefore, tierId, modeId, result, oppAlias)
    : profileBefore;

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
    const starsDisplay = forfeited
      ? ''
      : `<div class="duo-result-stars">${stars ? '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars) : ''}</div>`;
    return `<div class="duo-result-card ${isWinner ? 'winner' : ''}">
      ${resultLabel}
      <div class="duo-result-crown">${isWinner ? '\u{1F451}' : ''}</div>
      <div class="duo-result-alias">${escapeHtml(alias) || '--'}</div>
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

  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();
  clearDuoRoundSnapshot();

  if (iWon) {
    vibrate([25, 45, 25, 45, 25, 70, 50]);
  } else if (isDraw) {
    vibrate([25, 45, 25, 45, 25]);
  } else {
    // P2a：落敗也給回饋（低沉音 + 輕震動），不再被靜默冷處理
    vibrate([80, 50, 140]);
    playDefeatCue();
  }

  const puzzle = gs.currentLevel?.puzzle ?? [];
  import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeOpenDuoResult }) => {
      bridgeOpenDuoResult({
        contentHtml,
        iWon,
        isDraw,
        levelId: d.levelId ?? null,
        hostMoves: d.hostMoves ?? [],
        guestMoves: d.guestMoves ?? [],
        hostAlias: d.hostAlias || '',
        guestAlias: d.guestAlias || '',
        puzzle,
      });
    })
    .catch((e) => console.warn('[duo] bridgeOpenDuoResult failed:', e));
}

// ── Surrender ────────────────────────────────────────────────────────

export async function surrenderDuo(): Promise<void> {
  if (!gs.isDuoMode || _duoFinishSubmitted) return;
  _duoFinishSubmitted = true;

  if (isDuoWsEnabled()) {
    const { duoWsSurrender } = await import('./duoSocket');
    duoWsSurrender(_localMoves);
    showFeedback(t('duo.surrender'), 'success');
    return;
  }

  const roomId = getActiveDuoRoomId();
  if (roomId && gs.firebaseReady) {
    await callDuoFunction('duoSurrender', { roomId, moves: _localMoves }).catch((e) => {
      console.warn('[duo] duoSurrender failed:', e);
      _duoFinishSubmitted = false;
    });
  }
  showFeedback(t('duo.surrender'), 'success');
}

// ── Close Result ─────────────────────────────────────────────────────

export async function closeDuoResult(): Promise<void> {
  import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeCloseDuoResult }) => bridgeCloseDuoResult())
    .catch((e) => console.warn('[duo] bridgeCloseDuoResult failed:', e));
  import('../../react/duoreview/duoReviewBridge')
    .then(({ bridgeCloseDuoReview }) => bridgeCloseDuoReview())
    .catch(() => {});
  const roomId = getActiveDuoRoomId();
  clearDuoRoundSnapshot();
  if (isDuoWsEnabled()) {
    const { duoWsCloseResult } = await import('./duoSocket');
    duoWsCloseResult();
  } else if (gs.firebaseReady && roomId) {
    await callDuoFunction('duoCloseResult', { roomId }).catch(() => {});
  }
  resetDuoState();
  emitNavigation({ type: 'show-duo-lobby' });
}

async function enterDuoRematchRoom(): Promise<void> {
  clearDuoRoundSnapshot();
  cancelLocalDuoCountdown();
  if (gs.timerInterval) {
    clearInterval(gs.timerInterval);
    gs.timerInterval = null;
  }
  _duoResultShown = false;
  _duoFinishSubmitted = false;
  _duoOpponentOfflineNotified = false;
  _autoForfeitStarted = false;
  _lastSubmittedProgress = -1;
  _localMoves = [];
  _gameStartedAtMs = 0;
  gs.isDuoMode = false;
  gs.duoMyReady = false;
  gs.duoTotalToFill = 0;
  gs.duoOpponentNotified = false;
  await import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeCloseDuoResult }) => bridgeCloseDuoResult())
    .catch(() => {});
  await import('../../react/duoreview/duoReviewBridge')
    .then(({ bridgeCloseDuoReview }) => bridgeCloseDuoReview())
    .catch(() => {});
  await import('./duoLobby').then((m) => m.closeDuoLobby()).catch(() => {});
  await import('./duoRoomView')
    .then((m) => m.openDuoRoomView())
    .catch((e) => console.warn('[duo] open rematch room failed:', e));
}

export async function requestDuoRematch(): Promise<void> {
  if (!getActiveDuoRoomId() || !gs.duoRole) {
    await closeDuoResult();
    return;
  }
  if (!isDuoWsEnabled()) {
    await closeDuoResult();
    return;
  }
  const { duoWsRematch } = await import('./duoSocket');
  duoWsRematch();
}

// ── Reset ────────────────────────────────────────────────────────────

export function resetDuoState(): void {
  void import('../../game/bgm').then(({ stopBgm }) => stopBgm());
  cancelLocalDuoCountdown();
  _duoResultShown = false;
  _duoFinishSubmitted = false;
  if (isDuoWsEnabled()) {
    void import('./duoSocket').then((m) => m.duoWsDisconnect());
    void import('./duoLobbyMirror').then((m) => m.unpublishWsLobbyRoom());
  }
  if (_duoResultRetryTimer) {
    clearTimeout(_duoResultRetryTimer);
    _duoResultRetryTimer = null;
  }
  _duoOpponentOfflineNotified = false;
  _oppStaleSince = 0;
  _prevDuoLead = null;
  _prevOppProgress = null;
  _autoForfeitStarted = false;
  _lastSubmittedProgress = -1;
  _localMoves = [];
  _gameStartedAtMs = 0;
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
  if (gs.duoUnsubscribe) {
    gs.duoUnsubscribe();
    gs.duoUnsubscribe = null;
  }
  stopDuoRoomHeartbeat();
  // Always reset chess clock state — resetChessClockState() is idempotent when not active.
  // Guarding on gs.isChessClockMode risks leaving the RAF alive if the flag was never set.
  import('./duoChessClock')
    .then((m) => m.resetChessClockState())
    .catch((e) => console.warn('[duo] resetChessClockState failed:', e));
  import('./duoSpectator')
    .then((m) => m.resetSpectatorState())
    .catch((e) => console.warn('[duo] resetSpectatorState failed:', e));
  import('./duoRoomView')
    .then((m) => m.closeDuoRoomView())
    .catch((e) => console.warn('[duo] closeDuoRoomView (reset) failed:', e));
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
  resetDuoProgressUI();
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.style.display = '';
  const quitBtn = document.getElementById('quit-btn');
  if (quitBtn) quitBtn.style.display = '';
  const levelTechHint = document.getElementById('level-tech-hint');
  if (levelTechHint) levelTechHint.style.display = '';
  const forfeitBtn = document.getElementById('duo-forfeit-btn');
  if (forfeitBtn) forfeitBtn.remove();
  const countdownOverlay = document.getElementById('duo-countdown-overlay');
  if (countdownOverlay) countdownOverlay.remove();
  clearActiveRoomId();
  invalidateWaitingRoomsCache();
  import('./duoLobby')
    .then((m) => m.refreshDuoLobbyRoom())
    .catch((e) => console.warn('[duo] refreshDuoLobbyRoom failed:', e));
}
