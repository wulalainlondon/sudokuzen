import { SK } from '../storage/keys';
import { isNativeApp } from '../platform/nativeApp';
import { isPwaUpdateBlocked } from './updateSafety';

const RELOAD_GUARD_KEY = 'sudoku_reload_guard_ts';
const RELOAD_GUARD_MS = 15000;
const RELOAD_ONCE_KEY = 'sudoku_reload_once';

function canReloadNow(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') return false;
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
    if (Number.isFinite(last) && now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
    sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

function safeReload(): void {
  if (!canReloadNow()) return;
  window.location.reload();
}

export function enforceAppVersion(appVersion: string): Promise<boolean> {
  if (!import.meta.env.PROD) return Promise.resolve(false);
  if (isNativeApp()) return Promise.resolve(false);
  const stored = localStorage.getItem(SK.APP_VERSION);
  if (stored === appVersion) return Promise.resolve(false);

  localStorage.setItem(SK.APP_VERSION, appVersion);
  // Clear the reload-once guard so this forced update always goes through,
  // even if a SW-triggered safeReload already fired in this session.
  try {
    sessionStorage.removeItem(RELOAD_ONCE_KEY);
  } catch {
    /* ignore */
  }

  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => {
        if ('caches' in window) {
          return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        }
      })
      .then(() => {
        safeReload();
        return true;
      })
      .catch(() => {
        safeReload();
        return true;
      });
  }

  safeReload();
  return Promise.resolve(true);
}

export function registerServiceWorkerUpdateFlow(): void {
  if (!import.meta.env.PROD) return;
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  let pendingRefresh = false;
  let waitingWorker: ServiceWorker | null = null;
  let refreshPollTimer: number | null = null;

  const ensureRefreshPoll = () => {
    if (refreshPollTimer !== null) return;
    refreshPollTimer = window.setInterval(() => {
      tryApplyUpdate();
      tryRefresh();
    }, 1500);
  };

  const stopRefreshPollIfIdle = () => {
    if (refreshPollTimer === null || waitingWorker || pendingRefresh) return;
    clearInterval(refreshPollTimer);
    refreshPollTimer = null;
  };

  const tryApplyUpdate = () => {
    if (!waitingWorker || isPwaUpdateBlocked()) return;
    const worker = waitingWorker;
    waitingWorker = null;
    worker.postMessage({ type: 'SKIP_WAITING' });
    stopRefreshPollIfIdle();
  };

  const requestApplyUpdate = (worker: ServiceWorker) => {
    waitingWorker = worker;
    tryApplyUpdate();
    ensureRefreshPoll();
  };

  const tryRefresh = () => {
    if (refreshing || !pendingRefresh) return;
    if (isPwaUpdateBlocked()) return;
    refreshing = true;
    pendingRefresh = false;
    stopRefreshPollIfIdle();
    safeReload();
  };

  const requestRefresh = () => {
    pendingRefresh = true;
    tryRefresh();
    ensureRefreshPoll();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    requestRefresh();
  });

  window.addEventListener('visibilitychange', tryRefresh);
  window.addEventListener('focus', tryRefresh);

  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting) requestApplyUpdate(reg.waiting);

      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestApplyUpdate(installingWorker);
          }
        };
      };

      // Check immediately when page boots, then keep checking in the background.
      reg.update();
      setInterval(() => reg.update(), 1000 * 60 * 60);
    })
    .catch((err) => console.error('SW init fail:', err));
}
