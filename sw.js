const SW_VERSION = "score-racing-v3"; 
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/icons-score.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
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

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/.netlify/functions/")) return;

  // HTML
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req).catch(() => caches.match("/index.html")));
    return;
  }

  // Assets (Imágenes, Fuentes, CSS)
  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".webp") || url.pathname.endsWith(".svg")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Data JSON
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});