// Duo WebSocket 傳輸層（Cloudflare Durable Objects / partyserver）。
//
// 設計：把 DO 廣播的 roomState 映射成現有的 DuoRoomData，餵進既有的
// handleDuoSnapshot，最大化重用下游 UI/狀態邏輯。gs.duoRole 由伺服器
// 廣播的 `you` 欄位反設（server-authoritative）。
//
// Phase 2 只涵蓋房間生命週期。進度/完成/觀戰/Chess Clock/replay 的
// 訊息在 Phase 3/4 擴充協定與映射。

import { PartySocket } from 'partysocket';
import { gs, type DuoRoomData } from '../../game/state';
import { getPlayerIdentity } from '../../firebase/client';
import { getFirebaseIdToken } from '../../firebase/runtime';
import { getEquippedTitleDisplay } from '../titles';
import { loadDuoProfile } from './duoProfile';
import { handleDuoSnapshot } from './duoGame';
import { getDuoWsHost } from './duoTransport';
import type { ClientMsg, ServerMsg, PublicRoomState, PlayerInfo, MoveRecord, CcFields } from './duoWsProtocol';

const PARTY = 'game-room';
const WS_OPEN = 1;

let _socket: PartySocket | null = null;
let _roomId: string | null = null;
// 重連認領：create/join 成功後設定，partysocket 自動重連時用 hello 接管原座位
let _reconnectMsg: ClientMsg | null = null;

interface Waiter {
  pred: (m: ServerMsg) => boolean;
  resolve: (m: ServerMsg) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const _waiters: Waiter[] = [];

// ── helpers ──────────────────────────────────────────────────

function playerInfo(): PlayerInfo {
  const { playerId, alias } = getPlayerIdentity();
  return { id: playerId, alias: alias || 'Player', title: getEquippedTitleDisplay(), wins: loadDuoProfile().wins };
}

function tsObj(ms: number | null): { toMillis: () => number; seconds: number } | null {
  return ms != null ? { toMillis: () => ms, seconds: Math.floor(ms / 1000) } : null;
}

// DO 的 PublicRoomState → 既有的 DuoRoomData。Phase 2 只填生命週期欄位，
// 進度/完成/heartbeat 等留預設（這些分支在 handleDuoSnapshot 裡會因條件不成立而休眠）。
function mapToDuoRoomData(s: PublicRoomState): DuoRoomData {
  return {
    levelId: 0,
    tierId: s.tierId ?? '',
    modeId: s.modeId ?? '',
    puzzleSeed: s.puzzleSeed ?? 0,
    status: s.status,
    hostId: s.host?.id ?? '',
    hostAlias: s.host?.alias ?? '',
    hostTitle: s.host?.title ?? null,
    hostReady: s.host?.ready ?? false,
    hostProgress: s.host?.progress ?? 0,
    hostFinishTime: s.host?.finishTime ?? null,
    hostStars: s.host?.stars ?? null,
    guestId: s.guest?.id ?? null,
    guestAlias: s.guest?.alias ?? null,
    guestTitle: s.guest?.title ?? null,
    guestReady: s.guest?.ready ?? false,
    guestProgress: s.guest?.progress ?? 0,
    guestFinishTime: s.guest?.finishTime ?? null,
    guestStars: s.guest?.stars ?? null,
    startAt: tsObj(s.startAt),
    countdownStartedAt: tsObj(s.countdownStartedAt),
    updatedAt: { toDate: () => new Date(s.updatedAt) },
    hostDuoWins: s.host?.wins ?? 0,
    guestDuoWins: s.guest?.wins ?? 0,
    hostOnline: s.host?.online ?? true,
    guestOnline: s.guest?.online ?? true,
    hostMoves: s.host?.moves ?? null,
    guestMoves: s.guest?.moves ?? null,
    specBoardState: s.specBoardState ?? null,
    specBoardVersion: s.specBoardVersion ?? null,
    specBombAt: s.specBombAt ?? null,
    specBombCells: s.specBombCells ?? null,
    ...(s.cc
      ? {
          ccActiveTurn: s.cc.ccActiveTurn,
          ccTurnStartedAt: tsObj(s.cc.ccTurnStartedAt),
          ccHostAccumMs: s.cc.ccHostAccumMs,
          ccGuestAccumMs: s.cc.ccGuestAccumMs,
          ccCurrentCellErrors: s.cc.ccCurrentCellErrors,
          ccCurrentCellIdx: s.cc.ccCurrentCellIdx,
          ccBoardState: s.cc.ccBoardState,
          ccBoardVersion: s.cc.ccBoardVersion,
          ccHostTotalMs: s.cc.ccHostTotalMs,
          ccGuestTotalMs: s.cc.ccGuestTotalMs,
        }
      : {}),
  };
}

function pump(raw: string): void {
  let msg: ServerMsg;
  try {
    msg = JSON.parse(raw) as ServerMsg;
  } catch {
    return;
  }

  // 先結算一次性等待者（create/join 的回應）
  for (let i = _waiters.length - 1; i >= 0; i--) {
    if (_waiters[i].pred(msg)) {
      clearTimeout(_waiters[i].timer);
      _waiters[i].resolve(msg);
      _waiters.splice(i, 1);
    }
  }

  if (msg.type === 'roomState') {
    if (msg.you) gs.duoRole = msg.you; // server-authoritative
    const d = mapToDuoRoomData(msg.state);
    gs.duoRoomData = d;
    if (gs.duoRole) handleDuoSnapshot(d);
  } else if (msg.type === 'error') {
    console.warn('[duoWs] server error:', msg.code, msg.message);
  }
}

function waitFor(pred: (m: ServerMsg) => boolean, ms = 8000): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = _waiters.findIndex((w) => w.timer === timer);
      if (i >= 0) _waiters.splice(i, 1);
      reject(new Error('duoWs: timeout'));
    }, ms);
    _waiters.push({ pred, resolve, reject, timer });
  });
}

