const SW_VERSION = "score-racing-v2"; // súbelo a v3, v4... cuando deployes cambios
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

// ⚠️ Solo assets realmente estáticos. NO metas catalog/promos aquí.
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo-score.png"
  // Si tienes versiones webp, usa esas aquí:
  // "/assets/fondo-pagina-score.webp",
  // "/assets/hero.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);

    // cache: "reload" evita que agarre cosas viejas del HTTP cache
    await cache.addAll(STATIC_ASSETS.map((u) => new Request(u, { cache: "reload" })));

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith("score-racing-") && k !== CACHE_STATIC && k !== CACHE_RUNTIME) ? caches.delete(k) : null)
    );
    await clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    return cached || new Response("Offline", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // No tocar métodos que no sean GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ✅ JAMÁS interceptar backend / checkout
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegación (HTML): network-first con fallback
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req).catch(() => caches.match("/index.html")));
    return;
  }

  // JSON dinámico: network-first (si falla red, usa cache)
  if (url.pathname.startsWith("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Assets: cache-first
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: intenta cache, luego red (safe)
  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});