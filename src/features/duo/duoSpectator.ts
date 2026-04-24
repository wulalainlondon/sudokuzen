// src/features/duo/duoSpectator.ts
// 觀戰模式 + 表情轟炸邏輯

import { gs, type DuoRoomData } from '../../game/state';
import { duoRoomRef, getActiveDuoRoomId } from './duoRoom';
import { firebaseServerTimestamp, callDuoFunction } from '../../firebase/runtime';
import { updateCellDisplay } from '../../game/board';

// ── Module-level state ───────────────────────────────────────────────

let _spectatorActive = false;   // 我正在觀戰（我已完成，對手還在）
let _beingWatched = false;      // 我還在玩，對手已完成在看我
let _bombUsed = false;          // 本局炸彈已用過
let _lastSpecBoardVersion = -1; // 上次渲染的版本
let _syncRafHandle: number | null = null;
let _specVersion = 0;           // syncSpecBoardNow 版本計數器
let _lastBombAt = 0;            // 上次見到的 specBombAt
let _lastSyncMs = 0;            // 節流：上次 sync 的時間戳
let _settlementShown = false;   // 樂觀 UI：對手剩 0 格時的過渡提示

// ── Overlay CSS ──────────────────────────────────────────────────────

const SPEC_STYLE_CSS = `
#duo-spec-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: var(--bg, #fff);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: env(safe-area-inset-top, 12px) 16px env(safe-area-inset-bottom, 12px);
}
.spec-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  opacity: 0.7;
}
.spec-remaining {
  font-weight: 700;
}
#spec-remaining-count.pulse {
  color: var(--color-error, #e53);
  animation: specHeartbeat 0.6s ease-in-out infinite;
}
@keyframes specHeartbeat {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.25); }
}
.spec-grid {
  pointer-events: none;
  opacity: 1;
}
.spec-cell-new {
  animation: specCellFlash 0.4s ease-out;
}
@keyframes specCellFlash {
  0% { background: rgba(var(--duo-accent-rgb, 74,158,255), 0.4); }
  100% { background: transparent; }
}
.spec-bombed {
  position: relative;
}
.spec-bombed::after {
  content: '?';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-error, #e53);
  color: #fff;
  font-weight: 900;
  font-size: 1.2em;
  border-radius: 4px;
  z-index: 2;
}
#duo-spec-settlement {
  margin-top: 12px;
  padding: 10px 20px;
  background: var(--duo-accent, #4a9eff);
  color: #fff;
  border-radius: 24px;
  font-weight: 600;
  font-size: 15px;
  animation: settlementPulse 1.4s ease-in-out infinite;
}
@keyframes settlementPulse {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.04); }
}
#duo-being-watched-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  z-index: 10;
  pointer-events: none;
  animation: eyePulse 2s ease-in-out infinite;
}
@keyframes eyePulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
`;

// ── 函式一：enterSpectatorMode ───────────────────────────────────────

