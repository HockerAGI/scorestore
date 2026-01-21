/* sw.js - VERSIÓN DE PRODUCCIÓN v25 (SINCRONIZADA) */
const CACHE_NAME = "score-store-v25";

// Lista crítica de assets para precarga
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/site.webmanifest"
];

// precache tolerante
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch {
        // asset opcional puede fallar, no rompas instalación
      }
    })
  );
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => safePrecache(cache, ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Backend/external siempre red
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("stripe.com") ||
    url.pathname.includes("/.netlify/functions") ||
    url.pathname.includes("/api/")
  ) {
    return;
  }

  // Solo GET requests
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");
  const isData = url.pathname.includes("/data/");

  // Network-first para HTML y data
  if (isHTML || isData) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          if (isHTML) return caches.match("/index.html"); // Fallback offline
        })
    );
    return;
  }

  // Cache-first para assets
  e.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});