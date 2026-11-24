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
  /* Versioned exactly as index.html's import map requests them: a release's interface only
     ever loads that release's engine, from this cache or from the network. */
  `./motor.mjs?v=${VERSION}`,
  `./ecicep-codigos.mjs?v=${VERSION}`,
  `./ecicep-titulos.mjs?v=${VERSION}`,
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

/* Network first for the page, revalidated past the HTTP cache (Pages sends max-age=600),
 * so an online visit sees a new release immediately; the cached copy answers only when the
 * network does not. Every other request is versioned by the page that made it, so cache
 * first is exact, and a miss (another release's URL) goes to the network. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .catch(() => caches.match('./index.html', { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE }).then((hit) => hit ?? fetch(req)));
});
