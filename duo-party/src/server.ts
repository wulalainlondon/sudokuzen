import { Server, routePartykitRequest, type Connection, type WSMessage } from 'partyserver';
import type { ClientMsg, ServerMsg, PublicRoomState, PlayerInfo, PlayerSlot, Role, MoveRecord } from './protocol';
import { verifyFirebaseIdToken } from './auth';

const MAX_MOVES = 2000;

interface Env {
  GameRoom: DurableObjectNamespace<GameRoom>;
  // 寬限期可由 wrangler --var 覆寫（測試用短值），playing 預設 60s
  FORFEIT_GRACE_MS?: string;
  WAITING_CLOSE_GRACE_MS?: string;
  // Firebase 身分驗證：PROJECT_ID 用於驗 aud/iss；AUTH_REQUIRED='false' 關閉驗證（本機測試）
  PROJECT_ID?: string;
  AUTH_REQUIRED?: string;
}

// PartyServer stores Connection.state as a WebSocket serialized attachment when
// hibernation is enabled. Keep lastSeenAt here (instead of only in class
// memory) so an alarm wake or runtime eviction cannot reset presence history.
type ConnState = { role: Role; playerId: string; ownerUid: string; lastSeenAt?: number };

const COUNTDOWN_MS = 4000; // 3-2-1-GO
const FORFEIT_TIME = 9999;
// 應用層心跳：playing 階段超過 PRESENCE_STALE_MS 沒收到任何訊息 → 判定靜默斷線。
// 偵測由 alarm 每 PRESENCE_CHECK_MS 輪詢一次。client 端每 10s 送一次 ping。
const PRESENCE_STALE_MS = 25_000;
const PRESENCE_CHECK_MS = 10_000;
const FINISHED_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const LOBBY_COLLECTION = 'duo_ws_rooms';
const MAX_LOBBY_PAGE_SIZE = 50;

// 內部狀態：含對外不廣播的 alarm deadline。
interface RoomState extends PublicRoomState {
  // alarm deadlines（epoch ms，null = 無）
  countdownEndAt: number | null;
  forfeitHostAt: number | null;
  forfeitGuestAt: number | null;
  closeRoomAt: number | null;
  deleteRoomAt: number | null;
  // playing 期間的 presence 輪詢截止（每次檢查後續期；null = 未輪詢）
  presenceCheckAt: number | null;
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
  // Use Cloudflare's Hibernation WebSocket API. PartyServer preserves each
  // connection's state attachment and rebuilds its connection iterator after a
  // wake, so idle rooms no longer accrue continuous wall-clock duration.
  static options = { hibernate: true };

  private room: RoomState | null = null;

  private graceMs(key: 'FORFEIT_GRACE_MS' | 'WAITING_CLOSE_GRACE_MS', def: number): number {
    const v = Number(this.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }

  async onStart(): Promise<void> {
    this.room = (await this.ctx.storage.get<RoomState>('room')) ?? null;
    const now = Date.now();
    // Connections accepted by the pre-hibernation deployment have an older
    // attachment shape. Seed them once on the first wake so they receive a
    // full stale window instead of becoming permanently exempt from checks.
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state && !(Number.isFinite(conn.state.lastSeenAt) && conn.state.lastSeenAt! > 0)) {
        conn.setState({ ...conn.state, lastSeenAt: now });
      }
    }
    // 對局進行中卻沒有 presence 排程（部署前就在 playing 的舊房，或未持久化的 reload）
    // → 補設一次，確保靜默斷線偵測在 reload 後仍會運作。每條連線的 lastSeenAt
    // 由 WebSocket attachment 跨休眠保存，不在 wake 時重設。
    if (this.room?.status === 'playing' && this.room.presenceCheckAt == null) {
      this.room.presenceCheckAt = now + PRESENCE_CHECK_MS;
      await this.rescheduleAlarm();
    }
    if (this.room?.status === 'finished' && this.room.deleteRoomAt == null) {
      this.room.deleteRoomAt = now + FINISHED_ROOM_TTL_MS;
      await this.persist();
      await this.rescheduleAlarm();
    }
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

    // 任何已綁定座位的訊息都刷新 lastSeen；若該座位先前被 presence 輪詢誤判離線
    // （連線其實沒死、只是短暫卡頓），收到訊息即恢復 online 並取消沒收。
    await this.touchPresence(connection);

