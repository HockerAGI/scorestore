/* sw.js - VERSIÓN ÚNICO OS v4.0 (FORCE UPDATE) */
// Hemos subido la versión para obligar a los celulares a borrar el main.js viejo
// y descargar el nuevo con la conexión a Supabase.
const CACHE_NAME = "score-store-unico-v4"; 

const ASSETS = [ 
  "/", 
  "/index.html", 
  "/css/styles.css", 
  "/js/main.js", 
  "/data/catalog.json", // Mantenemos esto para el modo "Respaldo Offline"
  "/assets/logo-score.webp",
  "/assets/icons/icon-192.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
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
  // Ignorar peticiones a Supabase o Stripe (siempre deben ser en vivo)
  if (e.request.url.includes('supabase.co') || e.request.url.includes('stripe.com')) {
     return; // Dejar que la red maneje esto sin caché
  }

  if (e.request.method !== "GET") return;

  // Estrategia: Network First para datos, Cache First para imágenes/assets
  if (e.request.destination === "document" || e.request.url.includes("/data/")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});