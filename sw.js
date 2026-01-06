const CACHE_NAME = "score-store-v5";
const ASSETS = [ "/", "/index.html", "/css/styles.css", "/js/main.js", "/data/catalog.json" ];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Promise.allSettled evita que el SW muera si falla 1 archivo (ej. icono)
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  
  // Network First para HTML y Datos
  if (e.request.destination === "document" || e.request.url.includes("/data/")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache First para Assets
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});