    switch (msg.type) {
      case 'ping':
        return; // 心跳：lastSeen 已於 touchPresence 更新，無其他副作用
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
        return this.handleAbort(connection);
      case 'rematch':
        return this.handleRematch(connection);
      case 'leave':
        return this.handleLeave(connection);
      case 'closeResult':
        return this.handleCloseResult(connection);
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
      deleteRoomAt: null,
      presenceCheckAt: null,
      hostOwnerUid: uid,
      guestOwnerUid: null,
    };
    conn.setState({ role: 'host', playerId: msg.player.id, ownerUid: uid, lastSeenAt: now });
    this.sendStateTo(conn); // direct：帶 you 讓 client 認領 host 角色
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
    const now = Date.now();
    // guest 加入 → 取消 host 斷線時設的關房計時，避免房在 guest 加入後被 alarm 關掉。
    if (this.room.closeRoomAt != null) {
      this.room.closeRoomAt = null;
      await this.rescheduleAlarm();
    }
    conn.setState({ role: 'guest', playerId: msg.player.id, ownerUid: uid, lastSeenAt: now });
    this.sendStateTo(conn); // direct：帶 you 讓 client 認領 guest 角色
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
    const now = Date.now();
    conn.setState({ role: msg.role, playerId: msg.player.id, ownerUid: uid, lastSeenAt: now });
    if (msg.role === 'host') {
      this.room.forfeitHostAt = null;
      this.room.closeRoomAt = null;
    } else {
      this.room.forfeitGuestAt = null;
    }
    await this.rescheduleAlarm();
    this.sendStateTo(conn); // direct：帶 you 讓重連的 client 確認座位認領成功
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
    if (this.room.host?.finishTime != null && this.room.guest?.finishTime != null) {
      this.room.status = 'finished';
      this.room.presenceCheckAt = null;
    }
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
    if (this.room.host?.finishTime != null && this.room.guest?.finishTime != null) {
      this.room.status = 'finished';
      this.room.presenceCheckAt = null;
    }
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

  private async handleAbort(conn: Connection<ConnState>): Promise<void> {
    if (!this.room || !conn.state?.role) return;
    if (this.room.status === 'countdown') await this.cancelCountdown();
    if (this.room.host) this.room.host.ready = false;
    if (this.room.guest) this.room.guest.ready = false;
    await this.commit();
  }

