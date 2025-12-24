# SCORE Store (Netlify Implementation)

Tienda oficial tipo PWA (Progressive Web App) con arquitectura Serverless.

## Estructura del Proyecto
* `/index.html` - Single Page Application (SPA).
* `/assets/*` - Imágenes y recursos estáticos.
* `/data/catalog.json` - Base de datos de productos.
* `/data/promos.json` - Configuración de cupones.
* `/netlify/functions/*` - Backend (Serverless Functions).

## Reglas de Negocio
* **Precios:** El sistema toma el `baseMXN` del catálogo y el Frontend le suma automáticamente un **20% de margen** antes de mostrarlo al cliente.
* **Inventario:** Controlado manualmente en `catalog.json`.

## Variables de Entorno (Netlify)
Configurar en Site Settings > Environment Variables:

* `STRIPE_SECRET_KEY` (Live SK)
* `STRIPE_WEBHOOK_SECRET` (whsec_...)
* `ENVIA_API_KEY` (Para cotizar envíos)
* `URL_SCORE` (URL del sitio en producción)
* `TELEGRAM_BOT_TOKEN` (Notificaciones)
* `TELEGRAM_CHAT_ID` (Notificaciones)
* `WHATSAPP_TOKEN` (Meta API)
* `WHATSAPP_PHONE_NUMBER_ID` (Meta API)

## Configuración de Webhook
En el Dashboard de Stripe, crear un endpoint apuntando a:
`https://tudominio.app/.netlify/functions/stripe_webhook`

**Eventos requeridos:**
* `checkout.session.completed`