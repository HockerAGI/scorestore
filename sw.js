/* sw.js - SCORE STORE v5.0 (MOBILE APP VERSION) */
const CACHE_NAME = "score-store-v5-mobile";

// Assets críticos que la App necesita para funcionar offline o cargar rápido
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css", // El SW interceptará esto aunque tenga ?v=5.0 si usamos ignoreSearch
  "/js/main.js",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/icons/icon-192.png",
  "/assets/hero.webp",
  "/site.webmanifest"
];

// INSTALACIÓN: Guardar assets en caché
self.addEventListener("install", (e) => {
  self.skipWaiting(); // Forzar activación inmediata
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentar cachear uno por uno para que si falla uno, no rompa todo
      return Promise.allSettled(
        ASSETS.map(url => {
          return fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          });
        })
      );
    })
  );
});

// ACTIVACIÓN: Borrar cachés viejos (v25, v4, etc)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // Tomar control de inmediato
});

// INTERCEPTAR PETICIONES (Estrategia Híbrida)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Backend y APIs externas: SIEMPRE RED (No cachear)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("stripe.com") ||
    url.pathname.includes("/.netlify/") ||
    url.pathname.includes("/api/") ||
    url.hostname.includes("facebook.com") || // No cachear pixel
    url.hostname.includes("google-analytics.com")
  ) {
    return; // Ir directo a red
  }

  // 2. Navegación HTML y Datos JSON: Network First (Prioridad a contenido fresco)
  // Si hay internet, baja lo nuevo. Si no, usa caché.
  if (req.mode === "navigate" || url.pathname.includes(".json") || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req)) // Fallback offline
    );
    return;
  }

  // 3. Imágenes, CSS, JS: Cache First (Velocidad máxima)
  // Busca en caché ignorando parámetros de búsqueda (ej: ?v=5.0)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      return cached || fetch(req).then((res) => {
        // Si no estaba en caché, guárdalo para la próxima
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      });
    })
  );
});
