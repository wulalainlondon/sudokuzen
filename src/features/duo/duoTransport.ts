// Duo 連線傳輸層的 feature flag 與設定。
//
// 預設走新的 Cloudflare WebSocket 路徑（Firebase duo 後端已於遷移完成後移除）。
//   localStorage.duo_ws_host = '...'   // 可選：覆寫 worker host（預設線上 worker）
//   localStorage.duo_ws = '0'          // 顯式停用 WS（僅供除錯；Firebase 後端已不存在）

const DEFAULT_WS_HOST = 'duo-party.wulalainlondon.workers.dev';
const FLAG_KEY = 'duo_ws';
const HOST_KEY = 'duo_ws_host';

export function isDuoWsEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) !== '0';
  } catch {
    return true;
  }
}

export function getDuoWsHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_WS_HOST;
  } catch {
    return DEFAULT_WS_HOST;
  }
}
