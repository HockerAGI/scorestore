// sw.js — SCORE STORE (PROD FINAL v5)

const CACHE_VERSION = "v5";
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",

  // Core visuals
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",

  // Logos / branding
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp",
  "/assets/logo-unico.webp"
];

// -----------------------------
// INSTALL
// -----------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// -----------------------------
// ACTIVATE
// -----------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// -----------------------------
// FETCH
// -----------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== "GET") return;

  // Ignorar externos (Stripe, etc.)
  if (url.origin !== self.location.origin) return;

  // Ignorar Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions")) return;

  // Ignorar data dinámica
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  // HTML / JS / JSON → NETWORK FIRST
  if (
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Assets → CACHE FIRST
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Default
  event.respondWith(fetch(req));
});