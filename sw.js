const CACHE_VERSION = '2026.09.23-V1';
const CACHE_NAME = `sudoku-zen-${CACHE_VERSION}`;
const DATA_CACHE_NAME = 'sudoku-zen-data-v1';
const DATA_CACHE_LIMIT = 256;
const BUILD_ASSETS = /* __BUILD_ASSETS__ */ [];
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'data/manifest.json',
  'teach/manifest.json',
  'firebase-config.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];
const scopeUrl = self.registration.scope;
const scopePath = new URL(scopeUrl).pathname;
const assetUrl = (file) => new URL(file, scopeUrl).href;

function isDataShard(url) {
  const relative = url.pathname.slice(scopePath.length);
  return /^(data|teach)\/[^/]+\.json$/.test(relative)
    && !relative.endsWith('/manifest.json')
    && url.searchParams.has('v');
}

function isBuildAsset(url) {
  return url.pathname.startsWith(`${scopePath}assets/`) && /\.(js|css)$/.test(url.pathname);
}

async function remember(cache, request, response) {
  try { await cache.put(request, response.clone()); } catch { /* storage may be full */ }
}

async function dataResponse(request, required = false) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Invalid puzzle data response');
  }
  if (required) await cache.put(request, response.clone());
  else await remember(cache, request, response);
  // Retain several content versions for old tabs/offline play, with a bound
  // on storage growth. This cache is independent of the application release.
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - DATA_CACHE_LIMIT)).map(key => cache.delete(key)));
  return response;
}

async function immutableResponse(request, required = false) {
  const cache = await caches.open(CACHE_NAME);
  // Content-hashed assets can be reused from the previous release's cache
  // while the new worker installs, before activate retires that old shell.
  const cached = await cache.match(request) || await caches.match(request);
  if (cached?.ok && !cached.headers.get('content-type')?.includes('text/html')) {
    if (required) await cache.put(request, cached.clone());
    else await remember(cache, request, cached);
    return cached;
  }
  const response = await fetch(request);
  const contentType = response.headers.get('content-type') || '';
  const url = new URL(request.url);
  const valid = response.ok && !contentType.includes('text/html');
  if (!valid) {
    if (required) throw new Error(`Missing offline asset: ${url.pathname}`);
    return response;
  }
  if (required) await cache.put(request, response.clone());
  else await remember(cache, request, response);
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await remember(cache, request, response);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const index = await cache.match(assetUrl('index.html'));
      if (index) return index;
    }
    return Response.error();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map(file => new Request(assetUrl(file), { cache: 'reload' })));
    // The page may load its first shard before this worker controls it. Warm
    // the real normal shard so that the very first installed visit works offline.
    const manifestResponse = await cache.match(assetUrl('data/manifest.json'));
    const manifest = await manifestResponse?.json();
    const normal = manifest?.shards?.normal;
    if (normal?.file) {
      const url = new URL(`data/${normal.file}`, scopeUrl);
      url.searchParams.set('v', normal.hash || manifest.version);
      await dataResponse(new Request(url), true);
    }
    await Promise.all(BUILD_ASSETS.map(file => immutableResponse(new Request(assetUrl(file), { priority: 'low' }), true)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('sudoku-zen-')
      && name !== CACHE_NAME && name !== DATA_CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Leave APIs, external requests and media range requests to the browser.
  if (request.method !== 'GET' || url.origin !== self.location.origin
    || !url.pathname.startsWith(scopePath) || request.headers.has('range')
    || url.pathname.endsWith('/sw.js')) return;

  if (isDataShard(url)) {
    event.respondWith(dataResponse(request));
  } else if (isBuildAsset(url)) {
    event.respondWith(immutableResponse(request));
  } else if (request.mode === 'navigate' || url.pathname.endsWith('/')
    || /\.(js|css)$/.test(url.pathname) || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(networkFirst(request));
  } else if (/\.(png|jpe?g|webp|svg|ico|woff2?|ogg|mp3)$/.test(url.pathname)) {
    // These unhashed static assets remain scoped to this application release.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await remember(cache, request, response);
      return response;
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GET_VERSION') event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
});
