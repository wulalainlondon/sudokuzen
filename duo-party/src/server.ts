import { Server, routePartykitRequest, type Connection, type WSMessage } from 'partyserver';
import type { ClientMsg, ServerMsg, PublicRoomState, PlayerInfo, PlayerSlot, Role, MoveRecord } from './protocol';
import { verifyFirebaseIdToken } from './auth';

const MAX_MOVES = 2000;

interface Env {
  GameRoom: DurableObjectNamespace<GameRoom>;
  // 寬限期可由 wrangler --var 覆寫（測試用短值），預設 30s
  FORFEIT_GRACE_MS?: string;
  WAITING_CLOSE_GRACE_MS?: string;
  // Firebase 身分驗證：PROJECT_ID 用於驗 aud/iss；AUTH_REQUIRED='false' 關閉驗證（本機測試）
  PROJECT_ID?: string;
  AUTH_REQUIRED?: string;
}

type ConnState = { role: Role; playerId: string; ownerUid: string };

const COUNTDOWN_MS = 4000; // 3-2-1-GO
const FORFEIT_TIME = 9999;

// 內部狀態：含對外不廣播的 alarm deadline。
interface RoomState extends PublicRoomState {
  // alarm deadlines（epoch ms，null = 無）
  countdownEndAt: number | null;
  forfeitHostAt: number | null;
  forfeitGuestAt: number | null;
  closeRoomAt: number | null;
  // 權威身分（驗證後綁定，不對外廣播）—— 重連認領座位時須相符
  hostOwnerUid: string | null;
  guestOwnerUid: string | null;
}

/**
 * 一個 Duo 對戰房間 = 一個 Durable Object。
 * 取代 Firebase：onMessage 取代 12 個 CF（單執行緒無競態），
 * onClose + alarm 取代 setInterval 心跳 + autoForfeit CF，
 * ctx.storage 取代 Firestore 文件。
 */
export class GameRoom extends Server<Env> {
  private room: RoomState | null = null;

  private graceMs(key: 'FORFEIT_GRACE_MS' | 'WAITING_CLOSE_GRACE_MS', def: number): number {
    const v = Number(this.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }

  async onStart(): Promise<void> {
    this.room = (await this.ctx.storage.get<RoomState>('room')) ?? null;
  }

  onConnect(connection: Connection<ConnState>): void {
    this.send(connection, { type: 'connected' });
    if (this.room) this.sendStateTo(connection); // 重連/旁觀立即拿當前狀態
  }

  async onMessage(connection: Connection<ConnState>, raw: WSMessage): Promise<void> {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw as string);
    } catch {
      return this.err(connection, 'bad_json', 'Invalid message');
    }