  private async handleRematch(conn: Connection<ConnState>): Promise<void> {
    if (!this.room || !conn.state?.role) return;
    if (this.room.status !== 'finished' || !this.room.host || !this.room.guest) {
      return this.err(conn, 'bad_state', 'Rematch is only available after a completed match');
    }
    const resetSlot = (slot: PlayerSlot): void => {
      slot.ready = false;
      slot.progress = 0;
      slot.finishTime = null;
      slot.stars = null;
      slot.moves = null;
    };
    resetSlot(this.room.host);
    resetSlot(this.room.guest);
    this.room.status = 'waiting';
    this.room.puzzleSeed = Math.floor(Math.random() * 1_000_000_000);
    this.room.countdownStartedAt = null;
    this.room.startAt = null;
    this.room.specBoardState = null;
    this.room.specBoardVersion = null;
    this.room.specBombAt = null;
    this.room.specBombCells = null;
    this.room.cc = null;
    this.room.countdownEndAt = null;
    this.room.forfeitHostAt = null;
    this.room.forfeitGuestAt = null;
    this.room.closeRoomAt = null;
    this.room.deleteRoomAt = null;
    this.room.presenceCheckAt = null;
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

  private async handleCloseResult(conn: Connection<ConnState>): Promise<void> {
    if (!this.room || !conn.state?.role) return;
    this.room.status = 'finished';
    await this.commit();
  }

  // ── presence：心跳 / 靜默斷線偵測 ───────────────────────────

  // 刷新座位 lastSeen；若該座位先前被誤判離線則恢復 online 並取消沒收計時。
  private async touchPresence(conn: Connection<ConnState>): Promise<void> {
    const role = conn.state?.role;
    if (!this.room || !role) return;
    const now = Date.now();
    conn.setState({ ...conn.state!, lastSeenAt: now });

    const slot = role === 'host' ? this.room.host : this.room.guest;
    // 僅在 playing 中、座位存在、先前被判離線、且尚未完成時才恢復。
    if (!slot || slot.online || slot.finishTime != null || this.room.status !== 'playing') return;
    slot.online = true;
    if (role === 'host') this.room.forfeitHostAt = null;
    else this.room.forfeitGuestAt = null;
    await this.rescheduleAlarm();
    await this.commit(); // 廣播恢復，讓對手看到對方回來了
  }

  // playing 中檢查單一座位是否靜默斷線（超過 PRESENCE_STALE_MS 沒訊息）。
  // 判定離線則啟動沒收寬限（與 onClose 相同機制）。回傳是否新偵測到離線。
  private checkSlotStale(role: Role, now: number): boolean {
    if (!this.room || this.room.status !== 'playing') return false;
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot || !slot.online || slot.finishTime != null) return false;
    const ownerUid = role === 'host' ? this.room.hostOwnerUid : this.room.guestOwnerUid;
    let lastSeen = 0;
    // Multiple sockets can briefly represent one seat during a mobile PWA
    // resume. The freshest authenticated socket keeps the seat online.
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === role && conn.state.ownerUid === ownerUid) {
        lastSeen = Math.max(lastSeen, conn.state.lastSeenAt || 0);
      }
    }
    if (lastSeen <= 0 || now - lastSeen <= PRESENCE_STALE_MS) return false;
    slot.online = false;
    const grace = this.graceMs('FORFEIT_GRACE_MS', 60_000);
    if (role === 'host') {
      if (this.room.forfeitHostAt == null) this.room.forfeitHostAt = now + grace;
    } else {
      if (this.room.forfeitGuestAt == null) this.room.forfeitGuestAt = now + grace;
    }
    return true;
  }

  // ── presence：連線中斷 ─────────────────────────────────────

  async onClose(connection: Connection<ConnState>): Promise<void> {
    const role = connection.state?.role;
    if (!this.room || !role) return;
    // A cold PWA resume can establish and reclaim a replacement socket before
    // WebKit reports the old process' socket as closed.  In that ordering the
    // stale onClose must not mark the shared seat offline or arm a forfeit
    // deadline after handleHello() already cancelled it.
    for (const active of this.getConnections<ConnState>()) {
      if (
        active.id !== connection.id &&
        active.state?.role === role &&
        active.state.ownerUid === connection.state?.ownerUid
      ) {
        return;
      }
    }
    const slot = role === 'host' ? this.room.host : this.room.guest;
    if (!slot) return;
    slot.online = false;

    const now = Date.now();
    if (this.room.status === 'playing') {
      // 對局中斷線且尚未完成 → 寬限期後沒收（給重連機會）
      if (slot.finishTime == null) {
        const grace = this.graceMs('FORFEIT_GRACE_MS', 60_000);
        if (role === 'host') this.room.forfeitHostAt = now + grace;
        else this.room.forfeitGuestAt = now + grace;
      }
    } else if (this.room.status === 'waiting' || this.room.status === 'countdown') {
      if (role === 'guest') {
        await this.releaseGuest();
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
    await this.afterPresenceChange();
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
      this.room.deleteRoomAt,
      this.room.presenceCheckAt,
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
    if (this.room.deleteRoomAt != null && now >= this.room.deleteRoomAt) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    let started = false;
    let changed = false; // 有需要廣播的狀態變更

    if (this.room.countdownEndAt != null && now >= this.room.countdownEndAt && this.room.status === 'countdown') {
      const canStart =
        !!this.room.host?.ready &&
        !!this.room.guest?.ready &&
        this.room.host.online !== false &&
        this.room.guest.online !== false;
      this.room.status = canStart ? 'playing' : 'waiting';
      this.room.startAt = canStart ? now : null;
      if (!canStart) {
        if (this.room.host) this.room.host.ready = false;
        if (this.room.guest) this.room.guest.ready = false;
        this.room.countdownStartedAt = null;
      }
      this.room.countdownEndAt = null;
      this.room.presenceCheckAt = canStart ? now + PRESENCE_CHECK_MS : null;
      started = canStart;
      changed = true;
    } else if (this.room.countdownEndAt != null && now >= this.room.countdownEndAt) {
      this.room.countdownEndAt = null; // 狀態已離開 countdown，清掉殘留 deadline
      changed = true;
    }

    // presence 輪詢：playing 中偵測靜默斷線；非 playing 則停止輪詢
    if (this.room.presenceCheckAt != null && now >= this.room.presenceCheckAt) {
      if (this.room.status === 'playing') {
        const hostStale = this.checkSlotStale('host', now);
        const guestStale = this.checkSlotStale('guest', now);
        // 健康輪詢只在記憶體續期；presenceCheckAt 不需持久化（reload 由 onStart 補設）。
        // 故無狀態變更時不寫 storage 也不廣播，僅靠下面 rescheduleAlarm 續期 alarm。
        this.room.presenceCheckAt = now + PRESENCE_CHECK_MS;
        if (hostStale || guestStale) changed = true;
      } else {
        this.room.presenceCheckAt = null;
        changed = true;
      }
    }

    if (this.room.forfeitHostAt != null && now >= this.room.forfeitHostAt) {
      this.room.forfeitHostAt = null;
      if (this.room.host && this.room.host.finishTime == null) {
        this.room.host.finishTime = FORFEIT_TIME;
        this.room.host.stars = 0;
      }
      changed = true;
    }
    if (this.room.forfeitGuestAt != null && now >= this.room.forfeitGuestAt) {
      this.room.forfeitGuestAt = null;
      if (this.room.guest && this.room.guest.finishTime == null) {
        this.room.guest.finishTime = FORFEIT_TIME;
        this.room.guest.stars = 0;
      }
      changed = true;
    }
    // Both seats can be forfeited by alarms without either client sending a
    // final `finish` message. In that path handleFinish() never runs, so the
    // room must transition here or the UI shows a result whose rematch request
    // is rejected because the authoritative state is still `playing`.
    if (this.room.status === 'playing' && this.room.host?.finishTime != null && this.room.guest?.finishTime != null) {
      this.room.status = 'finished';
      this.room.presenceCheckAt = null;
      changed = true;
    }
    if (this.room.closeRoomAt != null && now >= this.room.closeRoomAt) {
      this.room.closeRoomAt = null;
      if (this.room.status === 'waiting' || this.room.status === 'countdown') {
        this.room.status = 'finished';
      }
      changed = true;
    }

    await this.rescheduleAlarm();
    if (started) {
      this.broadcast(JSON.stringify({ type: 'started', startAt: this.room.startAt! } satisfies ServerMsg));
    }
    if (changed) await this.commit();
    // 健康輪詢（無 changed）：alarm 已由 rescheduleAlarm 續期，不寫 storage、不廣播。
  }

  // ── helpers ────────────────────────────────────────────────

  // 寫入 storage（不廣播）。
  private async persist(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    this.room.updatedAt = now;
    if (this.room.status === 'finished' && this.room.deleteRoomAt == null) {
      this.room.deleteRoomAt = now + FINISHED_ROOM_TTL_MS;
    }
    await this.ctx.storage.put('room', this.room);
  }

  private async commit(): Promise<void> {
    await this.persist();
    await this.rescheduleAlarm();
    this.broadcastState();
  }

  // 廣播 roomState：單次序列化、不帶 per-conn you（client 自記 gs.duoRole）。
  // 角色由 create/join/hello 的 direct sendStateTo 帶 you 給該連線即可，省下逐連線重複序列化。
  private broadcastState(): void {
    if (!this.room) return;
    this.broadcast(JSON.stringify({ type: 'roomState', you: null, state: toPublic(this.room) } satisfies ServerMsg));
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

function lobbyCorsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  const origin = request.headers.get('Origin') || '';
  if (
    /^https:\/\/wulalainlondon\.github\.io$/.test(origin) ||
    /^https:\/\/sudokuzen-f2aa3(?:--[a-z0-9-]+)?\.web\.app$/.test(origin)
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

async function handleLobbyRequest(request: Request, env: Env): Promise<Response> {
  const headers = lobbyCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'GET') {
    headers.set('Allow', 'GET, OPTIONS');
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
  }
  const projectId = env.PROJECT_ID || '';
  if (!projectId) return Response.json({ error: 'project_not_configured' }, { status: 503, headers });
  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') || 20);
  const limit = Math.max(1, Math.min(MAX_LOBBY_PAGE_SIZE, Math.floor(requestedLimit) || 20));
  const params = new URLSearchParams({
    pageSize: String(limit),
    orderBy: 'updatedAt desc',
  });
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${LOBBY_COLLECTION}?${params}`;
  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) {
      console.error(JSON.stringify({ event: 'lobby_upstream_failed', status: upstream.status }));
      return Response.json({ error: 'lobby_unavailable' }, { status: 502, headers });
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: 'lobby_fetch_failed', error: String(error) }));
    return Response.json({ error: 'lobby_unavailable' }, { status: 502, headers });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/lobby') return handleLobbyRequest(request, env);
    return (
      (await routePartykitRequest(request, env, { locationHint: 'apac' })) || new Response('Not found', { status: 404 })
    );
  },
};
