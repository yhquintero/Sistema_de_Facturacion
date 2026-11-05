const CACHE = 'nexo-public-assets-v2';
const PUBLIC_ASSETS = ['/offline.html', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache invoices, signatures, session information, API responses or downloads.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); return; }
  if (!PUBLIC_ASSETS.includes(url.pathname) && !url.pathname.startsWith('/assets/')) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const existing = await cache.match(event.request);
    if (existing) return existing;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});
