// ============ RIFT BRAWL — service worker ============
//
// Single-player RIFT BRAWL has no server dependency: the engine, the art and
// the audio are all generated at runtime in the browser. So the whole game can
// work offline once it has been loaded.
//
// Strategy:
//   navigation  -> network first, fall back to the cached shell (offline play)
//   static      -> stale-while-revalidate, so updates land without a hard reload
//   everything else (lobby sockets, cross-origin) is never touched.

const VERSION = 'rift-brawl-v2';

// The worker is served from wherever the site is deployed, which may be a
// sub-directory (a GitHub project page is /<repo>/). Its own registration
// scope is the single source of truth for that, so nothing here is hardcoded
// to the root and the same file works on every host.
const BASE = new URL('./', self.location).pathname;
const SHELL = BASE;
const PRECACHE = [
  BASE,
  BASE + 'manifest.webmanifest',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  if (!url.pathname.startsWith(BASE)) return false;
  const rel = url.pathname.slice(BASE.length);
  return rel.startsWith('_next/static/')
    || rel.startsWith('icon-')
    || /\.(png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/.test(rel);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never intercept the lobby relay

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(SHELL, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r ?? Response.error())),
    );
    return;
  }

  if (!isStatic(url)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
