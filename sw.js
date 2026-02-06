const CACHE_VERSION = '2026.02.06.2';
const CACHE_NAME = `sudoku-zen-${CACHE_VERSION}`; // 更新版本號
const ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'levels.js',
    'firebase-config.js',
    'icon-192.png',
    'icon-512.png',
    'apple-touch-icon.png'
];

// 1. 安裝階段：強制跳過等待，讓新版本立刻生效
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching assets...');
            // 使用 map 包裝，避免單一檔案失敗導致全部失敗 (可選)
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// 2. 激活階段：清理舊版本快取 (非常重要！)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 讓 SW 立刻接管所有頁面
    );
});

// 3. 攔截請求
self.addEventListener('fetch', (event) => {
    // 針對 Google Fonts 或跨域資源的特殊處理
    event.respondWith(
        caches.match(event.request).then((response) => {
            // 如果快取中有，直接回傳；否則去網路抓
            return response || fetch(event.request).then((networkResponse) => {
                // 如果是第三方資源 (如 Google Fonts)，可以選擇動態存入快取
                if (event.request.url.includes('googleapis') || event.request.url.includes('gstatic')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            });
        }).catch(() => {
            // 如果網路和快取都失敗（完全斷網且沒快取到），可以回傳一個備用的內容
        })
    );
});
