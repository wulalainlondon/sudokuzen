export function enforceAppVersion(appVersion: string): Promise<boolean> {
  const key = 'sudoku_app_version';
  const stored = localStorage.getItem(key);
  if (stored === appVersion) return Promise.resolve(false);

  localStorage.setItem(key, appVersion);
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => {
        if ('caches' in window) {
          return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        }
      })
      .then(() => {
        window.location.reload();
        return true;
      })
      .catch(() => {
        window.location.reload();
        return true;
      });
  }

  window.location.reload();
  return Promise.resolve(true);
}

export function registerServiceWorkerUpdateFlow(): void {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting) offerUpdate(reg.waiting);

    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      if (!installingWorker) return;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          offerUpdate(installingWorker);
        }
      };
    };

    setInterval(() => reg.update(), 1000 * 60 * 60);
  }).catch((err) => console.error('SW init fail:', err));
}

function offerUpdate(worker: ServiceWorker): void {
  setTimeout(() => {
    if (confirm('發現新的版本與關卡！是否立即更新以體驗最新內容？')) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, 1000);
}
