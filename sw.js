const CACHE = "scorestore-v1";
const STATIC = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/assets/hero.webp",
  "/assets/logo-score.webp",
  "/assets/icons-score.svg",
  "/site.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // siempre fresh para datos
  if (url.pathname === "/catalog.json" || url.pathname === "/promos.json") {
    e.respondWith(fetch(e.request));
    return;
  }

  // cache-first para estáticos
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  // network-first para lo demás
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});