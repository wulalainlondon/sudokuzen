const CACHE_VERSION = '2026.04.06-V4';
const CACHE_NAME = `sudoku-zen-${CACHE_VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'levels.js',
  'teach/manifest.json',
  'firebase-config.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cache) => cache.startsWith('sudoku-zen-') && cache !== CACHE_NAME)
          .map((cache) => caches.delete(cache))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache the service worker itself
  if (url.pathname.endsWith('sw.js')) return;

  // Hashed Vite bundles: cache-first (hash change = new URL, no stale risk)
  const isHashedAsset = /\/assets\/[^/]+-[a-f0-9]{8,}\.(js|css)$/.test(url.pathname);
  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Entry points + unhashed files: network-first (these control which bundle version loads)
  const isNetworkFirst = url.pathname.endsWith('/')
    || url.pathname.endsWith('index.html')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('teach/manifest.json')
    || url.pathname.endsWith('firebase-config.js')
    || url.pathname.endsWith('manifest.json');

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Everything else (images, data shards, fonts): cache-first
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((networkResponse) => {
          if (url.origin === self.location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
