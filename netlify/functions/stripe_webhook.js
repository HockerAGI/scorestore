// /netlify/functions/stripe_webhook.js
// Stripe webhook: checkout.session.completed -> notificaciones (Telegram + WhatsApp)

const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TO = process.env.WHATSAPP_TO;

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  }).catch(() => {});
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: WHATSAPP_TO,
      type: "text",
      text: { body: text },
    }),
  }).catch(() => {});
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  const sig = event.headers["stripe-signature"];
  if (!sig) return json(400, { ok: false, error: "Missing stripe-signature" });

  let evt;
  try {
    // En Netlify, event.body llega string. OJO: si algún día activas base64, hay que adaptar.
    evt = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json(400, { ok: false, error: "Invalid signature" });
  }

  if (evt.type === "checkout.session.completed") {
    const session = evt.data.object;

    // Traemos detalles extendidos (line items)
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items", "customer_details"],
    });

    const items = full?.line_items?.data || [];
    const total = (full.amount_total || 0) / 100;
    const currency = String(full.currency || "mxn").toUpperCase();

    const promo = full.metadata?.promo_code || "";
    const ship = [
      full.metadata?.ship_postal_code,
      full.metadata?.ship_state_code,
      full.metadata?.ship_city,
      full.metadata?.ship_address1,
    ].filter(Boolean).join(", ");

    const list = items
      .map(i => `• ${i.quantity} x ${i.description} — ${(i.amount_total || 0) / 100} ${currency}`)
      .join("\n");

    const msg =
      `✅ COMPRA CONFIRMADA (SCORE Store)\n` +
      `ID: ${full.id}\n` +
      `Total: ${total} ${currency}\n` +
      (promo ? `Cupón: ${promo}\n` : "") +
      (ship ? `Envío: ${ship}\n` : "") +
      `\n${list}`;

    await sendTelegram(msg);
    await sendWhatsApp(msg);
  }

  return json(200, { received: true });
};