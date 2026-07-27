// Duo WebSocket 訊息協定（client 端）。
// 必須與伺服器端 duo-party/src/protocol.ts 保持同步（手動）。

export type Role = 'host' | 'guest';

export interface PlayerInfo {
  id: string;
  alias: string;
  title: string | null;
  wins: number;
}

export interface RoomConfig {
  tierId: string;
  modeId: string;
}

export interface MoveRecord {
  t: number;
  cell: number;
  val: number;
  ok: boolean;
}

export interface CcFields {
  ccActiveTurn: Role | null;
  ccTurnStartedAt: number | null;
  ccHostAccumMs: number;
  ccGuestAccumMs: number;
  ccCurrentCellErrors: number;
  ccCurrentCellIdx: number | null;
  ccBoardState: string | null;
  ccBoardVersion: number;
  ccHostTotalMs: number | null;
  ccGuestTotalMs: number | null;
}

export type ClientMsg =
  | { type: 'create'; room: RoomConfig; player: PlayerInfo; idToken?: string }
  | { type: 'join'; player: PlayerInfo; idToken?: string }
  | { type: 'hello'; player: PlayerInfo; role: Role; idToken?: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'progress'; filled: number }
  | { type: 'finish'; timeSec: number; stars: number; moves?: MoveRecord[] }
  | { type: 'surrender'; moves?: MoveRecord[] }
  | { type: 'specBoard'; board: string; version: number }
  | { type: 'bomb'; cells: number[] }
  | { type: 'cc'; update: Partial<CcFields> }
  | { type: 'abort' }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'closeResult' }
  | { type: 'ping' }; // 應用層心跳：更新座位 lastSeen，供 server alarm 偵測靜默斷線

export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface PlayerSlot {
  id: string;
  alias: string;
  title: string | null;
  wins: number;
  ready: boolean;
  progress: number;
  finishTime: number | null;
  stars: number | null;
  online: boolean;
  moves: MoveRecord[] | null;
}

export interface PublicRoomState {
  roomId: string;
  status: RoomStatus;
  tierId: string | null;
  modeId: string | null;
  puzzleSeed: number | null;
  host: PlayerSlot | null;
  guest: PlayerSlot | null;
  countdownStartedAt: number | null;
  startAt: number | null;
  updatedAt: number;
  specBoardState: string | null;
  specBoardVersion: number | null;
  specBombAt: number | null;
  specBombCells: number[] | null;
  cc: CcFields | null;
}

export type ServerMsg =
  | { type: 'connected' }
  | { type: 'roomState'; you: Role | null; state: PublicRoomState }
  | { type: 'started'; startAt: number }
  | { type: 'error'; code: string; message: string };
