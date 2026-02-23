/* SCORE STORE — Service Worker (Pro-PWA 100% E-commerce Safe) */
const CACHE_VERSION = "scorestore-vfx-pro-v1.2"; // Subimos la versión
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/js/success.js", // <- Agregado para el flujo seguro
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/fondo-pagina-score.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : null)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // EXCLUSIÓN QUIRÚRGICA INCLUYENDO UNICOS ADMIN:
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/.netlify/") ||
    url.pathname.startsWith("/admin/") || // <- BLOQUEO DE CACHÉ PARA UNICOS
    url.pathname.endsWith(".json") ||
    url.origin.includes("stripe.com") ||
    url.origin.includes("envia.com") ||
    url.origin.includes("supabase.co")
  ) {
    return;
  }

  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(req, responseToCache);
          });
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(req, responseToCache);
        });
        return networkResponse;
      }).catch(() => { /* offline silently */ });
      return cached || fetchPromise;
    })
  );
});