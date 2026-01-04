const CACHE_NAME = "score-store-pwa-v6";

// Assets estáticos inmutables (fuentes, logos, UI core)
const STATIC_ASSETS = [
  "/",
  "/css/styles.css",
  "/js/main.js", // Logica UI
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
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
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

  if (req.method !== "GET") return;

  // ❌ Nunca cachear funciones serverless
  if (req.url.includes("/.netlify/functions/")) return;

  // 🛒 Catálogo: Network First (Priorizar datos frescos)
  if (req.url.includes("/data/catalog.json")) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 📄 HTML: Network First
  if (req.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 🖼️ Imágenes: Cache First con Network Fallback
  if (req.destination === "image") {
    e.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
    return;
  }

  // 📦 Resto de Assets: Cache First
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});