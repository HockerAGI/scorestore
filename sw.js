const CACHE_NAME = "score-store-pwa-v3-unified";
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
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
