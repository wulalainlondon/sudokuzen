import { isNativeApp } from './nativeApp';

let _hapticsModule: Promise<typeof import('@capacitor/haptics')> | null = null;

function loadHaptics(): Promise<typeof import('@capacitor/haptics')> {
  if (!_hapticsModule) _hapticsModule = import('@capacitor/haptics');
  return _hapticsModule;
}

/**
 * Cross-platform vibration. Web keeps navigator.vibrate (Android browsers);
 * native shell maps patterns onto UIImpactFeedbackGenerator via Capacitor
 * Haptics, since WKWebView has no navigator.vibrate.
 * Pattern arrays follow the Vibration API convention: [vibrate, pause, ...].
 */
export function vibrate(pattern: number | number[]): void {
  if (isNativeApp()) {
    void playNative(pattern);
    return;
  }
  if (navigator.vibrate) navigator.vibrate(pattern);
}

async function playNative(pattern: number | number[]): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await loadHaptics();
    const segments = Array.isArray(pattern) ? pattern : [pattern];
    let offset = 0;
    for (let i = 0; i < segments.length; i += 2) {
      const duration = segments[i];
      const style = duration <= 8 ? ImpactStyle.Light : duration <= 25 ? ImpactStyle.Medium : ImpactStyle.Heavy;
      if (offset === 0) void Haptics.impact({ style });
      else setTimeout(() => void Haptics.impact({ style }), offset);
      offset += duration + (segments[i + 1] ?? 0);
    }
  } catch {
    // Haptics unavailable (e.g. plugin missing) — feedback is best-effort.
  }
}
