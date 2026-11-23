// Service worker de NEXA (portal MI NEXA y app de rutinas).
// Solo guarda la "cáscara" de las páginas para que la app se pueda instalar y
// abra sin conexión; nunca guarda datos de alumnos (las consultas a la base y
// a /api no pasan por aquí).
const CACHE = 'nexa-v2';
const SHELL = ['/app', '/app/login', '/app/instalar', '/portal', '/portal/login'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Solo navegación entre páginas; nada de datos ni API
  if (e.request.mode !== 'navigate') return;
  const url = new URL(e.request.url);
  const inicio = url.pathname.startsWith('/app') ? '/app' : '/portal';
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(c => c ?? caches.match(inicio)))
  );
});
