import { SK } from '../storage/keys';
import { APP_VERSION } from '../config/version';
import { isNativeApp } from '../platform/nativeApp';
import { isPwaUpdateBlocked } from './updateSafety';

const RELOAD_GUARD_KEY = 'sudoku_reload_guard_ts';
const RELOAD_GUARD_MS = 15000;
const RELOAD_ONCE_KEY = 'sudoku_reload_once';

function canReloadNow(targetVersion: string): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === targetVersion) return false;
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
    if (Number.isFinite(last) && now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
    sessionStorage.setItem(RELOAD_ONCE_KEY, targetVersion);
    return true;
  } catch {
    return true;
  }
}

function safeReload(targetVersion: string): boolean {
  if (!canReloadNow(targetVersion)) return false;
  window.location.reload();
  return true;
}

function workerVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    const finish = (version: string | null) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(version);
    };
    const timer = setTimeout(() => finish(null), 1000);
    channel.port1.onmessage = (event) => finish(typeof event.data?.version === 'string' ? event.data.version : null);
    try {
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

export function enforceAppVersion(appVersion: string): Promise<boolean> {
  if (!import.meta.env.PROD) return Promise.resolve(false);
  if (isNativeApp()) return Promise.resolve(false);
  const stored = localStorage.getItem(SK.APP_VERSION);
  if (stored === appVersion) return Promise.resolve(false);

  // The HTML and its hashed modules already describe this release. Let the
  // worker's install/activate flow replace the shell only after offline assets
  // are ready; unregistering here could destroy the very cache we just loaded.
  localStorage.setItem(SK.APP_VERSION, appVersion);
  return Promise.resolve(false);
}

export function registerServiceWorkerUpdateFlow(): void {
  if (!import.meta.env.PROD) return;
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  let pendingRefresh: string | null = null;
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
    if (!waitingWorker) return;
    const worker = waitingWorker;
    if (worker.state !== 'installed') {
      waitingWorker = null;
      stopRefreshPollIfIdle();
      return;
    }
    if (isPwaUpdateBlocked()) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  const requestApplyUpdate = (worker: ServiceWorker) => {
    waitingWorker = worker;
    tryApplyUpdate();
    ensureRefreshPoll();
  };

  const tryRefresh = () => {
    if (refreshing || !pendingRefresh) return;
    if (isPwaUpdateBlocked()) return;
    if (!safeReload(pendingRefresh)) return;
    refreshing = true;
    pendingRefresh = null;
    stopRefreshPollIfIdle();
  };

  const requestRefresh = (version: string) => {
    pendingRefresh = version;
    tryRefresh();
    ensureRefreshPoll();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    void workerVersion(controller).then((version) => {
      // First installation, or a page already fetched from the new release,
      // needs no second boot. A genuinely newer worker still uses the game gate.
      if (version !== APP_VERSION) requestRefresh(version || `unknown:${APP_VERSION}`);
    });
  });

  window.addEventListener('visibilitychange', tryRefresh);
  window.addEventListener('focus', tryRefresh);

  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting) requestApplyUpdate(reg.waiting);

      const observeInstalling = (installingWorker: ServiceWorker | null) => {
        if (!installingWorker) return;
        const checkState = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestApplyUpdate(installingWorker);
          }
        };
        installingWorker.addEventListener('statechange', checkState);
        checkState();
      };
      reg.onupdatefound = () => observeInstalling(reg.installing);
      // register() may resolve after updatefound has already fired.
      observeInstalling(reg.installing);

      // Check immediately when page boots, then keep checking in the background.
      const checkForUpdate = () => {
        void reg.update().catch(() => {});
      };
      checkForUpdate();
      window.addEventListener('online', checkForUpdate);
      setInterval(checkForUpdate, 1000 * 60 * 60);
    })
    .catch((err) => console.error('SW init fail:', err));
}
