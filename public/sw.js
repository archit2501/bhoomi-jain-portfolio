/*
 * The service worker (task 5.1.3). Kept small on purpose:
 * - pages always come from the network; only when it's gone does the offline page show;
 * - the build's own files (/_astro/, named by their content, so never stale) are kept after
 *   their first use, so the offline page and repeat visits load at once;
 * - everything else (the API, images, other sites) is left to the browser.
 */
const CACHE = 'bhoomi-v1';
const OFFLINE = '/offline/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(OFFLINE, { cache: 'reload' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put(OFFLINE, res);
      // The offline page's own styles and scripts, so it looks right with no network.
      const assets = [...html.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll([...new Set(assets)]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) await cache.put(request, res.clone());
        return res;
      })(),
    );
  }
});
