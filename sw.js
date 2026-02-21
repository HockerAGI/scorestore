/* SCORE STORE — Service Worker (Pro-PWA 100% E-commerce Safe) */
const CACHE_VERSION = "scorestore-v2026.02.21.UX.ISLAND";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
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

  // EXCLUSIÓN QUIRÚRGICA: Ignorar APIs, JSONs dinámicos, Stripe y Supabase
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/.netlify/") ||
    url.pathname.endsWith(".json") ||
    url.origin.includes("stripe.com") ||
    url.origin.includes("envia.com") ||
    url.origin.includes("supabase.co")
  ) {
    return;
  }

  if (req.method !== "GET") return;

  // Navegación: Network-first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          return caches.open(CACHE_VERSION).then((cache) => {
            cache.put(req, response.clone());
            return response;
          });
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets estáticos: Cache-first con actualización en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(req, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => { /* offline silently */ });
      return cached || fetchPromise;
    })
  );
});
