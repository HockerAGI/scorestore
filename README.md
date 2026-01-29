# SCORE Store — Tienda Oficial

**Sitio:** https://scorestore.netlify.app  
**Operación / fabricación:** Único Uniformes (BAJATEX, Tijuana)  
**Checkout:** Stripe Checkout (Tarjeta + OXXO)  
**Envíos:** Envia.com (cotización + guía en vivo)  
**Notificaciones:** Telegram (opcional)  
**IA:** Gemini (Score AI: vendedor + soporte) (opcional)

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
├─ js/
│  └─ main.js
├─ netlify/
│  └─ functions/
│     ├─ _shared.js
│     ├─ create_checkout.js
│     ├─ quote_shipping.js
│     ├─ stripe_webhook.js
│     └─ chat.js
├─ index.html
├─ legal.html
├─ netlify.toml
├─ package.json
├─ robots.txt
├─ site.webmanifest
├─ sitemap.xml
└─ sw.js