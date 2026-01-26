/* sw.js - Motor de Rendimiento SCORE v2026 (Optimizado) */
const CACHE_NAME = "score-cache-v3.0";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/site.webmanifest"
];

// Instalación
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Limpieza de Caché antigua
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

// Estrategia Inteligente
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. API y Backend: Siempre Red (Nunca cachear pagos o inventario)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) {
    return;
  }

  // 2. Catálogo JSON: Network First (Intenta red para precios frescos, si falla usa caché)
  if (url.pathname.includes("/data/catalog.json")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Assets Estáticos (CSS, JS, Imágenes): Stale-While-Revalidate
  // (Muestra rápido lo cacheado, y actualiza en segundo plano para la próxima)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});
