import { APP_VERSION } from '../config/version';
import { isPwaUpdateBlocked } from '../pwa/updateSafety';
import { getFirebaseSdkFailureUrl, hasFirebaseSdkLoadFailure } from './runtime';

const RELOAD_KEY = 'sudoku_firebase_sdk_reload';
const RETURN_KEY = 'sudoku_firebase_return_to_duo';

// A failed native import can remain rejected in the browser module registry.
// Only an explicit Duo entry may refresh that registry, after the failed asset
// is reachable again and no active game/room can be interrupted.
export async function recoverFirebaseSdkForDuo(): Promise<boolean> {
  const url = getFirebaseSdkFailureUrl();
  if (!hasFirebaseSdkLoadFailure() || !navigator.onLine || isPwaUpdateBlocked()) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === APP_VERSION) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let reachable = false;
    try {
      let urls: string[] = url ? [url] : [];
      if (!url) {
        const base = new URL(import.meta.env.BASE_URL, window.location.origin);
        const manifest = await fetch(new URL('firebase-sdk-manifest.json', base), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!manifest.ok) return false;
        const { files } = (await manifest.json()) as { files?: string[] };
        if (!Array.isArray(files) || !files.length || !files.every((file) => /^assets\/[\w.-]+\.js$/.test(file)))
          return false;
        urls = files.map((file) => new URL(file, base).href);
      }
      const available = await Promise.all(
        urls.map(async (asset) => {
          const response = await fetch(asset, { cache: 'reload', signal: controller.signal });
          if (!response.ok || !/javascript/.test(response.headers.get('content-type') || '')) return false;
          await response.arrayBuffer();
          return true;
        }),
      );
      reachable = available.every(Boolean);
    } finally {
      clearTimeout(timer);
    }
    if (!reachable || isPwaUpdateBlocked()) return false;
    sessionStorage.setItem(RELOAD_KEY, APP_VERSION);
    sessionStorage.setItem(RETURN_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function scheduleFirebaseDuoReturn(openDuo: () => Promise<void>): void {
  try {
    const requested = Number(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    if (!requested || Date.now() - requested > 60_000 || isPwaUpdateBlocked()) return;
    window.addEventListener(
      'sudoku:level-screen-ready',
      () => {
        void openDuo();
      },
      { once: true },
    );
  } catch {
    /* unavailable storage must not prevent boot */
  }
}
