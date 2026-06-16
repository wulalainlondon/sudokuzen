// Duo 連線傳輸層的 feature flag 與設定。
//
// 預設走舊的 Firebase 路徑。要切換到新的 Cloudflare WebSocket 路徑，
// 在瀏覽器 console 設定（不需重新部署）：
//   localStorage.duo_ws = '1'          // 啟用 WebSocket 路徑
//   localStorage.duo_ws_host = '...'   // 可選：覆寫 worker host（預設線上 worker）
// 切回舊路徑：localStorage.removeItem('duo_ws')

const DEFAULT_WS_HOST = 'duo-party.wulalainlondon.workers.dev';
const FLAG_KEY = 'duo_ws';
const HOST_KEY = 'duo_ws_host';

export function isDuoWsEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function getDuoWsHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_WS_HOST;
  } catch {
    return DEFAULT_WS_HOST;
  }
}
