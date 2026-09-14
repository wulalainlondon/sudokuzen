import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DATA_CACHE_NAME } from '../src/pwa/cachePolicy';

const scope = 'https://example.test/sudokuzen/';
const absolute = (file: string) => new URL(file, scope).href;
const key = (request: Request | string) => (typeof request === 'string' ? absolute(request) : request.url);
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

function harness() {
  const state = { offline: false, hash: 'normal-one', value: 1, badData: false };
  const requests: string[] = [];
  const network = async (request: Request | string) => {
    const url = key(request);
    requests.push(url);
    if (state.offline) throw new Error('offline');
    const path = new URL(url).pathname;
    if (path.endsWith('/data/manifest.json'))
      return json({ version: 'all-data', shards: { normal: { file: 'normal.json', hash: state.hash } } });
    if (path.endsWith('/normal.json'))
      return state.badData
        ? new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } })
        : json({ value: state.value });
    if (path.endsWith('.json')) return json({});
    if (path.endsWith('.js'))
      return new Response('/* javascript */', { headers: { 'content-type': 'application/javascript' } });
    if (path.endsWith('.css')) return new Response('/* stylesheet */', { headers: { 'content-type': 'text/css' } });
    if (path.endsWith('.png')) return new Response('png', { headers: { 'content-type': 'image/png' } });
    return new Response('<main>offline shell</main>', { headers: { 'content-type': 'text/html' } });
  };
  class MemoryCache {
    entries = new Map<string, Response>();
    async match(request: Request | string) {
      return this.entries.get(key(request))?.clone();
    }
    async put(request: Request | string, response: Response) {
      this.entries.set(key(request), response.clone());
    }
    async delete(request: Request | string) {
      return this.entries.delete(key(request));
    }
    async keys() {
      return [...this.entries.keys()].map((url) => new Request(url));
    }
    async addAll(values: Request[]) {
      const responses = await Promise.all(values.map(network));
      if (responses.some((response) => !response.ok)) throw new Error('precache failed');
      await Promise.all(values.map((request, index) => this.put(request, responses[index])));
    }
  }
  const stores = new Map<string, MemoryCache>();
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name)!;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: Request | string) {
      for (const cache of stores.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
  };
  const worker = (version: string) => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>();
    const source = fs
      .readFileSync('src/pwa/sw.template.js', 'utf8')
      .replaceAll('__APP_VERSION__', version)
      .replaceAll('__DATA_CACHE_NAME__', DATA_CACHE_NAME)
      .replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(['assets/app-A.js', 'assets/app-A.css']));
    vm.runInNewContext(source, {
      URL,
      Request,
      Response,
      AbortController,
      setTimeout,
      clearTimeout,
      caches,
      fetch: network,
      self: {
        registration: { scope },
        location: { origin: new URL(scope).origin },
        clients: { claim: async () => {} },
        addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) =>
          listeners.set(name, listener),
      },
    });
    return {
      async lifecycle(name: string) {
        let work = Promise.resolve<unknown>(undefined);
        listeners.get(name)!({
          waitUntil: (promise: Promise<unknown>) => {
            work = promise;
          },
        });
        await work;
      },
      async request(file: string, init?: RequestInit, navigate = false) {
        const request = new Request(absolute(file), init);
        if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
        let response: Promise<Response> | undefined;
        listeners.get('fetch')!({
          request,
          respondWith: (value: Promise<Response>) => {
            response = value;
          },
        });
        return response ? await response : undefined;
      },
    };
  };
  return { state, requests, caches, worker };
}

describe('PWA offline shell and persistent content cache', () => {
  it('caches the real first puzzle and hashed shell assets, without legacy level/style downloads', async () => {
    const h = harness();
    const worker = h.worker('v1');
    await worker.lifecycle('install');
    expect(h.requests.some((url) => url.endsWith('/levels.js'))).toBe(false);
    expect(h.requests.some((url) => url.endsWith('/style.css'))).toBe(false);
    expect(await (await h.caches.open(DATA_CACHE_NAME)).match('data/normal.json?v=normal-one')).toBeDefined();
    h.state.offline = true;
    expect((await worker.request('', undefined, true))?.status).toBe(200);
    expect((await worker.request('assets/app-A.js'))?.status).toBe(200);
    expect(await (await worker.request('data/normal.json?v=normal-one'))?.json()).toEqual({ value: 1 });
  });

  it('reuses unchanged content across releases, retires only old app shells, and fetches changed hashes', async () => {
    const h = harness();
    await h.caches.open('unrelated-app');
    const first = h.worker('v1');
    await first.lifecycle('install');
    await first.lifecycle('activate');
    const second = h.worker('v2');
    await second.lifecycle('install');
    await second.lifecycle('activate');
    expect(h.requests.filter((url) => url.includes('/normal.json'))).toHaveLength(1);
    expect(h.requests.filter((url) => url.endsWith('/app-A.js'))).toHaveLength(1);
    expect(await h.caches.keys()).toEqual(expect.arrayContaining(['unrelated-app', DATA_CACHE_NAME, 'sudoku-zen-v2']));
    expect(await h.caches.keys()).not.toContain('sudoku-zen-v1');
    h.state.hash = 'normal-two';
    h.state.value = 2;
    const third = h.worker('v3');
    await third.lifecycle('install');
    await third.lifecycle('activate');
    expect(h.requests.filter((url) => url.includes('/normal.json'))).toHaveLength(2);
    h.state.offline = true;
    expect(await (await third.request('data/normal.json?v=normal-one'))?.json()).toEqual({ value: 1 });
    expect(await (await third.request('data/normal.json?v=normal-two'))?.json()).toEqual({ value: 2 });
  });

  it('never caches an HTML fallback as a puzzle, and can recover on the next request', async () => {
    const h = harness();
    const worker = h.worker('v1');
    h.state.badData = true;
    await expect(worker.request('data/normal.json?v=normal-one')).rejects.toThrow('Invalid puzzle data');
    expect(await (await h.caches.open(DATA_CACHE_NAME)).keys()).toHaveLength(0);
    h.state.badData = false;
    expect(await (await worker.request('data/normal.json?v=normal-one'))?.json()).toEqual({ value: 1 });
  });

  it('leaves API writes, external requests and media ranges outside the cache handler', async () => {
    const h = harness();
    const worker = h.worker('v1');
    expect(await worker.request('api/save', { method: 'POST' })).toBeUndefined();
    expect(await worker.request('https://other.test/file.js')).toBeUndefined();
    expect(await worker.request('api/status')).toBeUndefined();
    expect(await worker.request('sounds/file.ogg', { headers: { range: 'bytes=0-10' } })).toBeUndefined();
    expect(h.requests).toHaveLength(0);
  });

  it('bounds retained puzzle versions', async () => {
    const h = harness();
    const cache = await h.caches.open(DATA_CACHE_NAME);
    for (let i = 0; i < 256; i++) await cache.put(`data/old.json?v=${i}`, json({ i }));
    await h.worker('v1').request('data/normal.json?v=normal-one');
    expect(await cache.keys()).toHaveLength(256);
    expect(await cache.match('data/normal.json?v=normal-one')).toBeDefined();
  });
});
