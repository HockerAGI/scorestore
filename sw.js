/* sw.js - VERSIÓN DE PRODUCCIÓN v20 (BUMP & UNIFIED) */
const CACHE_NAME = "score-store-prod-v20"; 
const ASSETS = [ 
  "/", 
  "/index.html", 
  "/css/styles.css", 
  "/js/main.js", 
  "/data/catalog.json",
  "/assets/logo-score.webp" 
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
  // Ignorar Supabase y Stripe para garantizar datos frescos del Admin App
  if (e.request.url.includes('supabase.co') || e.request.url.includes('stripe.com')) {
     return; 
  }

  if (e.request.method !== "GET") return;

  // Lógica de Red Primero (Network First) para asegurar contenido fresco
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Si es un asset válido, actualizamos el caché
        if (res && res.status === 200 && (e.request.destination === "document" || e.request.url.includes("/data/") || e.request.url.includes("/assets/"))) {
           const clone = res.clone();
           caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request)) // Fallback al caché si no hay internet
  );
});