export function enterSpectatorMode(roomData: DuoRoomData): void {
  if (_spectatorActive) return;
  _spectatorActive = true;

  // Inject style if not already present
  if (!document.getElementById('duo-spec-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'duo-spec-style';
    styleEl.textContent = SPEC_STYLE_CSS;
    document.head.appendChild(styleEl);
  }

  // Remove existing overlay if any
  const existing = document.getElementById('duo-spec-overlay');
  if (existing) existing.remove();

  // Build overlay
  const overlay = document.createElement('div');
  overlay.id = 'duo-spec-overlay';

  // Header
  const header = document.createElement('div');
  header.className = 'spec-header';

  const watchingLabel = document.createElement('div');
  watchingLabel.className = 'spec-watching-label';
  watchingLabel.textContent = '👁 觀戰中';

  const oppNameEl = document.createElement('div');
  oppNameEl.id = 'spec-opponent-name';
  const oppAlias = (gs.duoRole === 'host' ? roomData.guestAlias : roomData.hostAlias) ?? '';
  oppNameEl.textContent = oppAlias;

  const remainingEl = document.createElement('div');
  remainingEl.id = 'spec-remaining';
  remainingEl.className = 'spec-remaining';
  remainingEl.innerHTML = '剩 <span id="spec-remaining-count">?</span> 格';

  header.appendChild(watchingLabel);
  header.appendChild(oppNameEl);
  header.appendChild(remainingEl);
  overlay.appendChild(header);

  // Spec grid container
  const gridContainer = document.createElement('div');
  gridContainer.id = 'duo-spec-grid';
  overlay.appendChild(gridContainer);
  document.body.appendChild(overlay);

  // Build the grid
  buildSpecGrid(roomData.specBoardState ?? null);

  // If specBoardState already has data, render it
  if (roomData.specBoardState) {
    applySpecBoard(roomData.specBoardState);
  }
}

// ── 函式二：exitSpectatorMode ────────────────────────────────────────

export function exitSpectatorMode(): void {
  _spectatorActive = false;
  const overlay = document.getElementById('duo-spec-overlay');
  if (overlay) overlay.remove();
  const styleEl = document.getElementById('duo-spec-style');
  if (styleEl) styleEl.remove();
}

// ── 函式三：startBeingWatched ────────────────────────────────────────

export function startBeingWatched(): void {
  if (_beingWatched) return;
  _beingWatched = true;

  // Remove existing badge if any
  const existing = document.getElementById('duo-being-watched-badge');
  if (existing) existing.remove();

  // Find grid and its parent
  const gridEl = document.getElementById('grid');
  if (gridEl && gridEl.parentElement) {
    // Make parent relative if not already positioned
    const parent = gridEl.parentElement;
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    const badge = document.createElement('div');
    badge.id = 'duo-being-watched-badge';
    badge.textContent = '👁';
    parent.appendChild(badge);
  }

  // Immediately sync board
  syncSpecBoardNow();
}

// ── 函式四：stopBeingWatched ─────────────────────────────────────────

export function stopBeingWatched(): void {
  _beingWatched = false;
  const badge = document.getElementById('duo-being-watched-badge');
  if (badge) badge.remove();
}

// ── 函式五：handleSpectatorSnapshot ─────────────────────────────────

export function handleSpectatorSnapshot(d: DuoRoomData): void {
  if (!_spectatorActive) return;

  // Deduplicate by version
  if (
    d.specBoardVersion != null &&
    d.specBoardVersion === _lastSpecBoardVersion
  ) {
    return;
  }
  _lastSpecBoardVersion = d.specBoardVersion ?? -1;

  if (d.specBoardState) {
    applySpecBoard(d.specBoardState);

    // Update remaining count
    try {
      const board = JSON.parse(d.specBoardState) as number[];
      const puzzle = gs.currentLevel?.puzzle ?? [];
      const actualRemaining = board.filter((v, i) => v === 0 && puzzle[i] === 0).length;
      const countEl = document.getElementById('spec-remaining-count');
      if (countEl) {
        countEl.textContent = String(actualRemaining);
        if (actualRemaining <= 9) {
          countEl.classList.add('pulse');
        } else {
          countEl.classList.remove('pulse');
        }
      }

      // 樂觀 UI：對手剩 0 格 → 立即顯示「正在結算…」，不等 finishTime snapshot
      if (actualRemaining === 0 && !_settlementShown) {
        _settlementShown = true;
        const overlay = document.getElementById('duo-spec-overlay');
        if (overlay && !document.getElementById('duo-spec-settlement')) {
          const el = document.createElement('div');
          el.id = 'duo-spec-settlement';
          el.textContent = '對手已完成，正在結算…';
          overlay.appendChild(el);
        }
      }
    } catch {
      // ignore parse errors
    }
  }
}

// ── 函式六：handleBombSnapshot ───────────────────────────────────────

export function handleBombSnapshot(d: DuoRoomData): void {
  if (!d.specBombAt) return;
  if (d.specBombAt <= _lastBombAt) return;
  _lastBombAt = d.specBombAt;

  const cells = d.specBombCells;
  if (!cells || cells.length === 0) return;

  // Ensure the spec-bombed CSS is available on the "being watched" side too
  if (!document.getElementById('duo-spec-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'duo-spec-style';
    styleEl.textContent = SPEC_STYLE_CSS;
    document.head.appendChild(styleEl);
  }

  const gridEl = document.getElementById('grid');
  if (!gridEl) return;

  const cellEls = gridEl.querySelectorAll<HTMLElement>('.cell');

  cells.forEach((idx) => {
    const cellEl = cellEls[idx];
    if (!cellEl) return;
    cellEl.classList.add('spec-bombed');
    setTimeout(() => {
      cellEl.classList.remove('spec-bombed');
      // Restore normal display
      const cellData = gs.cellsData[idx];
      if (cellData) {
        updateCellDisplay(cellEl, cellData);
      }
    }, 500);
  });
}

// ── 函式七：syncSpecBoardNow ─────────────────────────────────────────

export function syncSpecBoardNow(): void {
  if (!_beingWatched) return;

  // Throttle: at most once per 500ms
  const now = Date.now();
  if (now - _lastSyncMs < 500) return;
  _lastSyncMs = now;

  // Cancel pending RAF if any
  if (_syncRafHandle != null) {
    cancelAnimationFrame(_syncRafHandle);
    _syncRafHandle = null;
  }

  _syncRafHandle = requestAnimationFrame(() => {
    _syncRafHandle = null;
    if (!_beingWatched) return;

    const board = gs.cellsData.map((c) => c.value);
    _specVersion++;

    duoRoomRef()
      .update({
        specBoardState: JSON.stringify(board),
        specBoardVersion: _specVersion,
        updatedAt: firebaseServerTimestamp(),
      })
      .catch((e) => console.warn('[duo] syncSpecBoard failed:', e));
  });
}

// ── 函式八：throwBomb ────────────────────────────────────────────────

export function throwBomb(): void {
  if (_bombUsed) return;
  _bombUsed = true;

  // Disable bomb button
  const bombBtn = document.getElementById('spec-bomb-btn');
  if (bombBtn) {
    (bombBtn as HTMLButtonElement).disabled = true;
    (bombBtn as HTMLElement).style.opacity = '0.4';
  }

  // Read the current specBoardState to find empty non-fixed cells
  const lastBoard = _lastRenderedSpecBoard;
  const puzzle = gs.currentLevel?.puzzle ?? [];

  const emptyCells: number[] = [];
  if (lastBoard && lastBoard.length === 81) {
    for (let i = 0; i < 81; i++) {
      if (lastBoard[i] === 0 && puzzle[i] === 0) {
        emptyCells.push(i);
      }
    }
  }

  // Randomly pick up to 5
  const selected: number[] = [];
  const pool = [...emptyCells];
  while (selected.length < 5 && pool.length > 0) {
    const randIdx = Math.floor(Math.random() * pool.length);
    selected.push(pool[randIdx]);
    pool.splice(randIdx, 1);
  }

  if (selected.length === 0) return;

  callDuoFunction('duoThrowBomb', {
    roomId: getActiveDuoRoomId()!,
    selectedCells: selected,
  }).catch((e) => console.warn('[duo] throwBomb failed:', e));
}

// ── 函式九：applySpecBoard ───────────────────────────────────────────

// Track last rendered board to detect new fills and for bomb targeting
let _lastRenderedSpecBoard: number[] | null = null;

export function applySpecBoard(boardStateJson: string | null | undefined): void {
  if (!boardStateJson) return;

  let board: number[];
  try {
    board = JSON.parse(boardStateJson) as number[];
  } catch {
    return;
  }
  if (!Array.isArray(board) || board.length !== 81) return;

  const gridEl = document.getElementById('duo-spec-grid');
  if (!gridEl) return;

  const cellEls = gridEl.querySelectorAll<HTMLElement>('.cell');
  if (cellEls.length !== 81) return;

  const prevBoard = _lastRenderedSpecBoard;
  _lastRenderedSpecBoard = board;

  board.forEach((value, i) => {
    const cellEl = cellEls[i];
    if (!cellEl) return;

    // Skip fixed cells
    if (cellEl.classList.contains('is-fixed')) return;

    if (value !== 0) {
      cellEl.textContent = String(value);
      cellEl.classList.add('filled');

      // Flash if newly filled
      if (prevBoard == null || prevBoard[i] === 0) {
        cellEl.classList.remove('spec-cell-new');
        void cellEl.offsetWidth; // reflow
        cellEl.classList.add('spec-cell-new');
        setTimeout(() => cellEl.classList.remove('spec-cell-new'), 400);
      }
    } else {
      cellEl.textContent = '';
      cellEl.classList.remove('filled');
    }
  });
}

// ── 函式十：resetSpectatorState ──────────────────────────────────────

export function resetSpectatorState(): void {
  exitSpectatorMode();
  stopBeingWatched();
  _bombUsed = false;
  _spectatorActive = false;
  _beingWatched = false;
  _lastSpecBoardVersion = -1;
  _specVersion = 0;
  _lastBombAt = 0;
  _lastSyncMs = 0;
  _lastRenderedSpecBoard = null;
  _settlementShown = false;
  if (_syncRafHandle != null) {
    cancelAnimationFrame(_syncRafHandle);
    _syncRafHandle = null;
  }
}

// ── 函式十一：buildSpecGrid ──────────────────────────────────────────

export function buildSpecGrid(initialBoardJson: string | null): void {
  const gridEl = document.getElementById('duo-spec-grid');
  if (!gridEl) return;

  gridEl.innerHTML = '';
  gridEl.className = 'sudoku-grid spec-grid';

  const puzzle = gs.currentLevel?.puzzle ?? [];

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = String(i);

    if (puzzle[i] !== 0) {
      cell.classList.add('is-fixed');
      cell.textContent = String(puzzle[i]);
    }

    gridEl.appendChild(cell);
  }

  // If initial board data is available, apply it
  if (initialBoardJson) {
    applySpecBoard(initialBoardJson);
  }
}
