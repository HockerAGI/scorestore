# SCORE STORE Official

Tienda oficial de merchandising de SCORE International, operada por BAJATEX / Único Uniformes.

## Qué incluye
- Catálogo estático con catálogo local y normalización de secciones
- Checkout con Stripe
- Cotización y webhooks de Envía
- PWA con manifest, service worker y modo offline
- Páginas legales y de post-compra
- Integración con Supabase para datos, órdenes y configuración pública

## Requisitos
- Node.js 18.18+
- Variables de entorno configuradas en Vercel o local

## Variables clave
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `ENVIA_API_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SCORESTORE_URL`
- `SITE_URL`

## Desarrollo local
```bash
npm install
npm run build
npm run lint
npx serve . -l 3000