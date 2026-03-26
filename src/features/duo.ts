// Duo (2-player) mode — Firebase real-time room state for 2-player competition
// Extracted from legacyRuntime.ts

import { gs } from '../game/state';
import { SK, readJson, writeJson } from '../storage/keys';
import { formatSeconds } from '../game/utils';
import { getPlayerIdentity } from '../firebase/client';
import { showFeedback } from '../ui/feedback';

declare const firebase: any;

// ── Room Reference ───────────────────────────────────────────────────

export function duoRoomRef() {
  return gs.db.collection('duo_room').doc('current');
}

// ── Enter / Subscribe ────────────────────────────────────────────────

export async function enterDuoRoom(levelId: number): Promise<void> {
  if (!gs.firebaseReady) return;
  const { playerId, alias } = getPlayerIdentity();
  try {
    await gs.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(duoRoomRef());
      const d = doc.exists ? doc.data() : null;
      const now = firebase.firestore.FieldValue.serverTimestamp();

      // Check staleness (>2 min old waiting rooms can be overwritten)
      const isStale = d && d.updatedAt && d.updatedAt.toDate &&
        (Date.now() - d.updatedAt.toDate().getTime() > 120000);

      if (!d || d.status === 'idle' || d.status === 'finished' || isStale) {
        // Create new room as host
        tx.set(duoRoomRef(), {
          levelId, status: 'waiting',
          hostId: playerId, hostAlias: alias, hostReady: false,
          hostProgress: 0, hostFinishTime: null, hostStars: null,
          guestId: null, guestAlias: null, guestReady: false,
          guestProgress: 0, guestFinishTime: null, guestStars: null,
          startAt: null, updatedAt: now
        });
        gs.duoRole = 'host';
      } else if (d.status === 'waiting' && d.hostId !== playerId) {
        // Join as guest
        tx.update(duoRoomRef(), {
          guestId: playerId, guestAlias: alias,
          guestReady: false, guestProgress: 0,
          guestFinishTime: null, guestStars: null,
          updatedAt: now
        });
        gs.duoRole = 'guest';
      } else if (d.status === 'waiting' && d.hostId === playerId) {
        // Re-opening my own room, update timestamp
        tx.update(duoRoomRef(), { updatedAt: now, hostAlias: alias });
        gs.duoRole = 'host';
      } else {
        gs.duoRole = null;
      }
    });
    if (gs.duoRole) subscribeDuoRoom();
  } catch (e) {
    console.warn('enterDuoRoom failed:', e);
    gs.duoRole = null;
  }
}

export function subscribeDuoRoom(): void {
  if (gs.duoUnsubscribe) gs.duoUnsubscribe();
  gs.duoUnsubscribe = duoRoomRef().onSnapshot((snap: any) => {
    if (!snap.exists) { resetDuoState(); return; }
    gs.duoRoomData = snap.data();
    handleDuoSnapshot(gs.duoRoomData);
  }, (err: any) => {
    console.warn('duo snapshot error:', err);
  });
}

// ── Snapshot Handler ─────────────────────────────────────────────────

