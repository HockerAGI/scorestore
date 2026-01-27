/* =========================================================
   SCORE STORE — Service Worker (PWA)
   - Cache-first para assets estáticos
   - Network-first para HTML
   - NO cachea /api/*
   - Fallback offline mínimo
   ========================================================= */

// ¡IMPORTANTE! Cambiamos la versión para forzar la actualización en clientes
const VERSION = "2026_FIXED_V2";
const CACHE_STATIC = `scorestore_static_${VERSION}`;
const CACHE_PAGES = `scorestore_pages_${VERSION}`;

const PRECACHE = [
  "/",               
  "/index.html",
  "/legal.html",
  // Estos deben coincidir EXACTO con lo que pusimos en index.html
  "/css/styles.css?v=2026_FIXED_V2",
  "/js/main.js?v=2026_FIXED_V2",
  "/data/catalog.json",
  "/data/promos.json",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  // Imágenes críticas para LCP
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp"
];

// Solo cacheamos estas extensiones como estático
const STATIC_EXT = /\.(?:css|js|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    // Precarga best-effort (si alguna falla, no revienta install)
    await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        // Borra cachés viejas (ej. 2026_PROD_v1) para liberar espacio y evitar conflictos
        if (![CACHE_STATIC, CACHE_PAGES].includes(k)) return caches.delete(k);
        return null;
      })
    );
    self.clients.claim();
  })());
});

function isAPI(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/api/") || u.pathname.startsWith("/.netlify/functions/");
  } catch {
    return false;
  }
}

function isHTML(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // Nunca cachear API / functions
  if (isAPI(url)) return;

  // HTML: network-first (para que siempre traiga updates)
  if (isHTML(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_PAGES);
      try {
        const fresh = await fetch(req);
        // Guardamos copia actualizada
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        // Fallback offline mínimo
        return new Response(
          `<!doctype html>
          <html lang="es">
          <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <title>SCORE STORE — Offline</title>
            <style>
              body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#fff;color:#111}
              .wrap{min-height:100vh;display:grid;place-items:center;padding:24px}
              .card{max-width:520px;width:100%;border:1px solid #eee;border-radius:16px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
              h1{margin:0 0 8px;font-size:22px}
              p{margin:0 0 12px;color:#444;line-height:1.4}
              a{color:#e10600;text-decoration:none;font-weight:700}
              .tag{display:inline-flex;gap:8px;align-items:center;background:#ffe5e3;color:#111;padding:6px 10px;border-radius:999px;font-size:12px}
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="card">
                <div class="tag">🏁 SCORE STORE</div>
                <h1>Estás sin conexión</h1>
                <p>Cuando recuperes señal, recarga para ver el catálogo actualizado.</p>
                <p><a href="/">Reintentar</a></p>
              </div>
            </div>
          </body>
          </html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // Static assets: cache-first
  if (STATIC_EXT.test(new URL(url).pathname) || STATIC_EXT.test(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // Si falla fetch de imagen, no rompemos nada, simplemente falla silencioso o retorna nada
        return null; 
      }
    })());
  }
});