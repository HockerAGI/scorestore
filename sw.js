// sw.js — SCORE STORE (CACHE CONTROL DEFINITIVO)
// Ajustado para ecommerce real con Stripe + Envia

const CACHE = 'score-v5';

const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/site.webmanifest',
  '/icons-score.svg',
  '/assets/logo-score.webp'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 🔒 NO interceptar funciones backend (Stripe / Envia)
  if (url.pathname.startsWith('/.netlify/functions/')) {
    return;
  }

  // HTML / JS / JSON → NETWORK FIRST
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json')
  ) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets estáticos → CACHE FIRST
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});