const CACHE = 'trackingtask-v3';
const ASSETS = [
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/auth.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // API calls — always network, never cache
  if (e.request.url.includes('workers.dev') || e.request.url.includes('/api/')) {
    return;
  }
  // Network-first so deployed updates are visible immediately; cache is only an offline fallback.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
