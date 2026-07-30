import { isNativeApp } from '../../platform/nativeApp';
import { SK } from '../../storage/keys';
import { openDuoLobby } from './duoLobby';

const LEVEL_SCREEN_READY_EVENT = 'sudoku:level-screen-ready';
let _duoAutoResumeScheduled = false;

function isStandalonePwa(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosNavigator.standalone === true;
}

function hasStoredDuoSession(): boolean {
  try {
    const roomId = localStorage.getItem(SK.DUO_ACTIVE_ROOM_ID);
    const role = localStorage.getItem(SK.DUO_ACTIVE_ROLE);
    return !!roomId && (role === 'host' || role === 'guest');
  } catch {
    return false;
  }
}

function ensureResumeOverlay(): HTMLElement {
  const existing = document.getElementById('duo-resume-overlay');
  if (existing) return existing;
  const overlay = document.createElement('div');
  overlay.id = 'duo-resume-overlay';
  overlay.className = 'duo-resume-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="duo-resume-card">
      <span class="duo-resume-spinner" aria-hidden="true"></span>
      <strong id="duo-resume-title">正在返回對局</strong>
      <span id="duo-resume-detail">棋盤與進度會從房間同步</span>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function finishResumeOverlay(message: string, state: 'connected' | 'ended'): void {
  const overlay = document.getElementById('duo-resume-overlay');
  if (!overlay) return;
  overlay.classList.add(state);
  const title = overlay.querySelector<HTMLElement>('#duo-resume-title');
  const detail = overlay.querySelector<HTMLElement>('#duo-resume-detail');
  if (title) title.textContent = message;
  if (detail) detail.textContent = state === 'connected' ? '已接回原本的房間' : '已為你開啟對戰大廳';
  window.setTimeout(() => overlay.remove(), state === 'connected' ? 450 : 900);
}

/**
 * Start loading the expensive resume dependencies as soon as bootstrap begins.
 * The actual navigation waits for the level screen's first stable paint.
 */
export function prewarmDuoResume(): void {
  if (!hasStoredDuoSession()) return;
  void import('./duoRoom').catch(() => null);
  void import('../../firebase/runtime').then((runtime) => runtime.getFirebaseIdToken()).catch(() => null);
}

async function resumeStoredDuoSession(): Promise<void> {
  ensureResumeOverlay();
  try {
    await openDuoLobby();
    const { getActiveDuoRoomId } = await import('./duoRoom');
    finishResumeOverlay(
      getActiveDuoRoomId() ? '已恢復對局' : '原對局已結束',
      getActiveDuoRoomId() ? 'connected' : 'ended',
    );
  } catch (error) {
    console.warn('[duo] automatic resume failed:', error);
    finishResumeOverlay('暫時無法恢復對局', 'ended');
  }
}

export function scheduleDuoAutoResume(): void {
  if (_duoAutoResumeScheduled || isNativeApp() || !isStandalonePwa() || !hasStoredDuoSession()) return;
  _duoAutoResumeScheduled = true;
  prewarmDuoResume();
  window.addEventListener(
    LEVEL_SCREEN_READY_EVENT,
    () => {
      void resumeStoredDuoSession();
    },
    { once: true },
  );
}

export function notifyLevelScreenReady(): void {
  window.dispatchEvent(new CustomEvent(LEVEL_SCREEN_READY_EVENT));
}
