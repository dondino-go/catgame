/*
 * Bowl Bandit's service worker: lets the installed game open with no signal.
 *
 * Stale-while-revalidate: the game starts instantly from the cache, and each
 * launch quietly fetches fresh copies for next time. So a playtester always
 * gets the latest build one launch after it is pushed, without anyone having
 * to bump a version number. Bump VERSION only to throw the old cache away.
 */
const VERSION = 'bowl-bandit-v1';
const SHELL = [
  './mobile.html',
  './src/core.js',
  './src/game.js',
  './src/version.js',
  './src/style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
