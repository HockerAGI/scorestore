/* sw.js - VERSIÓN DE PRODUCCIÓN v18 */
const CACHE_NAME = "score-store-v18"; // <--- CAMBIO OBLIGATORIO
const ASSETS = [ 
  "/", 
  "/index.html", 
  "/css/styles.css", 
  "/js/main.js", 
  "/data/catalog.json",
  "/assets/logo-score.webp" 
];

self.addEventListener("install", (e) => {
  self.skipWaiting(); // Fuerza la instalación inmediata
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
  self.clients.claim(); // Toma control inmediato de la página
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // ESTRATEGIA: Network First para HTML y Datos (para ver cambios al instante)
  if (e.request.destination === "document" || e.request.url.includes("/data/")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // ESTRATEGIA: Cache First para imágenes y estilos (velocidad)
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});