export function handleDuoSnapshot(d: any): void {
  if (!d || !gs.duoRole) return;
  const { playerId } = getPlayerIdentity();

  if (d.status === 'waiting' || d.status === 'countdown') {
    updateDuoPreLevelUI(d);
  }

  if (d.status === 'waiting') {
    gs.duoRoundLaunched = false;
    gs.duoCountdownStartMs = null;
  }

  if (d.status === 'countdown' && d.startAt) {
    startDuoCountdown(d.startAt);
  }

  if (d.status === 'playing') {
    gs.duoRoundLaunched = true;
    // Update opponent progress bar
    const oppProgress = gs.duoRole === 'host' ? d.guestProgress : d.hostProgress;
    const oppAlias = gs.duoRole === 'host' ? (d.guestAlias || '對手') : (d.hostAlias || '對手');
    updateDuoProgressUI(oppAlias, oppProgress || 0);

    // Handle emoji reactions
    handleDuoEmoji(d);

    // Check if opponent finished
    const oppFinish = gs.duoRole === 'host' ? d.guestFinishTime : d.hostFinishTime;
    const oppStars = gs.duoRole === 'host' ? d.guestStars : d.hostStars;
    if (oppFinish !== null && oppFinish !== undefined) {
      showDuoOpponentFinished(oppAlias, oppFinish, oppStars);
    }

    // Check if both finished
    if (d.hostFinishTime !== null && d.hostFinishTime !== undefined &&
      d.guestFinishTime !== null && d.guestFinishTime !== undefined) {
      showDuoResult(d);
    }
  }

  if (d.status === 'finished') {
    showDuoResult(d);
  }
}

// ── Pre-Level UI ─────────────────────────────────────────────────────

export function updateDuoPreLevelUI(d: any): void {
  const zone = document.getElementById('duo-ready-zone');
  const readyBtn = document.getElementById('duo-ready-btn');
  const countdownArea = document.getElementById('duo-countdown-area');
  if (!zone) return;

  zone.style.display = 'block';

  // Host slot
  document.getElementById('duo-host-alias')!.textContent = d.hostAlias || '--';
  const hostSlot = document.getElementById('duo-slot-host')!;
  const hostStatus = document.getElementById('duo-host-status')!;
  hostSlot.classList.toggle('ready', !!d.hostReady);
  hostStatus.textContent = d.hostReady ? '已準備' : '等待中';
  hostStatus.classList.toggle('is-ready', !!d.hostReady);

  // Guest slot
  const guestSlot = document.getElementById('duo-slot-guest')!;
  const guestAlias = document.getElementById('duo-guest-alias')!;
  const guestStatus = document.getElementById('duo-guest-status')!;
  if (d.guestId) {
    guestSlot.classList.remove('empty');
    guestAlias.textContent = d.guestAlias || '--';
    guestSlot.classList.toggle('ready', !!d.guestReady);
    guestStatus.textContent = d.guestReady ? '已準備' : '等待中';
    guestStatus.classList.toggle('is-ready', !!d.guestReady);
  } else {
    guestSlot.classList.add('empty');
    guestAlias.textContent = '等待加入...';
    guestStatus.textContent = '';
    guestStatus.classList.remove('is-ready');
  }

  // Show streak if present
  const preStreak = document.getElementById('duo-pre-streak');
  if (preStreak && d.guestId) {
    const rec = loadDuoRecords();
    if (rec.streak >= 2 && rec.streakHolder) {
      preStreak.innerHTML = `<div class="duo-streak-badge">\u{1F525} ${rec.streakHolder} 連勝 ${rec.streak} 場</div>`;
    } else {
      const wins = rec.wins || {};
      const names = Object.keys(wins);
      if (names.length >= 2) {
        const sorted = names.sort((a, b) => wins[b] - wins[a]);
        preStreak.innerHTML = `<div style="font-size:0.72rem;color:var(--text-light);margin-bottom:6px;">${sorted[0]} ${wins[sorted[0]]} 勝 — ${sorted[1]} ${wins[sorted[1]]} 勝</div>`;
      } else {
        preStreak.innerHTML = '';
      }
    }
  } else if (preStreak) {
    preStreak.innerHTML = '';
  }

  // Ready button state
  const myReady = gs.duoRole === 'host' ? d.hostReady : d.guestReady;
  if (d.status === 'countdown') {
    readyBtn!.style.display = 'none';
    countdownArea!.style.display = 'block';
  } else {
    readyBtn!.style.display = d.guestId ? 'inline-block' : 'none';
    countdownArea!.style.display = 'none';
    readyBtn!.textContent = myReady ? '\u2713 已準備' : '準備完成';
    readyBtn!.classList.toggle('is-ready', myReady);
  }
}

