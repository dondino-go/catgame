/*
 * Bowl Bandit's service worker: lets the installed game open with no signal.
 *
 * Network first, cache as the fallback. With a connection the game always
 * loads the newest build, so a tester never plays a stale one; with no signal
 * (or a network slower than NET_TIMEOUT) it opens from the copy saved last
 * time. Bump VERSION only to throw the old cache away.
 */
const VERSION = 'bowl-bandit-v2';
const NET_TIMEOUT = 3000;
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  /* one cache entry per file, whatever query string asked for it */
  const key = url.origin + url.pathname;
  e.respondWith(caches.open(VERSION).then(cache => {
    const net = fetch(req, { cache: 'no-store' }).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    const slow = new Promise(resolve => setTimeout(resolve, NET_TIMEOUT));
    return Promise.race([net, slow.then(() => cache.match(key).then(c => c || net))])
      .catch(() => cache.match(key))
      .then(res => res || net);
  }));
});
