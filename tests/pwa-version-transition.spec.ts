// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { SK } from '../src/storage/keys';
import { enforceAppVersion, registerServiceWorkerUpdateFlow } from '../src/pwa/swUpdate';

vi.mock('../src/platform/nativeApp', () => ({ isNativeApp: () => false }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('observes an installation already underway when register resolves and retries activation until acknowledged', async () => {
  vi.useFakeTimers();
  vi.stubEnv('PROD', true);
  document.body.innerHTML = '';
  const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() });
  const registration = { installing: worker, waiting: null, update: vi.fn().mockResolvedValue(undefined) };
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {},
    register: vi.fn().mockResolvedValue(registration),
  });
  vi.stubGlobal('navigator', { serviceWorker });
  localStorage.setItem(SK.DUO_ACTIVE_ROOM_ID, 'still-playing');
  localStorage.setItem(SK.DUO_ACTIVE_ROLE, 'host');
  registerServiceWorkerUpdateFlow();
  await Promise.resolve();

  // updatefound fired before register resolved: only the existing installation
  // is available, and no later updatefound event will rescue the client.
  worker.state = 'installed';
  worker.dispatchEvent(new Event('statechange'));
  expect(worker.postMessage).not.toHaveBeenCalled();
  localStorage.removeItem(SK.DUO_ACTIVE_ROOM_ID);
  await vi.advanceTimersByTimeAsync(1500);
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  await vi.advanceTimersByTimeAsync(1500);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  worker.state = 'activated';
  await vi.advanceTimersByTimeAsync(1500);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it('records the loaded release without unregistering workers or deleting offline caches', async () => {
  vi.stubEnv('PROD', true);
  const getRegistrations = vi.fn();
  const keys = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });
  vi.stubGlobal('caches', { keys });
  localStorage.setItem(SK.APP_VERSION, 'old');
  expect(await enforceAppVersion('new')).toBe(false);
  expect(localStorage.getItem(SK.APP_VERSION)).toBe('new');
  expect(getRegistrations).not.toHaveBeenCalled();
  expect(keys).not.toHaveBeenCalled();
});
