// sw.js — SCORE STORE (v15 PRO)
// Estrategia Híbrida: Datos frescos (Network First) + Carga rápida (Cache First)

const CACHE_NAME = 'score-store-v15-pro';

// Archivos CRÍTICOS (Si fallan, la app no funciona offline)
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/site.webmanifest',
  '/assets/logo-score.webp',
  '/assets/hero.webp',
  '/assets/icons-score.svg',
  '/data/catalog.json' // Importante para que cargue el catálogo offline
];

// Archivos OPCIONALES (Se intentan cachear, pero no rompen la instalación si faltan)
const OPTIONAL_ASSETS = [
  '/data/promos.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-192-maskable.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activar inmediatamente
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    
    // 1. Cachear núcleo
    await cache.addAll(CORE_ASSETS);

    // 2. Cachear opcionales sin romper si alguno falla
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(url => cache.add(url).catch(console.warn))
    );
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : null)
    ))
  );
  self.clients.claim();
});

// Helpers
const isAPI = (url) => url.pathname.startsWith('/.netlify/') || url.hostname.includes('stripe.com');
const isDataOrPage = (req) => {
  const accept = req.headers.get('accept') || '';
  return req.mode === 'navigate' || 
         accept.includes('text/html') || 
         accept.includes('application/json') || 
         req.url.endsWith('.json');
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. IGNORAR API y Stripe (Siempre red, nunca cachear pagos)
  if (req.method !== 'GET' || isAPI(url)) {
    return;
  }

  // 2. ESTRATEGIA: NETWORK FIRST (Para HTML, JSON de precios y Catálogo)
  // Intentamos bajar lo más nuevo. Si falla (offline), usamos caché.
  if (isDataOrPage(req)) {
    event.respondWith((async () => {
      try {
        const networkRes = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkRes.clone());
        return networkRes;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Si falla todo y es navegación, devolver index (SPA fallback)
        if (req.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      }
    })());
    return;
  }

  // 3. ESTRATEGIA: CACHE FIRST (Para Imágenes, CSS, JS, Fuentes)
  // Buscamos en caché. Si no está, vamos a la red y guardamos.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const networkRes = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, networkRes.clone());
      return networkRes;
    } catch {
      // Si falla imagen, podríamos devolver un placeholder (opcional)
      return Response.error();
    }
  })());
});
