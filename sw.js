/* =========================================================
   SCORE STORE — Service Worker (PWA) · UNIFICADO (PROD)
   - Cache-first: assets estáticos (CSS/JS/IMG/FONTS + webmanifest/txt/xml)
   - Stale-while-revalidate: JSON de catálogo/promos (ideal: /data/*.json)
   - Network-first: HTML (para no quedarse viejo)
   - NO cachea /api/* ni /.netlify/functions/*
   ========================================================= */

const VERSION = "2026_PROD_UNIFIED_360";
const CACHE_STATIC = `scorestore_static_${VERSION}`;
const CACHE_PAGES  = `scorestore_pages_${VERSION}`;
const CACHE_DATA   = `scorestore_data_${VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/legal.html",          // ✅ confirma que exista en tu deploy

  "/css/styles.css",
  "/js/main.js",

  "/data/catalog.json",
  "/data/promos.json",

  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",

  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp",

  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

// ✅ ahora también cubre webmanifest/txt/xml
const STATIC_EXT = /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest|txt|xml)$/i;
const DATA_EXT   = /\.(?:json)$/i;

function isAPI(url) {
  try {
    const u = new URL(url);
    return (
      u.pathname.startsWith("/api/") ||
      u.pathname.startsWith("/.netlify/functions/")
    );
  } catch {
    return false;
  }
}

function isHTML(req) {
  return (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html")
  );
}

function pathnameOf(url) {
  try { return new URL(url).pathname; } catch { return ""; }
}

function stripSearch(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname; // ✅ evita cache-bloat por ?v=
  } catch {
    return url;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (![CACHE_STATIC, CACHE_PAGES, CACHE_DATA].includes(k)) {
          return caches.delete(k);
        }
        return Promise.resolve();
      })
    );
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // ✅ Solo GET
  if (req.method !== "GET") return;

  // Nunca cachear API / functions
  if (isAPI(url)) return;

  // HTML: network-first
  if (isHTML(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_PAGES);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        // intenta cache exacto, luego fallback a homepage
        const cached = await cache.match(req);
        if (cached) return cached;

        const home = (await cache.match("/")) || (await cache.match("/index.html"));
        if (home) return home;

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
    a{color:#e10600;text-decoration:none;font-weight:800}
    .tag{display:inline-flex;gap:8px;align-items:center;background:#ffe5e3;color:#111;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800}
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

  const pathname = pathnameOf(url);

  // JSON data: stale-while-revalidate (ideal: /data/*.json)
  if (DATA_EXT.test(pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_DATA);
      const cached = await cache.match(req, { ignoreSearch: true });

      const fetchPromise = (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            // ✅ guarda sin query para no duplicar
            await cache.put(stripSearch(url), fresh.clone());
          }
          return fresh;
        } catch {
          return null;
        }
      })();

      return cached || (await fetchPromise) || new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    })());
    return;
  }

  // Static assets: cache-first (ignorando query)
  if (STATIC_EXT.test(pathname) || STATIC_EXT.test(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);

      let cached = await cache.match(req);
      if (!cached) cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          // ✅ guarda sin query para evitar bloat por ?v=
          cache.put(stripSearch(url), fresh.clone());
        }
        return fresh;
      } catch {
        return new Response("", { status: 504 });
      }
    })());
  }
});