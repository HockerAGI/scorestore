// sw.js — SCORE STORE (PWA PRO)
// ✅ Cachea app shell
// ✅ Network-first para /data/* (catálogo/promos siempre frescos)
// ✅ No cachea /.netlify/functions/* ni Stripe
// ✅ Offline fallback limpio
// ✅ No truena si falta algún asset

const SW_VERSION = "score-store-v30";
const CACHE_SHELL = `${SW_VERSION}-shell`;
const CACHE_DATA = `${SW_VERSION}-data`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/icons-score.svg",
  "/css/styles.css",
  "/js/main.js",

  // assets opcionales (si existen)
  "/assets/logo-score.webp",
  "/assets/hero.webp"
];

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function cacheAddSafe(cache, url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res && res.ok) await cache.put(url, res.clone());
  } catch {
    // silencioso: no romper instalación por un asset faltante
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await Promise.all(SHELL_ASSETS.map((u) => cacheAddSafe(cache, u)));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k.startsWith("score-store-") && ![CACHE_SHELL, CACHE_DATA, CACHE_RUNTIME].includes(k)) {
            return caches.delete(k);
          }
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== "GET") return;

  // No tocar Netlify functions ni Stripe
  if (url.pathname.startsWith("/.netlify/")) return;
  if (url.hostname.includes("stripe")) return;

  // Solo same-origin (evita cachear Google Fonts, etc)
  if (!isSameOrigin(req.url)) return;

  // ✅ DATA: /data/* -> network-first (si falla, usa cache)
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_DATA);
        try {
          const res = await fetch(req, { cache: "no-store" });
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await cache.match(req, { ignoreSearch: true });
          if (cached) return cached;
          // fallback mínimo si estás offline y no hay cache
          return new Response(
            JSON.stringify({ ok: false, error: "offline_no_cache" }),
            { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  // ✅ Navegación: network-first con fallback a cache/index
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_RUNTIME);
          cache.put(req, res.clone());
          return res;
        } catch {
          // Fallbacks: index.html (SPA) o cache de navegación si existiera
          return (await caches.match("/index.html")) || (await caches.match(req)) || Response.error();
        }
      })()
    );
    return;
  }

  // ✅ Assets estáticos: cache-first (ignoreSearch para evitar querystrings)
  event.respondWith(
    (async () => {
      // Primero shell
      const shell = await caches.open(CACHE_SHELL);
      const shellHit = await shell.match(req, { ignoreSearch: true });
      if (shellHit) return shellHit;

      // Luego runtime
      const runtime = await caches.open(CACHE_RUNTIME);
      const cached = await runtime.match(req, { ignoreSearch: true });
      if (cached) return cached;

      // Si no existe, fetch y guarda
      try {
        const res = await fetch(req);
        if (res && res.ok) runtime.put(req, res.clone());
        return res;
      } catch {
        return cached || shellHit || Response.error();
      }
    })()
  );
});