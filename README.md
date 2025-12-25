# SCORE Store

Tienda oficial SCORE implementada como **PWA + Netlify Functions**.
Arquitectura serverless, pagos con Stripe, envíos con Envia y notificaciones automáticas.

---


---

## 💼 Reglas de Negocio

- **Precios:**  
  El frontend usa `baseMXN` directamente del catálogo (sin cálculos ocultos).
- **Inventario:**  
  Control manual desde `catalog.json`.
- **Pagos:**  
  Stripe Checkout (MXN).
- **Envíos:**  
  Envia API (Tijuana y Nacional).
- **Notificaciones:**  
  Telegram y WhatsApp vía webhooks.

---

## 🔐 Variables de Entorno (Netlify)

Configurar en **Site settings → Environment variables**:

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Envíos
- `ENVIA_API_KEY`
- `URL_SCORE`

### Notificaciones
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TO`

---

## 🔔 Webhook Stripe

Configurar en el Dashboard de Stripe:

**Endpoint:**
