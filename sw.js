/* sw.js — offline-first service worker.
   Bump VERSION on every release: the old cache is dropped on activate and the
   page reloads cleanly once the new shell is cached. */

const VERSION = '1.3.0';
const CACHE = `smartboardos-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './.nojekyll',
  './css/styles.css',
  './js/main.js',
  './js/wm.js',
  './js/widgets.js',
  './js/db.js',
  './js/utils.js',
  './js/icons.js',
  './js/pen.js',
  './js/camera.js',
  './js/emoji-data.js',
  './js/apps/whiteboard.js',
  './js/apps/pdf.js',
  './js/apps/media.js',
  './js/apps/class.js',
  './js/apps/lab3d.js',
  './js/apps/notes.js',
  './js/apps/calculator.js',
  './js/apps/settings.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/three.module.min.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache each asset independently so one 404 cannot break the whole install
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] could not precache', url, err?.message); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('message', (ev) => {
  if (ev.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never talk to third parties

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      // offline: SPA-style fallback for navigations
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Offline and not cached yet.', { status: 503, statusText: 'Offline' });
    }
  })());
});
