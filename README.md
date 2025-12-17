# SCORE Store (Netlify)

## Estructura recomendada
- `/index.html`
- `/assets/*`
- `/data/catalog.json`
- `/data/promos.json`
- `/netlify/functions/create_checkout.js`
- `/netlify/functions/quote_shipping.js`
- `/netlify/functions/stripe_webhook.js`
- `/netlify/functions/envia_webhook.js`

## Reglas de precio
- `baseMXN` = precio original (base).
- Frontend aplica **+20% fijo** (PRICE_MARKUP = 0.20).
- No se muestra “precio original”, solo el final.

## Promos
- `SCORE10` = -10% (visible).
- `ENVIOFREE` = envío gratis (visible).
- `BAJA200` = -$200 (visible).
- `GRTS10` = total GRATIS (secreto, no se sugiere).

## Variables de entorno (Netlify)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ENVIA_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `URL_SCORE`
- `NETLIFY_DATABASE_URL` (opcional)
- `NETLIFY_DATABASE_URL_UNPOOLED` (opcional)

## Stripe Webhook
Crea el endpoint en Stripe apuntando a:
`/.netlify/functions/stripe_webhook`

Eventos mínimos:
- `checkout.session.completed`