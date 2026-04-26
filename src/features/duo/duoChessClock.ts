// src/features/duo/duoChessClock.ts
// Chess Clock 模式完整邏輯

import { gs, type DuoRoomData } from '../../game/state';
import { duoRoomRef } from './duoRoom';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';
import { firebaseServerTimestamp } from '../../firebase/runtime';
import type { FirestoreTransaction } from '../../firebase/types';

// ── Module-level state ───────────────────────────────────────────────

let _rafHandle: number | null = null;
let _chessClockActive = false;
let _finishSubmitted = false;
let _resultShown = false;

// ── Helper: format milliseconds as m:ss.t ────────────────────────────

function fmtMs(ms: number): string {
  const total = Math.floor(ms / 100);
  const tenths = total % 10;
  const sec = Math.floor(total / 10);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

// ── Helper: format milliseconds as m:ss.mmm for result screen ────────

function fmtResult(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const ms3 = Math.round(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

// ── 函式一：launchChessClockGame ─────────────────────────────────────

export async function launchChessClockGame(): Promise<void> {
  gs.isChessClockMode = true;
  gs.maxErrors = 999;
  _resultShown = false;

  const initialBoard = gs.cellsData.map((c) => c.value);

  const firstTurn: 'host' | 'guest' = gs.duoRoomData!.puzzleSeed % 2 === 0 ? 'host' : 'guest';
  gs.ccIsMyTurn = gs.duoRole === firstTurn;
  gs.ccTurnStartMs = Date.now();
  _chessClockActive = true;
  _finishSubmitted = false;

  // 只有 host 寫入初始 Firestore 狀態
  if (gs.duoRole === 'host') {
    try {
      await gs.db!.runTransaction(async (tx: FirestoreTransaction) => {
        const doc = await tx.get(duoRoomRef());
        if (!doc.exists) return;
        const d = doc.data() as unknown as DuoRoomData;
        // 避免重複初始化
        if (d.ccBoardVersion != null && d.ccBoardVersion !== 0) return;
        tx.update(duoRoomRef(), {
          ccActiveTurn: firstTurn,
          ccTurnStartedAt: firebaseServerTimestamp(),
          ccHostAccumMs: 0,
          ccGuestAccumMs: 0,
          ccCurrentCellErrors: 0,
          ccCurrentCellIdx: null,
          ccBoardState: JSON.stringify(initialBoard),
          ccBoardVersion: 1,
          ccHostTotalMs: null,
          ccGuestTotalMs: null,
        });
      });
    } catch (e) {
      console.warn('[chessClock] launchChessClockGame transaction failed:', e);
    }
  }

  startChessClockUI();
  renderTurnBanner();

  // Chess clock 不用傳統愛心計命（maxErrors=999 會渲染 999 個♥）和進度百分比
  const livesEl = document.getElementById('lives');
  if (livesEl) livesEl.style.display = 'none';
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
}

// ── 函式二：handleChessClockSnapshot ────────────────────────────────

export function handleChessClockSnapshot(d: DuoRoomData): void {
  // 雙方都完成 → 顯示結算
  if (d.ccHostTotalMs != null && d.ccGuestTotalMs != null) {
    if (!_resultShown) showChessClockResult(d);
    return;
  }

  // 尚未初始化（ccActiveTurn 為 null）→ 跳過，避免競爭覆寫 launchChessClockGame 設定的值
  if (!d.ccActiveTurn) return;

  // 同步累積時間到本地
  if (gs.duoRole === 'host') {
    gs.ccMyAccumMs = d.ccHostAccumMs ?? 0;
    gs.ccOppAccumMs = d.ccGuestAccumMs ?? 0;
  } else {
    gs.ccMyAccumMs = d.ccGuestAccumMs ?? 0;
    gs.ccOppAccumMs = d.ccHostAccumMs ?? 0;
  }

  // 同步回合狀態
  const wasMyTurn = gs.ccIsMyTurn;
  gs.ccIsMyTurn = d.ccActiveTurn === gs.duoRole;
  gs.ccCurrentCellErrors = d.ccCurrentCellErrors ?? 0;
  gs.ccBoardVersion = d.ccBoardVersion ?? 0;

  // 回合切換
  if (wasMyTurn !== gs.ccIsMyTurn) {
    gs.ccTurnStartMs = Date.now();
    renderTurnBanner();
  }

  // 同步盤面（對方剛填格時同步 — 用 wasMyTurn 而非 ccIsMyTurn，
  // 因為對方填完後 ccActiveTurn 會切換回我這邊，此時 ccIsMyTurn 已變成 true）
  if (!wasMyTurn && d.ccBoardState) {
    applyBoardState(d.ccBoardState);
  }
}

// ── 函式三：onChessClockCorrect ──────────────────────────────────────

export function onChessClockCorrect(_cellIdx: number): void {
  if (!_chessClockActive) return;

  const deltaMs = Date.now() - gs.ccTurnStartMs;
  const newMyAccum = gs.ccMyAccumMs + deltaMs;
  const newBoard = gs.cellsData.map((c) => c.value);
  const isComplete = newBoard.every((v) => v !== 0);
  const myAccumField = gs.duoRole === 'host' ? 'ccHostAccumMs' : 'ccGuestAccumMs';
  const oppRole: 'host' | 'guest' = gs.duoRole === 'host' ? 'guest' : 'host';

  const updateData: Record<string, unknown> = {
    ccBoardState: JSON.stringify(newBoard),
    ccBoardVersion: gs.ccBoardVersion + 1,
    ccActiveTurn: oppRole,
    ccTurnStartedAt: firebaseServerTimestamp(),
    [myAccumField]: newMyAccum,
    ccCurrentCellErrors: 0,
    ccCurrentCellIdx: null,
    updatedAt: firebaseServerTimestamp(),
  };

  // 填完時寫入最終結算時間
  if (isComplete && !_finishSubmitted) {
    _finishSubmitted = true;
    updateData['ccHostTotalMs'] = gs.duoRole === 'host' ? newMyAccum : gs.ccOppAccumMs;
    updateData['ccGuestTotalMs'] = gs.duoRole === 'host' ? gs.ccOppAccumMs : newMyAccum;
  }

  duoRoomRef()
    .update(updateData)
    .catch((e) => console.warn('[chessClock] onChessClockCorrect update failed:', e));

  // 本地立即更新，不等 snapshot
  gs.ccMyAccumMs = newMyAccum;
  gs.ccBoardVersion += 1;
}

// ── 函式四：onChessClockError ────────────────────────────────────────

export function onChessClockError(_cellIdx: number): void {
  if (!_chessClockActive) return;

  gs.ccCurrentCellErrors++;

  if (gs.ccCurrentCellErrors >= 3) {
    showFeedback(t('duo.chessClock.forcedSwitch'), 'error');

    const deltaMs = Date.now() - gs.ccTurnStartMs;
    const myAccumField = gs.duoRole === 'host' ? 'ccHostAccumMs' : 'ccGuestAccumMs';
    const oppRole: 'host' | 'guest' = gs.duoRole === 'host' ? 'guest' : 'host';

    duoRoomRef()
      .update({
        ccActiveTurn: oppRole,
        ccTurnStartedAt: firebaseServerTimestamp(),
        [myAccumField]: gs.ccMyAccumMs + deltaMs,
        ccCurrentCellErrors: 0,
        ccCurrentCellIdx: null,
        updatedAt: firebaseServerTimestamp(),
      })
      .catch((e) => console.warn('[chessClock] forcedSwitch update failed:', e));

    gs.ccIsMyTurn = false;
    gs.ccMyAccumMs += deltaMs;
    gs.ccCurrentCellErrors = 0;
    renderTurnBanner();
  } else {
    duoRoomRef()
      .update({ ccCurrentCellErrors: gs.ccCurrentCellErrors })
      .catch((e) => console.warn('[chessClock] cellErrors update failed:', e));
  }
}

// ── 函式五：startChessClockUI ────────────────────────────────────────

function startChessClockUI(): void {
  // 清除既有的
  document.getElementById('cc-clock-bar')?.remove();

  const bar = document.createElement('div');
  bar.id = 'cc-clock-bar';

  // inline styles
  bar.style.cssText = [
    'display:flex',
    'justify-content:space-between',
    'align-items:center',
    'padding:8px 16px',
    'background:rgba(0,0,0,0.05)',
    'border-radius:8px',
    'margin-bottom:8px',
  ].join(';');

  bar.innerHTML = `
    <div id="cc-clock-me" class="cc-clock" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span class="cc-clock-label" style="font-size:12px;opacity:0.6">你</span>
      <span class="cc-clock-time" id="cc-time-me" style="font-size:20px;font-weight:bold;font-family:monospace">0:00.0</span>
    </div>
    <div id="cc-turn-banner" style="font-size:13px;opacity:0.7;align-self:center"></div>
    <div id="cc-clock-opp" class="cc-clock" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span class="cc-clock-label" style="font-size:12px;opacity:0.6">對手</span>
      <span class="cc-clock-time" id="cc-time-opp" style="font-size:20px;font-weight:bold;font-family:monospace">0:00.0</span>
    </div>
  `;

  // 注入 active class 的 style
  if (!document.getElementById('cc-clock-style')) {
    const style = document.createElement('style');
    style.id = 'cc-clock-style';
    style.textContent = `.cc-clock.active .cc-clock-time { color: var(--color-primary, #4a9eff); }`;
    document.head.appendChild(style);
  }

  // 插入到 duo-progress-container 之前，若找不到則插入到 .game-container 第一個子元素之前
  const progressContainer = document.getElementById('duo-progress-container');
  if (progressContainer && progressContainer.parentNode) {
    progressContainer.parentNode.insertBefore(bar, progressContainer);
  } else {
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer && gameContainer.firstChild) {
      gameContainer.insertBefore(bar, gameContainer.firstChild);
    } else if (gameContainer) {
      gameContainer.appendChild(bar);
    }
  }

  // 啟動 RAF loop
  _rafHandle = requestAnimationFrame(tickChessClockDisplay);
}

// ── 函式六：tickChessClockDisplay ───────────────────────────────────

function tickChessClockDisplay(): void {
  if (!_chessClockActive) return;

  const elapsed = gs.ccIsMyTurn ? Date.now() - gs.ccTurnStartMs : 0;
  const myMs = gs.ccMyAccumMs + elapsed;
  const oppMs = gs.ccOppAccumMs;

  const meEl = document.getElementById('cc-time-me');
  const oppEl = document.getElementById('cc-time-opp');
  if (meEl) meEl.textContent = fmtMs(myMs);
  if (oppEl) oppEl.textContent = fmtMs(oppMs);

  document.getElementById('cc-clock-me')?.classList.toggle('active', gs.ccIsMyTurn);
  document.getElementById('cc-clock-opp')?.classList.toggle('active', !gs.ccIsMyTurn);

  _rafHandle = requestAnimationFrame(tickChessClockDisplay);
}

// ── 函式七：renderTurnBanner ─────────────────────────────────────────

function renderTurnBanner(): void {
  const banner = document.getElementById('cc-turn-banner');
  if (!banner) return;
  banner.textContent = gs.ccIsMyTurn ? t('duo.chessClock.yourTurn') : t('duo.chessClock.oppTurn');
}

// ── 函式八：applyBoardState ──────────────────────────────────────────

function applyBoardState(boardStateJson: string): void {
  let board: number[];
  try {
    board = JSON.parse(boardStateJson) as number[];
  } catch {
    return;
  }

  for (let i = 0; i < 81; i++) {
    if (gs.cellsData[i].fixed) continue;
    if (board[i] !== 0 && gs.cellsData[i].value === 0) {
      gs.cellsData[i].value = board[i];
      gs.cellsData[i].notes = [];
      const cellEl = gs.gridEl?.children[i] as HTMLElement | undefined;
      if (cellEl) {
        // 直接操作 DOM，避免引入 board.ts 的副作用
        cellEl.textContent = String(board[i]);
        cellEl.classList.remove('error', 'wrong-preview');
        cellEl.classList.add('filled');
      }
    }
  }
}

// ── 函式九：showChessClockResult ─────────────────────────────────────

function showChessClockResult(d: DuoRoomData): void {
  if (_resultShown) return;
  _resultShown = true;

  stopChessClockUI();

  const hMs = d.ccHostTotalMs ?? 0;
  const gMs = d.ccGuestTotalMs ?? 0;
  const iAmHost = gs.duoRole === 'host';
  const myMs = iAmHost ? hMs : gMs;
  const oppMs = iAmHost ? gMs : hMs;
  const iWin = myMs < oppMs;
  const isDraw = myMs === oppMs;
  const diffMs = Math.abs(myMs - oppMs);

  const contentHtml = `
    <div class="cc-result">
      <div class="cc-result-winner">${iWin ? t('duo.chessClock.resultWin') : isDraw ? '' : t('duo.chessClock.resultLoss')}</div>
      <div class="cc-result-times">
        <div>你：${fmtResult(myMs)}</div>
        <div>對手：${fmtResult(oppMs)}</div>
      </div>
      <div class="cc-result-diff">${t('duo.chessClock.resultDiff')}：${fmtResult(diffMs)}</div>
    </div>
  `;

  import('../../react/duoresult/duoResultBridge')
    .then(({ bridgeOpenDuoResult }) => {
      bridgeOpenDuoResult({
        contentHtml,
        iWon: iWin,
        isDraw,
        levelId: d.levelId ?? null,
      });
    })
    .catch((e) => console.warn('[chessClock] bridgeOpenDuoResult failed:', e));
}

// ── 函式十：stopChessClockUI ─────────────────────────────────────────

export function stopChessClockUI(): void {
  _chessClockActive = false;
  if (_rafHandle !== null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
  document.getElementById('cc-clock-bar')?.remove();
  document.getElementById('cc-clock-style')?.remove();
  const livesEl = document.getElementById('lives');
  if (livesEl) livesEl.style.display = '';
}

// ── 函式十一：resetChessClockState ───────────────────────────────────

export function resetChessClockState(): void {
  stopChessClockUI();
  _finishSubmitted = false;
  _resultShown = false;
  gs.isChessClockMode = false;
  gs.ccIsMyTurn = false;
  gs.ccMyAccumMs = 0;
  gs.ccOppAccumMs = 0;
  gs.ccTurnStartMs = 0;
  gs.ccCurrentCellErrors = 0;
  gs.ccBoardVersion = 0;
}
