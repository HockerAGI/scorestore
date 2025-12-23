const CACHE_NAME = 'scorestore-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/icons-score.svg',
  '/site.webmanifest'
];

// Instalación del SW: precache de archivos esenciales
self.addEventListener('install', event => {
  self.skipWaiting(); // activa inmediatamente el SW
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activación del SW: limpieza de caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Intercepta las solicitudes y responde desde caché o red
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cachea nuevos archivos dinámicamente si es seguro
        if (event.request.url.startsWith(self.location.origin)) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      }).catch(() => {
        // Opción offline: retornar una página fallback o mensaje
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});