function waitOpen(socket: PartySocket): Promise<void> {
  if (socket.readyState === WS_OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onErr = (): void => {
      cleanup();
      reject(new Error('duoWs: connect error'));
    };
    const cleanup = (): void => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onErr);
    };
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onErr);
  });
}

function connect(roomId: string): PartySocket {
  if (_socket && _roomId === roomId) return _socket;
  closeSocket();
  _roomId = roomId;
  _socket = new PartySocket({ host: getDuoWsHost(), party: PARTY, room: roomId });
  _socket.addEventListener('message', (e) => pump((e as MessageEvent).data as string));
  // 自動重連後（每次 open）重送 hello 認領座位（帶新 token，舊的可能已過期）。
  // 初次 open 時 _reconnectMsg 尚為 null。
  _socket.addEventListener('open', () => {
    void resendHello();
  });
  return _socket;
}

async function resendHello(): Promise<void> {
  if (!_reconnectMsg || _reconnectMsg.type !== 'hello') return;
  const idToken = (await getFirebaseIdToken()) ?? undefined;
  send({ ..._reconnectMsg, idToken });
}

function send(msg: ClientMsg): void {
  _socket?.send(JSON.stringify(msg));
}

function closeSocket(): void {
  if (_socket) {
    try {
      _socket.close();
    } catch {
      /* noop */
    }
  }
  _socket = null;
  _roomId = null;
  _reconnectMsg = null;
  for (const w of _waiters.splice(0)) {
    clearTimeout(w.timer);
    w.reject(new Error('duoWs: closed'));
  }
}

// ── public API ───────────────────────────────────────────────

export function getDuoWsRoomId(): string | null {
  return _roomId;
}

export async function duoWsCreateRoom(tierId: string, modeId: string): Promise<string | null> {
  const roomId = 'r_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const socket = connect(roomId);
  try {
    await waitOpen(socket);
    const idToken = (await getFirebaseIdToken()) ?? undefined;
    send({ type: 'create', room: { tierId, modeId }, player: playerInfo(), idToken });
    const res = await waitFor((m) => (m.type === 'roomState' && m.you === 'host') || m.type === 'error');
    if (res.type === 'error') {
      closeSocket();
      return null;
    }
    _reconnectMsg = { type: 'hello', player: playerInfo(), role: 'host' };
    return roomId;
  } catch (e) {
    console.warn('[duoWs] createRoom failed:', e);
    closeSocket();
    return null;
  }
}

export async function duoWsJoinRoom(roomId: string): Promise<boolean> {
  const socket = connect(roomId);
  try {
    await waitOpen(socket);
    const idToken = (await getFirebaseIdToken()) ?? undefined;
    send({ type: 'join', player: playerInfo(), idToken });
    const res = await waitFor((m) => (m.type === 'roomState' && m.you === 'guest') || m.type === 'error');
    if (res.type === 'error') {
      console.warn('[duoWs] join rejected:', res.code);
      closeSocket();
      return false;
    }
    _reconnectMsg = { type: 'hello', player: playerInfo(), role: 'guest' };
    return true;
  } catch (e) {
    console.warn('[duoWs] joinRoom failed:', e);
    closeSocket();
    return false;
  }
}

export function duoWsReady(ready: boolean): void {
  send({ type: 'ready', ready });
}

export function duoWsProgress(filled: number): void {
  send({ type: 'progress', filled });
}

export function duoWsFinish(timeSec: number, stars: number, moves?: MoveRecord[]): void {
  send({ type: 'finish', timeSec, stars, moves });
}

export function duoWsSurrender(moves?: MoveRecord[]): void {
  send({ type: 'surrender', moves });
}

export function duoWsSpecBoard(board: string, version: number): void {
  send({ type: 'specBoard', board, version });
}

export function duoWsBomb(cells: number[]): void {
  send({ type: 'bomb', cells });
}

export function duoWsCc(update: Partial<CcFields>): void {
  send({ type: 'cc', update });
}

export function duoWsAbort(): void {
  send({ type: 'abort' });
}

export function duoWsCloseResult(): void {
  send({ type: 'closeResult' });
}

export function duoWsLeave(): void {
  send({ type: 'leave' });
  closeSocket();
}

export function duoWsDisconnect(): void {
  closeSocket();
}
