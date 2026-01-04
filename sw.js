const CACHE_NAME = "score-store-pwa-v5";

const ASSETS = [
  "/",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

/* INSTALL */
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

/* ACTIVATE */
self.addEventListener("activate", e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(
          keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))
        )
      )
    ])
  );
});

/* FETCH */
self.addEventListener("fetch", e => {
  const req = e.request;

  // Solo GET
  if (req.method !== "GET") return;

  // ❌ Nunca cachear funciones (Stripe / Netlify)
  if (req.url.includes("/.netlify/functions/")) return;

  // 📄 HTML → network first (evita bugs visuales / JS viejo)
  if (req.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 🖼️ Imágenes → network first con fallback
  if (req.destination === "image") {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 📦 Assets estáticos → cache first
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});