/*
 * Bowl Bandit's service worker: lets the installed game open with no signal.
 *
 * Network first, cache as the fallback. With a connection the game always
 * loads the newest build, so a tester never plays a stale one; with no signal
 * (or a network slower than NET_TIMEOUT) it opens from the copy saved last
 * time. Bump VERSION only to throw the old cache away.
 */
const VERSION = 'bowl-bandit-v4';
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
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

/* 'reload' so the first fill can't come out of the browser's own HTTP cache:
   GitHub Pages serves these files with ten minutes of max-age, and an install
   that quietly saved ten-minute-old files would be stale from birth. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The game font comes from Google Fonts: its stylesheet and font files are
   kept too, so offline text still uses Baloo 2 rather than a fallback face
   with different widths. They never change, so the cache answers first. */
const FONT_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  /* The game's update check asks for src/version.js?bbfresh=... to find out
     whether the build it is running is still the newest one. Never answer
     that from the cache: a stale copy of the game would be told it is current
     and would stay stale for as long as the install lasts. */
  if (url.searchParams.has('bbfresh')) return;
  if (FONT_HOSTS.includes(url.origin)) {
    e.respondWith(caches.open(VERSION).then(cache => cache.match(req).then(hit =>
      hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
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
