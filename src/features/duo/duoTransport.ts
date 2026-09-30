import { editionDuoHost } from '../../platform/appEdition';
// Duo 連線傳輸層的 feature flag 與設定。
//
// 預設走新的 Cloudflare WebSocket 路徑（Firebase duo 後端已於遷移完成後移除）。
//   localStorage.duo_ws_host = '...'   // 可選：覆寫 worker host（預設線上 worker）
//   localStorage.duo_ws = '0'          // 顯式停用 WS（僅供除錯；Firebase 後端已不存在）

const FLAG_KEY = 'duo_ws';
const HOST_KEY = 'duo_ws_host';

export function isDuoWsEnabled(): boolean {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return true;
  try {
    return localStorage.getItem(FLAG_KEY) !== '0';
  } catch {
    return true;
  }
}

export function getDuoWsHost(): string {
  const DEFAULT_WS_HOST = editionDuoHost();
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return DEFAULT_WS_HOST;
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_WS_HOST;
  } catch {
    return DEFAULT_WS_HOST;
  }
}
