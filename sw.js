const CACHE_NAME = "score-store-pwa-v3-unified";
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",const CACHE_NAME = "score-store-pwa-v4";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/data/promos.json",
  "/site.webmanifest",
  "/icons-score.svg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll falla si 1 asset da 404; lo hacemos resiliente
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try { await cache.add(url); } catch (_) {}
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo cachear same-origin
  if (url.origin !== location.origin) return;

  // Navegaciones: Network First (con fallback)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", fresh.clone());
          return fresh;
        } catch (_) {
          const cached = await caches.match(req) || await caches.match("/index.html") || await caches.match("/");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Assets estáticos: Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/icons-score.svg",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => { 
    if (k !== CACHE_NAME) return caches.delete(k); 
  }))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  
  // No cachear API
  if (req.url.includes("/.netlify/functions/")) return;

  // Network First para HTML y Datos (Prioridad: contenido actualizado)
  if (req.headers.get("accept")?.includes("text/html") || req.url.includes("/data/")) {
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

  // Cache First para lo demás (Imágenes, CSS, JS estático)
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
