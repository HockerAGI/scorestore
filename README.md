# SCORE Store — Tienda Oficial (PROD 2026)

**Operación / fabricación:** Único Uniformes (BAJATEX)  
**Checkout:** Stripe Checkout (Tarjeta + OXXO opcional)  
**Envíos:** Envía.com (cotización + guía automática)  
**Notificaciones:** Telegram (opcional)  
**IA (opcional):** Gemini (chat soporte/ventas)  
**Admin App:** UnicOs (consume Supabase: orders + shipping_labels)

---

## Estructura

```txt
/
├─ assets/                 # imágenes (webp) + icons PWA
├─ css/
│  └─ styles.css
├─ data/
│  ├─ catalog.json
│  └─ promos.json
├─ db/
│  └─ schema.sql           # tablas Supabase (orders + shipping_labels + webhooks)
├─ js/
│  └─ main.js
├─ netlify/
│  └─ functions/
│     ├─ _shared.js
│     ├─ create_checkout.js        # POST /.netlify/functions/create_checkout
│     ├─ quote_shipping.js         # POST /.netlify/functions/quote_shipping
│     ├─ checkout_status.js        # GET  /.netlify/functions/checkout_status?session_id=...
│     ├─ stripe_webhook.js         # POST /.netlify/functions/stripe_webhook
│     ├─ envia_webhook.js          # POST /.netlify/functions/envia_webhook
│     └─ chat.js                   # POST /.netlify/functions/chat
├─ index.html
├─ success.html
├─ cancel.html
├─ legal.html
├─ netlify.toml
├─ package.json
├─ robots.txt
├─ site.webmanifest
├─ sitemap.xml
└─ sw.js