    switch (msg.type) {
      case 'create':
        return this.handleCreate(connection, msg);
      case 'join':
        return this.handleJoin(connection, msg);
      case 'hello':
        return this.handleHello(connection, msg);
      case 'ready':
        return this.handleReady(connection, msg);
      case 'progress':
        return this.handleProgress(connection, msg);
      case 'finish':
        return this.handleFinish(connection, msg);
      case 'surrender':
        return this.handleSurrender(connection, msg);
      case 'specBoard':
        return this.handleSpecBoard(connection, msg);
      case 'bomb':
        return this.handleBomb(connection, msg);
      case 'cc':
        return this.handleCc(connection, msg);
      case 'abort':
        return this.handleAbort();
      case 'leave':
        return this.handleLeave(connection);
      case 'closeResult':
        return this.handleCloseResult();
      default:
        return this.err(connection, 'unknown_type', 'Unknown message type');
    }
  }

  // ── lifecycle handlers ─────────────────────────────────────

  // 驗證 Firebase ID token，回傳權威 uid；失敗時送 error 並回 null。
  // AUTH_REQUIRED='false'（本機測試）時跳過驗證、以 player.id 當 uid。
  private async resolveUid(
    conn: Connection<ConnState>,
    token: string | undefined,
    fallbackId: string,
  ): Promise<string | null> {
    if (this.env.AUTH_REQUIRED === 'false') return fallbackId;
    if (!token) {
      this.err(conn, 'auth_required', 'Missing auth token');
      return null;
    }
    const res = await verifyFirebaseIdToken(token, this.env.PROJECT_ID || '');
    if (!res) {
      this.err(conn, 'auth_invalid', 'Invalid auth token');
      return null;
    }
    return res.uid;
  }

  private async handleCreate(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'create' }>): Promise<void> {
    if (this.room) return this.err(conn, 'room_exists', 'Room already created');
    const uid = await this.resolveUid(conn, msg.idToken, msg.player.id);
    if (!uid) return;
    const now = Date.now();
    this.room = {
      roomId: this.name,
      status: 'waiting',
      tierId: msg.room.tierId,
      modeId: msg.room.modeId,
      puzzleSeed: Math.floor(Math.random() * 1_000_000_000),
      host: makeSlot(msg.player),
      guest: null,
      countdownStartedAt: null,
      startAt: null,
      updatedAt: now,
      specBoardState: null,
      specBoardVersion: null,
      specBombAt: null,
      specBombCells: null,
      cc: null,
      countdownEndAt: null,
      forfeitHostAt: null,
      forfeitGuestAt: null,
      closeRoomAt: null,
      hostOwnerUid: uid,
      guestOwnerUid: null,
    };
    conn.setState({ role: 'host', playerId: msg.player.id, ownerUid: uid });
    await this.commit();
  }

  private async handleJoin(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'join' }>): Promise<void> {
    if (!this.room) return this.err(conn, 'no_room', 'Room does not exist');
    if (this.room.status !== 'waiting') return this.err(conn, 'not_joinable', 'Room is not accepting players');
    if (this.room.guest) return this.err(conn, 'room_full', 'Room already has a guest');
    const uid = await this.resolveUid(conn, msg.idToken, msg.player.id);
    if (!uid) return;
    if (this.room.hostOwnerUid === uid) return this.err(conn, 'is_host', 'You are the host');

    this.room.guest = makeSlot(msg.player);
    this.room.guestOwnerUid = uid;
    conn.setState({ role: 'guest', playerId: msg.player.id, ownerUid: uid });
    await this.commit();
  }

  // 重連認領：權威 uid 須與座位綁定的 ownerUid 相符，才能接管、標回 online、取消沒收/關房計時。
  private async handleHello(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'hello' }>): Promise<void> {
    if (!this.room) return this.err(conn, 'no_room', 'Room does not exist');
    const uid = await this.resolveUid(conn, msg.idToken, msg.player.id);
    if (!uid) return;
    const slot = msg.role === 'host' ? this.room.host : this.room.guest;
    const ownerUid = msg.role === 'host' ? this.room.hostOwnerUid : this.room.guestOwnerUid;
    if (!slot || ownerUid !== uid) return this.err(conn, 'reclaim_failed', 'Seat no longer yours');
    slot.online = true;
    conn.setState({ role: msg.role, playerId: msg.player.id, ownerUid: uid });
    if (msg.role === 'host') {
      this.room.forfeitHostAt = null;
      this.room.closeRoomAt = null;
    } else {
      this.room.forfeitGuestAt = null;
    }
    await this.rescheduleAlarm();
    await this.commit();
  }

  private async handleReady(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'ready' }>): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role) return this.err(conn, 'no_role', 'Not in this room');
    if (this.room.status !== 'waiting' && this.room.status !== 'countdown') {
      return this.err(conn, 'bad_state', 'Cannot change ready now');
    }
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot) return;
    slot.ready = msg.ready;

    const bothReady = !!this.room.host?.ready && !!this.room.guest?.ready;
    if (this.room.status === 'waiting' && bothReady) {
      await this.startCountdown();
    } else if (this.room.status === 'countdown' && !bothReady) {
      await this.cancelCountdown();
    }
    await this.commit();
  }

  // ── gameplay handlers ──────────────────────────────────────

  private async handleProgress(
    conn: Connection<ConnState>,
    msg: Extract<ClientMsg, { type: 'progress' }>,
  ): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot) return;
    slot.progress = Math.max(0, Math.min(81, Math.floor(msg.filled)));
    await this.commit();
  }

  private async handleFinish(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'finish' }>): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot || slot.finishTime != null) return; // 防重複提交
    slot.finishTime = Math.max(0, Math.floor(msg.timeSec));
    slot.stars = Math.max(0, Math.min(3, Math.floor(msg.stars)));
    slot.moves = sanitizeMoves(msg.moves);
    // 完成的人不會被沒收
    if (role === 'host') this.room.forfeitHostAt = null;
    else this.room.forfeitGuestAt = null;
    await this.rescheduleAlarm();
    await this.commit();
  }

  private async handleSurrender(
    conn: Connection<ConnState>,
    msg: Extract<ClientMsg, { type: 'surrender' }>,
  ): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot || slot.finishTime != null) return;
    slot.finishTime = FORFEIT_TIME;
    slot.stars = 0;
    slot.moves = sanitizeMoves(msg.moves);
    if (role === 'host') this.room.forfeitHostAt = null;
    else this.room.forfeitGuestAt = null;
    await this.rescheduleAlarm();
    await this.commit();
  }

  // 被觀看方同步盤面給觀戰方
  private async handleSpecBoard(
    conn: Connection<ConnState>,
    msg: Extract<ClientMsg, { type: 'specBoard' }>,
  ): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    if (typeof msg.board !== 'string' || msg.board.length > 2000) return;
    this.room.specBoardState = msg.board;
    this.room.specBoardVersion = Math.floor(Number(msg.version) || 0);
    await this.commit();
  }

  // 觀戰方丟炸彈
  private async handleBomb(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'bomb' }>): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    const cells = Array.isArray(msg.cells)
      ? msg.cells
          .map((c) => Math.floor(Number(c)))
          .filter((c) => c >= 0 && c <= 80)
          .slice(0, 5)
      : [];
    if (cells.length === 0) return;
    this.room.specBombAt = Date.now();
    this.room.specBombCells = cells;
    await this.commit();
  }

  // Chess Clock 回合更新：client 驅動，DO 序列化合併 cc 欄位 + 廣播
  private async handleCc(conn: Connection<ConnState>, msg: Extract<ClientMsg, { type: 'cc' }>): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role || this.room.status !== 'playing') return;
    if (!msg.update || typeof msg.update !== 'object') return;
    if (!this.room.cc) {
      this.room.cc = {
        ccActiveTurn: null,
        ccTurnStartedAt: null,
        ccHostAccumMs: 0,
        ccGuestAccumMs: 0,
        ccCurrentCellErrors: 0,
        ccCurrentCellIdx: null,
        ccBoardState: null,
        ccBoardVersion: 0,
        ccHostTotalMs: null,
        ccGuestTotalMs: null,
      };
    }
    const u = msg.update;
    const cc = this.room.cc;
    if (u.ccActiveTurn === 'host' || u.ccActiveTurn === 'guest' || u.ccActiveTurn === null)
      cc.ccActiveTurn = u.ccActiveTurn;
    if (typeof u.ccTurnStartedAt === 'number') cc.ccTurnStartedAt = u.ccTurnStartedAt;
    if (typeof u.ccHostAccumMs === 'number') cc.ccHostAccumMs = u.ccHostAccumMs;
    if (typeof u.ccGuestAccumMs === 'number') cc.ccGuestAccumMs = u.ccGuestAccumMs;
    if (typeof u.ccCurrentCellErrors === 'number') cc.ccCurrentCellErrors = u.ccCurrentCellErrors;
    if (u.ccCurrentCellIdx === null || typeof u.ccCurrentCellIdx === 'number') cc.ccCurrentCellIdx = u.ccCurrentCellIdx;
    if (typeof u.ccBoardState === 'string') cc.ccBoardState = u.ccBoardState;
    if (typeof u.ccBoardVersion === 'number') cc.ccBoardVersion = u.ccBoardVersion;
    if (u.ccHostTotalMs === null || typeof u.ccHostTotalMs === 'number') cc.ccHostTotalMs = u.ccHostTotalMs;
    if (u.ccGuestTotalMs === null || typeof u.ccGuestTotalMs === 'number') cc.ccGuestTotalMs = u.ccGuestTotalMs;
    await this.commit();
  }

  private async handleAbort(): Promise<void> {
    if (!this.room) return;
    if (this.room.status === 'countdown') await this.cancelCountdown();
    if (this.room.host) this.room.host.ready = false;
    if (this.room.guest) this.room.guest.ready = false;
    await this.commit();
  }

  private async handleLeave(conn: Connection<ConnState>): Promise<void> {
    if (!this.room) return;
    const role = conn.state?.role;
    if (role === 'guest') {
      await this.releaseGuest();
    } else if (role === 'host') {
      this.room.status = 'finished';
      await this.commit();
    }
    conn.close();
  }

  private async handleCloseResult(): Promise<void> {
    if (!this.room) return;
    this.room.status = 'finished';
    await this.commit();
  }

  // ── presence：連線中斷 ─────────────────────────────────────

  onClose(connection: Connection<ConnState>): void {
    const role = connection.state?.role;
    if (!this.room || !role) return;
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot) return;
    slot.online = false;

    const now = Date.now();
    if (this.room.status === 'playing') {
      // 對局中斷線且尚未完成 → 寬限期後沒收（給重連機會）
      if (slot.finishTime == null) {
        const grace = this.graceMs('FORFEIT_GRACE_MS', 30_000);
        if (role === 'host') this.room.forfeitHostAt = now + grace;
        else this.room.forfeitGuestAt = now + grace;
      }
    } else if (this.room.status === 'waiting' || this.room.status === 'countdown') {
      if (role === 'guest') {
        void this.releaseGuest();
        return;
      }
      // host 斷線：若在倒數中，先取消倒數，否則殘留的 countdownEndAt 會在稍後
      // 把已關閉的房復活成 playing 並廣播偽 started。
      if (this.room.status === 'countdown') {
        this.room.status = 'waiting';
        this.room.countdownStartedAt = null;
        this.room.startAt = null;
        this.room.countdownEndAt = null;
      }
      // host 在等待期間斷線 → 寬限期後關房（取代 Watchdog 清卡死房）
      this.room.closeRoomAt = now + this.graceMs('WAITING_CLOSE_GRACE_MS', 30_000);
    }
    void this.afterPresenceChange();
  }

  private async afterPresenceChange(): Promise<void> {
    await this.rescheduleAlarm();
    await this.commit();
  }

  // ── countdown / alarm（多截止時間管理）─────────────────────

  private async startCountdown(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    this.room.status = 'countdown';
    this.room.countdownStartedAt = now;
    this.room.startAt = now + COUNTDOWN_MS;
    this.room.countdownEndAt = now + COUNTDOWN_MS;
    await this.rescheduleAlarm();
  }

  private async cancelCountdown(): Promise<void> {
    if (!this.room) return;
    this.room.status = 'waiting';
    this.room.countdownStartedAt = null;
    this.room.startAt = null;
    this.room.countdownEndAt = null;
    await this.rescheduleAlarm();
  }

  private async releaseGuest(): Promise<void> {
    if (!this.room) return;
    this.room.guest = null;
    if (this.room.host) this.room.host.ready = false;
    this.room.status = 'waiting';
    this.room.countdownStartedAt = null;
    this.room.startAt = null;
    this.room.countdownEndAt = null;
    this.room.forfeitGuestAt = null;
    await this.rescheduleAlarm();
    await this.commit();
  }

  // 把 alarm 設到最近的截止時間（DO 只有單一 alarm，需多工）
  private async rescheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const deadlines = [
      this.room.countdownEndAt,
      this.room.forfeitHostAt,
      this.room.forfeitGuestAt,
      this.room.closeRoomAt,
    ].filter((x): x is number => x != null);
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(Math.min(...deadlines));
    }
  }

  async onAlarm(): Promise<void> {
    if (!this.room) this.room = (await this.ctx.storage.get<RoomState>('room')) ?? null;
    if (!this.room) return;
    const now = Date.now();
    let started = false;

    if (this.room.countdownEndAt != null && now >= this.room.countdownEndAt && this.room.status === 'countdown') {
      this.room.status = 'playing';
      this.room.startAt = now;
      this.room.countdownEndAt = null;
      started = true;
    } else if (this.room.countdownEndAt != null && now >= this.room.countdownEndAt) {
      this.room.countdownEndAt = null; // 狀態已離開 countdown，清掉殘留 deadline
    }
    if (this.room.forfeitHostAt != null && now >= this.room.forfeitHostAt) {
      this.room.forfeitHostAt = null;
      if (this.room.host && this.room.host.finishTime == null) {
        this.room.host.finishTime = FORFEIT_TIME;
        this.room.host.stars = 0;
      }
    }
    if (this.room.forfeitGuestAt != null && now >= this.room.forfeitGuestAt) {
      this.room.forfeitGuestAt = null;
      if (this.room.guest && this.room.guest.finishTime == null) {
        this.room.guest.finishTime = FORFEIT_TIME;
        this.room.guest.stars = 0;
      }
    }
    if (this.room.closeRoomAt != null && now >= this.room.closeRoomAt) {
      this.room.closeRoomAt = null;
      if (this.room.status === 'waiting' || this.room.status === 'countdown') {
        this.room.status = 'finished';
      }
    }

    await this.rescheduleAlarm();
    if (started) {
      this.broadcast(JSON.stringify({ type: 'started', startAt: this.room.startAt! } satisfies ServerMsg));
    }
    await this.commit();
  }

  // ── helpers ────────────────────────────────────────────────

  private async commit(): Promise<void> {
    if (this.room) {
      this.room.updatedAt = Date.now();
      await this.ctx.storage.put('room', this.room);
    }
    this.broadcastState();
  }

  private broadcastState(): void {
    for (const conn of this.getConnections<ConnState>()) this.sendStateTo(conn);
  }

  private sendStateTo(conn: Connection<ConnState>): void {
    if (!this.room) return;
    this.send(conn, { type: 'roomState', you: conn.state?.role ?? null, state: toPublic(this.room) });
  }

  private send(conn: Connection, msg: ServerMsg): void {
    conn.send(JSON.stringify(msg));
  }

  private err(conn: Connection, code: string, message: string): void {
    this.send(conn, { type: 'error', code, message });
  }
}

