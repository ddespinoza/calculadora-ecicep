/* Offline copy of ONE release of the Calculator.
 *
 * The cache is named after the version scripts/build-site.mjs stamps in below, so a new
 * release is a new sw.js, which installs a new cache and deletes the old one on activate.
 * Nothing here is clinical: it serves the same bytes the release published, or nothing. */
const VERSION = '__VERSION__';
const CACHE = `ecicep-${VERSION}`;
const ARCHIVOS = [
  './',
  './index.html',
  `./calculadora.css?v=${VERSION}`,
  `./ui.mjs?v=${VERSION}`,
  './motor.mjs',
  './ecicep-codigos.mjs',
  './ecicep-titulos.mjs',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  /* cache:'reload' skips the HTTP cache, so the copy is the release, not a stale edge. */
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('ecicep-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Network first for the page, so an online visit sees a new release immediately; the
 * cached copy answers only when the network does not. Everything else is versioned or
 * pinned to this release, so cache first is exact. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html', { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE }).then((hit) => hit ?? fetch(req)));
});
