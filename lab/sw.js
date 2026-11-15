/* Service worker de Mástil Lab: usa la red cuando hay y guarda todo para funcionar sin conexión. */
const CACHE = 'mastil-lab-v3';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const list = await (await fetch('./precache.json', { cache: 'no-store' })).json();
      await Promise.all(list.map((p) => cache.add(new Request(new URL(p, self.location).href, { cache: 'reload' })).catch(() => {})));
    } catch { /* se irá guardando sobre la marcha */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await cache.match(new URL('./index.html', self.location).href)) ?? Response.error();
      return Response.error();
    }
  })());
});
