// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../src/config/version';
const guards = vi.hoisted(() => ({ blocked: vi.fn(), failed: vi.fn(), url: vi.fn() }));
vi.mock('../src/pwa/updateSafety', () => ({ isPwaUpdateBlocked: guards.blocked }));
vi.mock('../src/firebase/runtime', () => ({
  hasFirebaseSdkLoadFailure: guards.failed,
  getFirebaseSdkFailureUrl: guards.url,
}));
import { recoverFirebaseSdkForDuo, scheduleFirebaseDuoReturn } from '../src/firebase/sdkRecovery';
beforeEach(() => {
  sessionStorage.clear();
  guards.blocked.mockReturnValue(false);
  guards.failed.mockReturnValue(true);
  guards.url.mockReturnValue('http://localhost/assets/sdk.js');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it('does not refresh an active game or active Duo seat', async () => {
  guards.blocked.mockReturnValue(true);
  expect(await recoverFirebaseSdkForDuo()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not loop after a reload already attempted this version', async () => {
  sessionStorage.setItem('sudoku_firebase_sdk_reload', APP_VERSION);
  expect(await recoverFirebaseSdkForDuo()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not reload while the failed SDK asset is still unavailable', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('unavailable', { status: 503 }));
  expect(await recoverFirebaseSdkForDuo()).toBe(false);
  expect(sessionStorage.getItem('sudoku_firebase_return_to_duo')).toBeNull();
});
it('returns to Duo only after the home screen is ready and consumes the intent', () => {
  sessionStorage.setItem('sudoku_firebase_return_to_duo', String(Date.now()));
  const open = vi.fn().mockResolvedValue(undefined);
  scheduleFirebaseDuoReturn(open);
  expect(open).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('sudoku:level-screen-ready'));
  window.dispatchEvent(new Event('sudoku:level-screen-ready'));
  expect(open).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('sudoku_firebase_return_to_duo')).toBeNull();
});
