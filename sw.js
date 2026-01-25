/* sw.js - Motor de Rendimiento SCORE v2026 */
const CACHE_NAME = "score-cache-v2.5";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/data/catalog.json"
];

// Instalación: Guarda los archivos base en el celular
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activación: Limpia versiones viejas para que la tienda siempre sea la más nueva
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// Estrategia de carga: Carga rápido del caché y actualiza por detrás
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});