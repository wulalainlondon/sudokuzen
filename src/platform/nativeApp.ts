/**
 * True when running inside the Capacitor native shell (iOS/Android app).
 * Web assets ship with the app binary there, so PWA update machinery
 * (service worker, version-enforced reload) must not run.
 */
export function isNativeApp(): boolean {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform === 'function') return cap.isNativePlatform();
  return window.location.protocol === 'capacitor:';
}
