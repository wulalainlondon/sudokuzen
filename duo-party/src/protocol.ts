// Duo realtime 訊息協定（client ⇄ GameRoom DO）。
// Phase 1：房間生命週期。Phase 3：進度/完成/認輸/在線(presence)/重連。
// 觀戰、Chess Clock、replay(moves) 在 Phase 4 擴充。

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
  t: number; // 相對開賽的 ms
  cell: number; // 0-80
  val: number; // 1-9，或 0 = 清除
  ok: boolean; // client 回報的正確性（僅供 replay 著色）
}

// Chess Clock 模式的回合狀態（client 驅動，DO 只負責序列化合併 + 廣播）
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

// ── client → server ──────────────────────────────────────────
export type ClientMsg =
  | { type: 'create'; room: RoomConfig; player: PlayerInfo; idToken?: string }
  | { type: 'join'; player: PlayerInfo; idToken?: string }
  | { type: 'hello'; player: PlayerInfo; role: Role; idToken?: string } // 重連認領座位
  | { type: 'ready'; ready: boolean }
  | { type: 'progress'; filled: number }
  | { type: 'finish'; timeSec: number; stars: number; moves?: MoveRecord[] }
  | { type: 'surrender'; moves?: MoveRecord[] }
  | { type: 'specBoard'; board: string; version: number } // 被觀看方同步盤面
  | { type: 'bomb'; cells: number[] } // 觀戰方丟炸彈
  | { type: 'cc'; update: Partial<CcFields> } // Chess Clock 回合更新
  | { type: 'abort' }
  | { type: 'leave' }
  | { type: 'closeResult' }
  | { type: 'ping' }; // 應用層心跳：更新座位 lastSeen，供 alarm 偵測靜默斷線

// ── 房間狀態 ─────────────────────────────────────────────────
export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface PlayerSlot {
  id: string;
  alias: string;
  title: string | null;
  wins: number;
  ready: boolean;
  progress: number;
  finishTime: number | null; // 秒；9999 = 沒收
  stars: number | null;
  online: boolean;
  moves: MoveRecord[] | null; // replay 用，完成時提交
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
  // 觀戰盤面 / 炸彈
  specBoardState: string | null;
  specBoardVersion: number | null;
  specBombAt: number | null;
  specBombCells: number[] | null;
  cc: CcFields | null;
}

// ── server → client ──────────────────────────────────────────
export type ServerMsg =
  | { type: 'connected' }
  | { type: 'roomState'; you: Role | null; state: PublicRoomState }
  | { type: 'started'; startAt: number }
  | { type: 'error'; code: string; message: string };
