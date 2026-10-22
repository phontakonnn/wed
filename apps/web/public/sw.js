/* PKH — Life OS Service Worker (Cache Purge & Always Network First) */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh network response
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
