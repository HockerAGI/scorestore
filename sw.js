/* sw.js - VERSIÓN DE PRODUCCIÓN v21 (BUMP) */
const CACHE_NAME = "score-store-v20"; 
const ASSETS = [ 
  "/", 
  "/index.html", 
  "/css/styles.css", 
  "/js/main.js", 
  "/data/catalog.json",
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
  // Ignorar API Backend y Supabase para datos frescos
  if (e.request.url.includes('supabase.co') || e.request.url.includes('stripe.com') || e.request.url.includes('netlify/functions')) {
     return; 
  }

  if (e.request.method !== "GET") return;

  // Network First para HTML/Data, Cache First para todo lo demás
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
