const CACHE = 'nexa-portal-v1';
const SHELL = ['/portal', '/portal/clases', '/portal/rutinas', '/portal/pagos', '/portal/login'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Solo interceptamos navegación (páginas), no API calls
  if (e.request.mode !== 'navigate') return;

  e.respondWith(
    fetch(e.request)
      .catch(() =>
        caches.match(e.request).then(cached => cached ?? caches.match('/portal'))
      )
  );
});
