/**
 * netlify/functions/stripe_webhook.js
 * Stripe Webhook handler (Netlify)
 *
 * Requiere env vars:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET (whsec_...)
 *
 * Notificaciones (opcionales):
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 *
 * Email (opcional, Gmail SMTP con App Password):
 * - SMTP_HOST (default: smtp.gmail.com)
 * - SMTP_PORT (default: 465)
 * - SMTP_USER (ej: ventas.unicotextil@gmail.com)
 * - SMTP_PASS (APP PASSWORD)
 * - EMAIL_TO   (default: SMTP_USER)
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

function getRawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");
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
      disable_web_page_preview: true
    })
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, channel: "telegram", data };
}

async function sendEmail(subject, text) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const to = process.env.EMAIL_TO || user;

  if (!user || !pass || !to) return { ok: false, skipped: true, channel: "email" };

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 SSL, 587 STARTTLS
    auth: { user, pass }
  });

  const info = await transporter.sendMail({
    from: `SCORE STORE <${user}>`,
    to,
    subject,
    text
  });

  return { ok: true, channel: "email", messageId: info.messageId };
}

async function notifyOps(subject, text) {
  const [tg, em] = await Promise.allSettled([
    sendTelegram(`${subject}\n\n${text}`),
    sendEmail(subject, text)
  ]);

  return {
    telegram: tg.status === "fulfilled" ? tg.value : { ok: false, error: String(tg.reason) },
    email: em.status === "fulfilled" ? em.value : { ok: false, error: String(em.reason) }
  };
}

async function buildOrderSummaryFromSession(sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent", "customer_details"]
  });

  const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });

  const lines = [];
  lines.push(`🧾 SCORE STORE — Pedido`);
  lines.push(`Session: ${session.id}`);
  if (session.payment_intent && session.payment_intent.id) lines.push(`PaymentIntent: ${session.payment_intent.id}`);
  lines.push(`Payment status: ${session.payment_status}`);
  lines.push(`Total: ${moneyMXNFromStripeAmount(session.amount_total)} MXN`);

  const email = session.customer_details?.email || session.customer_email || "";
  const phone = session.customer_details?.phone || "";
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Tel: ${phone}`);

  const shipName = session.shipping_details?.name || "";
  const addr = session.shipping_details?.address || {};
  const addrLine = [addr.line1, addr.line2].filter(Boolean).join(" ");
  const city = [addr.city, addr.state].filter(Boolean).join(", ");
  const cp = addr.postal_code || "";
  if (shipName) lines.push(`Envío a: ${shipName}`);
  if (addrLine || city || cp) lines.push(`Dirección: ${addrLine} · ${city} · CP ${cp}`);

  const md = session.metadata || {};
  if (md.shippingMXN) lines.push(`Envío MXN: ${md.shippingMXN}`);
  if (md.shippingQuoted) lines.push(`ShippingQuoted: ${md.shippingQuoted}`);
  if (md.zip) lines.push(`ZIP meta: ${md.zip}`);

  lines.push(`--- ITEMS ---`);
  for (const li of (items.data || [])) {
    const name = li.description || "Producto";
    const qty = li.quantity || 0;
    const amt = li.amount_total ? moneyMXNFromStripeAmount(li.amount_total) : "";
    lines.push(`• ${name} x${qty} ${amt ? `(${amt})` : ""}`);
  }

  return lines.join("\n");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: "Missing STRIPE_SECRET_KEY" });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return json(500, { error: "Missing STRIPE_WEBHOOK_SECRET" });

  const sig = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  if (!sig) return json(400, { error: "Missing stripe-signature header" });

  const rawBody = getRawBody(event);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message);
    return json(400, { error: `Webhook Error: ${err?.message}` });
  }

  try {
    const type = stripeEvent.type;

    // Importante:
    // - Card: checkout.session.completed (normalmente paid)
    // - OXXO: el “pago confirmado” llega en checkout.session.async_payment_succeeded
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const session = stripeEvent.data.object;
      const summary = await buildOrderSummaryFromSession(session.id);

      const subject = `SCORE STORE — ${type}`;
      await notifyOps(subject, `${summary}\n\nHora: ${new Date().toISOString()}`);

      return json(200, { ok: true });
    }

    if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
      const session = stripeEvent.data.object;
      const subject = `⚠️ SCORE STORE — Pago NO completado (${type})`;
      await notifyOps(subject, `Session: ${session.id}\nHora: ${new Date().toISOString()}`);
      return json(200, { ok: true });
    }

    // ACK silencioso
    return json(200, { ok: true, received: type });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Stripe reintenta si no devuelves 2xx; aquí devolvemos 200 y log.
    return json(200, { ok: false, error: err?.message || "handler_error" });
  }
};