// Service Worker de MiNegocio7pro
// - Hace que la app sea instalable (PWA) en Android, iPhone y computadora.
// - Permite abrirla y usarla sin internet.
const VERSION = 'n7p-v3.3.0';
const APP_CACHE = `${VERSION}-app`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = '/index.html';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
/* __ASSETS__ */
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      // Se guarda archivo por archivo: si uno falla, el resto igual queda disponible sin internet
      .then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(err => console.warn('No se pudo guardar', url, err)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => !n.startsWith(VERSION)).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Nunca cachear Supabase (la app guarda sus datos en el dispositivo)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  if (!url.protocol.startsWith('http')) return;

  // Páginas: red primero; sin internet, la app guardada
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(OFFLINE_URL, copy));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true, ignoreVary: true }).then(r => r || caches.match('/')))
    );
    return;
  }

  // Archivos de la app (/assets con hash, íconos, OCR, modelo visual, fuentes): caché primero
  event.respondWith(
    caches.match(request, { ignoreVary: true, ignoreSearch: url.origin === self.location.origin && url.pathname.startsWith('/assets/') }).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => new Response('Sin conexión', { status: 503, statusText: 'Service Unavailable' }));
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
