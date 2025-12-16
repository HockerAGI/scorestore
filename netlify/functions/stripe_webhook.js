/**
 * netlify/functions/stripe_webhook.js
 * Stripe Webhook handler (Netlify)
 *
 * Requiere env vars:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET (whsec_...)
 *
 * Opcional (notificaciones):
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 * - WHATSAPP_TOKEN
 * - WHATSAPP_PHONE_NUMBER_ID
 * - WHATSAPP_TO   (E.164, e.g. +526642368701)
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

/**
 * Stripe firma el payload EXACTO (bytes).
 * Por eso devolvemos Buffer (no “string normalizado”).
 */
function getRawBodyBuffer(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64");
  }
  return Buffer.from(event.body || "", "utf8");
}

function moneyMXNFromStripeAmount(amount) {
  const n = Number(amount || 0) / 100;
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, skipped: true, channel: "telegram" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, channel: "telegram", data };
}

async function sendWhatsApp(text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_TO; // Ej: +526642368701

  if (!token || !phoneNumberId || !to) {
    return { ok: false, skipped: true, channel: "whatsapp" };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, channel: "whatsapp", data };
}

async function notifyOps(text) {
  const [tg, wa] = await Promise.allSettled([sendTelegram(text), sendWhatsApp(text)]);
  return {
    telegram: tg.status === "fulfilled" ? tg.value : { ok: false, error: String(tg.reason) },
    whatsapp: wa.status === "fulfilled" ? wa.value : { ok: false, error: String(wa.reason) },
  };
}

async function buildOrderSummaryFromSession(sessionId) {
  // Trae sesión + customer_details
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent", "customer_details"],
  });

  // Trae line items
  const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });

  const lines = [];
  lines.push(`🧾 SCORE STORE — Pedido`);
  lines.push(`Session: ${session.id}`);
  if (session.payment_intent && session.payment_intent.id) lines.push(`PaymentIntent: ${session.payment_intent.id}`);
  lines.push(`Status pago: ${session.payment_status || "unknown"}`);
  lines.push(`Total: ${moneyMXNFromStripeAmount(session.amount_total)}`);

  // Customer
  const email = session.customer_details?.email || session.customer_email || "";
  const phone = session.customer_details?.phone || "";
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Tel: ${phone}`);

  // Shipping
  const shipName = session.shipping_details?.name || "";
  const addr = session.shipping_details?.address || {};
  const addrLine = [addr.line1, addr.line2].filter(Boolean).join(" ");
  const city = [addr.city, addr.state].filter(Boolean).join(", ");
  const cp = addr.postal_code || "";
  if (shipName) lines.push(`Envío a: ${shipName}`);
  if (addrLine || city || cp) lines.push(`Dirección: ${addrLine} · ${city} · CP ${cp}`);

  // Metadata (la que mandas desde create_checkout)
  const md = session.metadata || {};
  if (md.shippingMXN) lines.push(`Envío: ${Number(md.shippingMXN).toLocaleString("es-MX")} MXN`);
  if (typeof md.shippingQuoted !== "undefined") lines.push(`ShippingQuoted: ${md.shippingQuoted}`);
  if (md.zip) lines.push(`ZIP meta: ${md.zip}`);

  // Line items
  lines.push(`--- ITEMS ---`);
  for (const li of (items.data || [])) {
    const name = li.description || "Producto";
    const qty = li.quantity || 0;
    const amt = typeof li.amount_total === "number" ? moneyMXNFromStripeAmount(li.amount_total) : "";
    lines.push(`• ${name} x${qty}${amt ? ` (${amt})` : ""}`);
  }

  return lines.join("\n");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: "Missing STRIPE_SECRET_KEY" });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return json(500, { error: "Missing STRIPE_WEBHOOK_SECRET" });

  // En Netlify los headers suelen venir en lowercase
  const sig =
    event.headers?.["stripe-signature"] ||
    event.headers?.["Stripe-Signature"] ||
    event.headers?.["STRIPE-SIGNATURE"];

  if (!sig) return json(400, { error: "Missing stripe-signature header" });

  const rawBody = getRawBodyBuffer(event);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message);
    return json(400, { error: `Webhook Error: ${err?.message}` });
  }

  try {
    const type = stripeEvent.type;

    // Card: checkout.session.completed (normalmente paid)
    // OXXO: checkout.session.async_payment_succeeded (confirmación)
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const session = stripeEvent.data.object;
      const summary = await buildOrderSummaryFromSession(session.id);

      await notifyOps(`${summary}\n\n✅ Evento: ${type}\nHora: ${new Date().toISOString()}`);

      return json(200, { ok: true });
    }

    // Fallas / expiraciones (útil operación)
    if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
      const session = stripeEvent.data.object;
      await notifyOps(
        `⚠️ SCORE STORE — Pago NO completado\nEvento: ${type}\nSession: ${session.id}\nHora: ${new Date().toISOString()}`
      );
      return json(200, { ok: true });
    }

    // Eventos financieros sensibles
    if (type === "charge.refunded" || type === "charge.dispute.created") {
      const obj = stripeEvent.data.object;
      await notifyOps(
        `⚠️ SCORE STORE — Evento financiero\nEvento: ${type}\nID: ${obj.id}\nHora: ${new Date().toISOString()}`
      );
      return json(200, { ok: true });
    }

    // Default: ACK sin ruido
    return json(200, { ok: true, received: type });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Stripe reintenta si no devuelves 2xx; aquí devolvemos 200 y log
    return json(200, { ok: false, error: err?.message || "handler_error" });
  }
};