function makeSlot(p: PlayerInfo): PlayerSlot {
  return {
    id: p.id,
    alias: p.alias,
    title: p.title ?? null,
    wins: p.wins ?? 0,
    ready: false,
    progress: 0,
    finishTime: null,
    stars: null,
    online: true,
    moves: null,
  };
}

// 觀戰期間剝除 moves，雙方完成才帶上（省廣播頻寬）
function trimMoves(slot: PlayerSlot | null, keep: boolean): PlayerSlot | null {
  if (!slot || keep || slot.moves == null) return slot;
  return { ...slot, moves: null };
}

// 驗證 + 上限保護 moves（client 上傳，不可信）
function sanitizeMoves(moves: MoveRecord[] | undefined): MoveRecord[] | null {
  if (!Array.isArray(moves)) return null;
  return moves.slice(0, MAX_MOVES).map((m) => ({
    t: Math.max(0, Math.floor(Number(m?.t) || 0)),
    cell: Math.max(0, Math.min(80, Math.floor(Number(m?.cell) || 0))),
    val: Math.max(0, Math.min(9, Math.floor(Number(m?.val) || 0))),
    ok: !!m?.ok,
  }));
}

// 內部 RoomState → 對外 PublicRoomState（剝除 alarm deadline）
function toPublic(r: RoomState): PublicRoomState {
  // moves 只在雙方都完成（replay 即將顯示）時才帶上，避免觀戰期間每幀廣播 ~75KB
  const bothFinished = r.host?.finishTime != null && r.guest?.finishTime != null;
  return {
    roomId: r.roomId,
    status: r.status,
    tierId: r.tierId,
    modeId: r.modeId,
    puzzleSeed: r.puzzleSeed,
    host: trimMoves(r.host, bothFinished),
    guest: trimMoves(r.guest, bothFinished),
    countdownStartedAt: r.countdownStartedAt,
    startAt: r.startAt,
    updatedAt: r.updatedAt,
    specBoardState: r.specBoardState,
    specBoardVersion: r.specBoardVersion,
    specBombAt: r.specBombAt,
    specBombCells: r.specBombCells,
    cc: r.cc,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env, { locationHint: 'apac' })) || new Response('Not found', { status: 404 })
    );
  },
};
