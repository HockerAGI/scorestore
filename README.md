# SCORE Store — Tienda Oficial

- Store oficial: https://scorestore.netlify.app
- Operación / fabricación: Único Uniformes (BAJATEX, Tijuana)
- Checkout: Stripe (Card + OXXO)
- Envíos: Envia.com (FedEx) — real
- Notificaciones: Telegram (opcional)
- IA: Gemini (Score AI) (vendedor + soporte) (opcional)

## Estructura
/
├─ assets/                (imágenes / webp)
├─ css/styles.css
├─ data/catalog.json
├─ data/promos.json
├─ js/main.js
├─ netlify/functions/
│  ├─ _shared.js
│  ├─ create_checkout.js
│  ├─ quote_shipping.js
│  ├─ stripe_webhook.js
│  ├─ envia_webhook.js
│  └─ chat.js
├─ index.html
├─ legal.html
├─ netlify.toml
├─ package.json
├─ robots.txt
├─ site.webmanifest
├─ sitemap.xml
└─ sw.js

## Variables de entorno (Netlify)
- SITE_URL=https://scorestore.netlify.app
- STRIPE_SECRET_KEY=...
- STRIPE_WEBHOOK_SECRET=...
- ENVIA_API_TOKEN=...
- SUPABASE_URL=https://lpbzndnavkbpxwnlbqgb.supabase.co
- SUPABASE_ANON_KEY=...
- SUPABASE_SERVICE_ROLE_KEY=...
- TELEGRAM_BOT_TOKEN=... (opcional)
- TELEGRAM_CHAT_ID=... (opcional)
- GEMINI_API_KEY=... (opcional)
- META_PIXEL_ID=4249947775334413
- FACEBOOK_DOMAIN_VERIFICATION=wuo7x5sxsjcer1t0epn1id5xgjp8su

## Envío real
Envia.com cotiza y genera guía. Para 100% exactitud, ÚNICO OS (Supabase) debe guardar specs por SKU:
weight_kg, length_cm, width_cm, height_cm (+ declared_value_mxn opcional).