// ── Ready Toggle ─────────────────────────────────────────────────────

export async function toggleDuoReady(): Promise<void> {
  if (!gs.firebaseReady || !gs.duoRole) return;
  const { playerId } = getPlayerIdentity();
  const field = gs.duoRole === 'host' ? 'hostReady' : 'guestReady';
  gs.duoMyReady = !gs.duoMyReady;

  try {
    await gs.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(duoRoomRef());
      if (!doc.exists) return;
      const d = doc.data();
      const update: any = { [field]: gs.duoMyReady, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

      // Check if both will be ready after this update
      const hostReady = gs.duoRole === 'host' ? gs.duoMyReady : d.hostReady;
      const guestReady = gs.duoRole === 'guest' ? gs.duoMyReady : d.guestReady;
      if (hostReady && guestReady && d.guestId) {
        // Both ready! Set countdown start
        update.status = 'countdown';
        // startAt = now + 4 seconds (3s visible countdown + 1s buffer)
        update.startAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 4000);
      }
      tx.update(duoRoomRef(), update);
    });
  } catch (e) {
    console.warn('toggleDuoReady failed:', e);
    gs.duoMyReady = !gs.duoMyReady; // revert
  }
}

// ── Countdown ────────────────────────────────────────────────────────

export function startDuoCountdown(startAtTs: any): void {
  if (gs.duoRoundLaunched) return;
  const area = document.getElementById('duo-countdown-area');
  if (!area) return;

  const targetMs = startAtTs.toMillis ? startAtTs.toMillis() : startAtTs.seconds * 1000;
  if (gs.duoCountdownTimer && gs.duoCountdownStartMs === targetMs) return; // same countdown instance
  if (gs.duoCountdownTimer && gs.duoCountdownStartMs !== targetMs) {
    clearInterval(gs.duoCountdownTimer);
    gs.duoCountdownTimer = null;
  }
  gs.duoCountdownStartMs = targetMs;
  let lastShown: number | null = null;

  gs.duoCountdownTimer = setInterval(() => {
    const remaining = Math.ceil((targetMs - Date.now()) / 1000);
    if (remaining > 0) {
      if (remaining !== lastShown) {
        area.innerHTML = `<div class="duo-countdown-display">${remaining}</div>`;
        lastShown = remaining;
      }
    } else {
      clearInterval(gs.duoCountdownTimer!);
      gs.duoCountdownTimer = null;
      if (gs.duoRoundLaunched) return;
      gs.duoRoundLaunched = true;
      area.innerHTML = `<div class="duo-countdown-display">GO!</div>`;
      setTimeout(() => launchDuoGame(), 300);
    }
  }, 100);
}

// ── Launch Game ──────────────────────────────────────────────────────

