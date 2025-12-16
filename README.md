# SCORE STORE

Tienda estática (HTML + assets) desplegada en Netlify.

## Estructura
- `index.html` — UI/tienda (render dinámico)
- `assets/` — imágenes, logos
- `data/catalog.json` — catálogo (secciones + productos)
- `data/promos.json` — reglas de promociones
- `sw.js` — Service Worker (cache offline básico)
- `site.webmanifest` — PWA
- `robots.txt`, `sitemap.xml` — SEO
- `netlify/` + `netlify.toml` — configuración Netlify

## Variables de entorno (Netlify)
- `STRIPE_SECRET_KEY` (obligatoria para pagos)
- `SITE_URL` (ej: https://scorestore.netlify.app)
- `FALLBACK_SHIPPING_MXN` (opcional)

## Catálogo
Edita `data/catalog.json`:
- agrega productos en `products`
- asigna productos a cualquier sección por `sectionId`

## Promos
Edita `data/promos.json`:
- `percent` con `value` en decimal (0.10 = 10%)
- `fixed_mxn` con `value` en MXN
- `free_shipping` para quitar envío

## Lighthouse
Para mejorar performance:
- convertir imágenes grandes a WebP
- bajar peso de `hero.png`, fondos, productos
- mantener `width/height` y `loading="lazy"` en imágenes