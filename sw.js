// sw.js — SCORE STORE (PROD ALIGN FINAL)

const CACHE_VERSION = "v5";
const CACHE_STATIC = `score-static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
];

// ================================
// INSTALL
// ================================
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// ================================
// ACTIVATE
// ================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.includes(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ================================
// FETCH
// ================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ❌ Ignorar requests no-GET
  if (req.method !== "GET") return;

  // ❌ Ignorar requests externos (Stripe, Envia, Telegram, etc.)
  if (url.origin !== self.location.origin) return;

  // ❌ Ignorar Netlify Functions (CRÍTICO)
  if (url.pathname.startsWith("/.netlify/functions")) return;

  // ❌ Ignorar datos dinámicos (catálogo / promos)
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  // ============================
  // HTML → NETWORK FIRST
  // ============================
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ============================
  // STATIC ASSETS → CACHE FIRST
  // ============================
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // ============================
  // DEFAULT → NETWORK
  // ============================
  event.respondWith(fetch(req));
});