export async function launchDuoGame(): Promise<void> {
  if (!gs.duoRoomData) return;
  gs.isDuoMode = true;

  // Calculate total cells to fill
  const { getAllLevels } = await import('../data/dataRegistry');
  const levels = getAllLevels();
  const level = levels.find(l => l.id === gs.duoRoomData.levelId);
  if (level) {
    gs.duoTotalToFill = level.puzzle.filter((v: number) => v === 0).length;
  }

  // Hide pre-level modal, start game
  const { hidePreLevelModal } = await import('../features/levels');
  hidePreLevelModal();
  document.getElementById('level-screen')!.style.display = 'none';
  const { initGame } = await import('../game/core');
  initGame(gs.duoRoomData.levelId, true, false, null);

  // Show duo progress bar and emoji bar
  document.getElementById('duo-progress-container')!.style.display = 'flex';
  document.getElementById('duo-emoji-bar')!.style.display = 'flex';

  // Update room status to playing
  if (gs.duoRole === 'host') {
    duoRoomRef().update({
      status: 'playing',
      hostProgress: 0, guestProgress: 0,
      hostFinishTime: null, guestFinishTime: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
}

// ── Progress ─────────────────────────────────────────────────────────

export function updateDuoProgress(): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoProgressThrottle < 3000) return; // throttle to every 3s
  gs.duoProgressThrottle = now;
  const filled = gs.cellsData.filter(c => !c.fixed && c.value !== 0).length;
  const field = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  duoRoomRef().update({
    [field]: filled,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

export function updateDuoProgressUI(oppAlias: string, oppProgress: number): void {
  const el = document.getElementById('duo-progress-text');
  const fill = document.getElementById('duo-progress-fill');
  if (!el || !fill) return;
  const pct = gs.duoTotalToFill > 0 ? Math.min(100, Math.round(oppProgress / gs.duoTotalToFill * 100)) : 0;
  el.textContent = `\u{1F495} ${oppAlias}: ${oppProgress}/${gs.duoTotalToFill}`;
  fill.style.width = `${pct}%`;
}

// ── Opponent Finished Notification ───────────────────────────────────

export function showDuoOpponentFinished(alias: string, timeSec: number, stars: number | null): void {
  if (gs.duoOpponentNotified) return;
  gs.duoOpponentNotified = true;
  const starsStr = stars ? ' ' + '\u2605'.repeat(stars) : '';
  showFeedback(`${alias} 已完成！${formatSeconds(timeSec)}${starsStr}`, 'success');
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
}

// ── Submit Finish ────────────────────────────────────────────────────

export async function submitDuoFinish(timeSec: number, stars: number): Promise<void> {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const timeField = gs.duoRole === 'host' ? 'hostFinishTime' : 'guestFinishTime';
  const starsField = gs.duoRole === 'host' ? 'hostStars' : 'guestStars';
  const progressField = gs.duoRole === 'host' ? 'hostProgress' : 'guestProgress';
  try {
    await duoRoomRef().update({
      [timeField]: timeSec,
      [starsField]: stars,
      [progressField]: gs.duoTotalToFill,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('submitDuoFinish failed:', e); }
}

// ── Result Modal ─────────────────────────────────────────────────────

export function showDuoResult(d: any): void {
  const modal = document.getElementById('duo-result-modal');
  const cardsEl = document.getElementById('duo-result-cards');
  const diffEl = document.getElementById('duo-result-diff');
  const streakEl = document.getElementById('duo-result-streak');
  const recordEl = document.getElementById('duo-result-record');
  if (!modal || !cardsEl || modal.style.display === 'flex') return;

  const hTime = d.hostFinishTime;
  const gTime = d.guestFinishTime;
  if (hTime === null || hTime === undefined || gTime === null || gTime === undefined) return;

  const hWin = hTime < gTime;
  const gWin = gTime < hTime;
  const isDraw = hTime === gTime;
  const diff = Math.abs(hTime - gTime);

  // Record win/draw
  let rec: any;
  if (isDraw) {
    rec = recordDuoDraw();
  } else {
    const winner = hWin ? d.hostAlias : d.guestAlias;
    const loser = hWin ? d.guestAlias : d.hostAlias;
    rec = recordDuoWin(winner, loser);
  }

  // Streak badge
  if (rec.streak >= 2 && rec.streakHolder) {
    streakEl!.innerHTML = `<div class="duo-streak-badge">\u{1F525} ${rec.streakHolder} 連勝 ${rec.streak} 場！</div>`;
  } else {
    streakEl!.innerHTML = '';
  }

  function makeCard(alias: string, time: number, stars: number | null, isWinner: boolean): string {
    return `<div class="duo-result-card ${isWinner ? 'winner' : ''}">
                    <div class="duo-result-crown">${isWinner ? '\u{1F451}' : ''}</div>
                    <div class="duo-result-alias">${alias || '--'}</div>
                    <div class="duo-result-time">${formatSeconds(time)}</div>
                    <div class="duo-result-stars">${stars ? '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars) : ''}</div>
                </div>`;
  }

  cardsEl.innerHTML =
    makeCard(d.hostAlias, hTime, d.hostStars, hWin) +
    makeCard(d.guestAlias, gTime, d.guestStars, gWin);

  if (isDraw) {
    diffEl!.textContent = '平手！心有靈犀 \u{1F495}';
  } else {
    const winnerAlias = hWin ? d.hostAlias : d.guestAlias;
    diffEl!.textContent = `${winnerAlias} 快了 ${formatSeconds(diff)}`;
  }

  // Lifetime record
  const wins = rec.wins || {};
  const names = Object.keys(wins);
  if (names.length >= 2) {
    const sorted = names.sort((a: string, b: string) => wins[b] - wins[a]);
    recordEl!.innerHTML = `歷史戰績：<span>${sorted[0]} ${wins[sorted[0]]}</span> 勝 — <span>${sorted[1]} ${wins[sorted[1]]}</span> 勝`;
  } else if (names.length === 1) {
    recordEl!.innerHTML = `歷史戰績：<span>${names[0]} ${wins[names[0]]}</span> 勝`;
  } else {
    recordEl!.innerHTML = '';
  }

  // Hide emoji bar
  document.getElementById('duo-emoji-bar')!.style.display = 'none';

  modal.style.display = 'flex';
}

// ── Duo Records & Streaks ────────────────────────────────────────────

export function loadDuoRecords(): any {
  return readJson(SK.DUO_RECORDS, { wins: {}, streak: 0, streakHolder: '' });
}

export function saveDuoRecords(data: any): void {
  writeJson(SK.DUO_RECORDS, data);
}

export function recordDuoWin(winnerAlias: string, loserAlias: string): any {
  const rec = loadDuoRecords();
  if (!rec.wins) rec.wins = {};
  rec.wins[winnerAlias] = (rec.wins[winnerAlias] || 0) + 1;
  if (!rec.wins[loserAlias]) rec.wins[loserAlias] = 0;
  // Update streak
  if (rec.streakHolder === winnerAlias) {
    rec.streak = (rec.streak || 0) + 1;
  } else {
    rec.streakHolder = winnerAlias;
    rec.streak = 1;
  }
  saveDuoRecords(rec);
  return rec;
}

export function recordDuoDraw(): any {
  const rec = loadDuoRecords();
  rec.streak = 0;
  rec.streakHolder = '';
  saveDuoRecords(rec);
  return rec;
}

// ── Duo Emoji Reactions ──────────────────────────────────────────────

export function sendDuoEmoji(emoji: string): void {
  if (!gs.isDuoMode || !gs.firebaseReady) return;
  const now = Date.now();
  if (now - gs.duoEmojiCooldown < 1500) return; // cooldown 1.5s
  gs.duoEmojiCooldown = now;
  const field = gs.duoRole === 'host' ? 'hostEmoji' : 'guestEmoji';
  const tsField = gs.duoRole === 'host' ? 'hostEmojiTs' : 'guestEmojiTs';
  duoRoomRef().update({
    [field]: emoji,
    [tsField]: Date.now()
  }).catch(() => {});
  // Show own emoji as confirmation
  spawnEmojiFloat(emoji, true);
}

export function handleDuoEmoji(d: any): void {
  if (!gs.isDuoMode) return;
  const emojiField = gs.duoRole === 'host' ? 'guestEmoji' : 'hostEmoji';
  const tsField = gs.duoRole === 'host' ? 'guestEmojiTs' : 'hostEmojiTs';
  const emoji = d[emojiField];
  const ts = d[tsField];
  if (!emoji || !ts) return;
  const key = `${emoji}_${ts}`;
  if (key === gs.duoLastEmojiSeen) return;
  gs.duoLastEmojiSeen = key;
  spawnEmojiFloat(emoji, false);
}

export function spawnEmojiFloat(emoji: string, isSelf: boolean): void {
  const el = document.createElement('div');
  el.className = 'duo-emoji-float';
  el.textContent = emoji;
  // Self: rises from bottom-center, opponent: rises from top-center
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

// ── Close / Leave / Reset ────────────────────────────────────────────

export async function closeDuoResult(): Promise<void> {
  document.getElementById('duo-result-modal')!.style.display = 'none';
  // Mark room finished
  if (gs.firebaseReady) {
    duoRoomRef().update({ status: 'finished' }).catch(() => {});
  }
  resetDuoState();
  const { showLevelScreen } = await import('../features/levels');
  showLevelScreen(true);
}

export async function leaveDuoRoom(): Promise<void> {
  if (!gs.firebaseReady || !gs.duoRole) { resetDuoState(); return; }
  try {
    if (gs.duoRole === 'host') {
      await duoRoomRef().update({ status: 'idle' });
    } else {
      await duoRoomRef().update({
        guestId: null, guestAlias: null, guestReady: false,
        guestProgress: 0, guestFinishTime: null, guestStars: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (_) {}
  resetDuoState();
}

export function resetDuoState(): void {
  gs.isDuoMode = false;
  gs.duoRole = null;
  gs.duoRoomData = null;
  gs.duoMyReady = false;
  gs.duoRoundLaunched = false;
  gs.duoCountdownStartMs = null;
  gs.duoOpponentNotified = false;
  gs.duoProgressThrottle = 0;
  if (gs.duoCountdownTimer) { clearInterval(gs.duoCountdownTimer); gs.duoCountdownTimer = null; }
  if (gs.duoUnsubscribe) { gs.duoUnsubscribe(); gs.duoUnsubscribe = null; }
  const readyZone = document.getElementById('duo-ready-zone');
  if (readyZone) readyZone.style.display = 'none';
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
  const emojiBar = document.getElementById('duo-emoji-bar');
  if (emojiBar) emojiBar.style.display = 'none';
  gs.duoLastEmojiSeen = '';
}

// ── Passive Glow Listener ────────────────────────────────────────────

export function startDuoGlowListener(): void {
  if (!gs.firebaseReady) return;
  if (gs.duoGlowUnsubscribe) gs.duoGlowUnsubscribe();
  gs.duoGlowUnsubscribe = duoRoomRef().onSnapshot(async (snap: any) => {
    // Remove old glow
    document.querySelectorAll('.level-item.duo-glow').forEach(el => el.classList.remove('duo-glow'));
    document.querySelectorAll('.stage-node.duo-waiting').forEach(el => el.classList.remove('duo-waiting'));
    if (!snap.exists) return;
    const d = snap.data();
    if (d.status !== 'waiting' || !d.levelId) return;
    const { playerId } = getPlayerIdentity();
    if (d.hostId === playerId) return; // Don't glow my own room

    const { getAllLevels } = await import('../data/dataRegistry');
    const levels = getAllLevels();
    const { getDifficultyTiers, getFilteredLevels } = await import('../features/levels');

    // Mark the stage node for the waiting level's tier
    const waitingLevel = levels.find(l => l.id === d.levelId);
    if (waitingLevel) {
      const stageNodes = document.querySelectorAll('.stage-node');
      const tiers = getDifficultyTiers();
      tiers.forEach((tierName: string, i: number) => {
        if (tierName === waitingLevel.difficultyName && stageNodes[i]) {
          stageNodes[i].classList.add('duo-waiting');
        }
      });
    }

    // Find the matching level card and make it glow
    const items = document.querySelectorAll('#level-list .level-item');
    const filtered = getFilteredLevels().filter((l: any) => !l.hidden);
    filtered.forEach((l: any, i: number) => {
      if (l.id === d.levelId && items[i]) {
        items[i].classList.add('duo-glow');
      }
    });
  }, () => {});
}
