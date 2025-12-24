const SW_VERSION = "score-store-v6";
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

// Archivos críticos que existen en tu proyecto
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/js/main.js", // ¡Importante!
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/icons-score.svg",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

// 1. INSTALACIÓN
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// 2. ACTIVACIÓN
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k.startsWith("score-store-") && k !== CACHE_STATIC && k !== CACHE_RUNTIME) {
            return caches.delete(k);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// 3. INTERCEPTOR DE RED
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ⛔ SEGURIDAD: Nunca cachear Stripe ni Netlify Functions
  if (url.pathname.startsWith("/.netlify/") || url.pathname.includes("api")) {
    return; 
  }

  // A) HTML y JSON: Network First (Prioridad datos frescos)
  if (req.mode === "navigate" || (url.pathname.startsWith("/data/") && url.pathname.endsWith(".json"))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req) || caches.match("/index.html"))
    );
    return;
  }

  // B) Assets (JS, Imágenes): Cache First (Velocidad)
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/js/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, clone));
          return res;
        });
      })
    );
    return;
  }

  // C) Default
  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
