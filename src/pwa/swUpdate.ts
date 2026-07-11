import { SK } from '../storage/keys';
import { isNativeApp } from '../platform/nativeApp';

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

function isGameActivelyPlaying(): boolean {
  const gameContainer = document.querySelector('.game-container') as HTMLElement | null;
  if (!gameContainer || gameContainer.style.display !== 'flex') return false;

  const pauseScreen = document.getElementById('pause-screen') as HTMLElement | null;
  if (pauseScreen?.style.display === 'flex') return false;

  const gameOverOverlay = document.getElementById('overlay') as HTMLElement | null;
  if (gameOverOverlay?.style.display === 'flex') return false;

  const winCelebration = document.getElementById('win-celebration') as HTMLElement | null;
  if (winCelebration?.style.display === 'flex') return false;

  return true;
}

export function enforceAppVersion(appVersion: string): Promise<boolean> {
  if (!import.meta.env.PROD) return Promise.resolve(false);
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
  let refreshPollTimer: number | null = null;

  const tryRefresh = () => {
    if (refreshing || !pendingRefresh) return;
    if (isGameActivelyPlaying()) return;
    refreshing = true;
    pendingRefresh = false;
    if (refreshPollTimer !== null) {
      clearInterval(refreshPollTimer);
      refreshPollTimer = null;
    }
    safeReload();
  };

  const requestRefresh = () => {
    pendingRefresh = true;
    tryRefresh();
    if (refreshPollTimer === null) {
      refreshPollTimer = window.setInterval(() => {
        tryRefresh();
      }, 1500);
    }
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    requestRefresh();
  });

  window.addEventListener('visibilitychange', tryRefresh);
  window.addEventListener('focus', tryRefresh);

  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting) applyUpdateImmediately(reg.waiting);

      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdateImmediately(installingWorker);
          }
        };
      };

      // Check immediately when page boots, then keep checking in the background.
      reg.update();
      setInterval(() => reg.update(), 1000 * 60 * 60);
    })
    .catch((err) => console.error('SW init fail:', err));
}

function applyUpdateImmediately(worker: ServiceWorker): void {
  worker.postMessage({ type: 'SKIP_WAITING' });
}
