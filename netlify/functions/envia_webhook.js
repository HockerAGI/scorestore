// netlify/functions/envia_webhook.js
// BLINDADO: Anti-spam + verificación Stripe + dedupe persistente (sin DB)
// Recomendado: usar INTERNAL_WEBHOOK_SECRET (lo manda stripe_webhook.js)
// Si no hay secret, valida contra Stripe: sesión pagada + eventId coincide con notify_event_id

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO = process.env.WHATSAPP_TO || "";

// Seguridad interna (opcional pero recomendado)
const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || "";

// Para verificación Stripe (súper recomendado para blindaje sin secret)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require("stripe")(STRIPE_SECRET_KEY);
  } catch {
    stripe = null;
  }
}

// Rate limit (warm)
const WINDOW_MS = 60 * 1000;
const MAX_REQ = 25;
const rate = new Map();

// Dedupe warm extra (por si llegan duplicados en segundos)
const recent = new Map(); // key -> ts
const RECENT_TTL_MS = 15 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function toStr(v) {
  return (v ?? "").toString().trim();
}

function upper(v) {
  return toStr(v).toUpperCase();
}

function hit(ip) {
  const t = Date.now();
  const cur = rate.get(ip) || { ts: t, n: 0 };
  if (t - cur.ts > WINDOW_MS) {
    rate.set(ip, { ts: t, n: 1 });
    return true;
  }
  if (cur.n >= MAX_REQ) return false;
  cur.n += 1;
  rate.set(ip, cur);
  return true;
}

function remember(key) {
  const now = Date.now();
  recent.set(key, now);
  // limpieza simple
  for (const [k, ts] of recent.entries()) {
    if (now - ts > RECENT_TTL_MS) recent.delete(k);
  }
}

function seen(key) {
  const ts = recent.get(key);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_TTL_MS) {
    recent.delete(key);
    return false;
  }
  return true;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoneyMXN(v) {
  const n = safeNum(v, 0);
  try {
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  } catch {
    return `$${n.toFixed(2)} MXN`;
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;

  try {
    await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: WHATSAPP_TO,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });
  } catch (e) {
    console.error("WhatsApp error:", e.message);
  }
}

function buildAddress(shipping) {
  const a = shipping?.address || shipping?.shipping_address || shipping?.shipping?.address || {};
  const line1 = toStr(a.line1);
  const city = toStr(a.city);
  const state = toStr(a.state);
  const postal = toStr(a.postal_code);
  const parts = [line1, city, state, postal].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function formatMessage(payload) {
  const lines = [];

  const orderId = toStr(payload.orderId);
  const total = safeNum(payload.total, 0);
  const currency = upper(payload.currency || "MXN");

  const promoCode = toStr(payload.promoCode || payload.metadata?.promo_code || "");
  const discountMXN = safeNum(payload.discountMXN ?? payload.metadata?.discount_mxn, 0);
  const shippingMXN = safeNum(payload.shippingMXN ?? payload.metadata?.shipping_mxn, 0);
  const shippingMode = toStr(payload.shippingMode ?? (payload.metadata?.shipping_mode ?? ""));

  const customerName = toStr(payload.customerName || "Cliente");
  const email = toStr(payload.email || "");
  const phone = toStr(payload.phone || "");

  const addr = buildAddress(payload.shipping || {});
  const items = Array.isArray(payload.items) ? payload.items : [];

  lines.push("✅ PAGO CONFIRMADO — SCORE STORE");
  lines.push(`🧾 Orden: ${orderId || "N/A"}`);

  if (customerName) lines.push(`👤 ${customerName}`);
  if (phone) lines.push(`📱 ${phone}`);
  if (email) lines.push(`📧 ${email}`);

  lines.push(`💰 Total: ${formatMoneyMXN(total)} (${currency})`);

  if (shippingMode || shippingMXN) {
    const modeLabel =
      shippingMode === "pickup" ? "RECOGER" :
      shippingMode === "tijuana_delivery" || shippingMode === "tj" ? "TIJUANA" :
      shippingMode === "envia" || shippingMode === "mx" ? "NACIONAL" :
      shippingMode ? shippingMode.toUpperCase() : "ENVÍO";

    lines.push(`🚚 Envío (${modeLabel}): ${formatMoneyMXN(shippingMXN)}`);
  }

  if (promoCode) lines.push(`🏷️ Cupón: ${promoCode}`);
  if (discountMXN > 0) lines.push(`🔻 Descuento: ${formatMoneyMXN(discountMXN)}`);

  if (addr) lines.push(`📍 Dirección: ${addr}`);

  if (items.length) {
    lines.push("🛒 Items:");
    for (const it of items.slice(0, 25)) {
      const name = toStr(it.name || it.title || "Item");
      const qty = safeNum(it.qty || it.quantity || 1, 1);
      lines.push(`• ${qty}x ${name}`);
    }
  }

  return lines.join("\n");
}

// Verificación Stripe (si no hay secret)
async function verifyWithStripe({ orderId, eventId }) {
  if (!stripe) return { ok: false, reason: "stripe_not_configured" };
  if (!orderId) return { ok: false, reason: "missing_orderId" };

  try {
    const session = await stripe.checkout.sessions.retrieve(orderId);

    // Asegura que esté pagado
    const paid =
      toStr(session.payment_status) === "paid" ||
      toStr(session.status) === "complete";

    if (!paid) return { ok: false, reason: "session_not_paid" };

    const meta = session.metadata || {};
    const status = toStr(meta.notify_status);
    const notifyEventId = toStr(meta.notify_event_id);

    // Dedupe persistente: si ya está sent, no reenviar.
    if (status === "sent") return { ok: true, dedupe: true, reason: "already_sent", meta };

    // Para aceptar sin secret: exigimos match de eventId con el que guardó stripe_webhook.js
    if (!eventId || !notifyEventId || eventId !== notifyEventId) {
      return { ok: false, reason: "eventId_mismatch", meta };
    }

    // Aceptamos si está en processing (flujo correcto) o error (reintento)
    if (status !== "processing" && status !== "error" && status !== "") {
      return { ok: false, reason: `invalid_notify_status:${status}`, meta };
    }

    return { ok: true, dedupe: false, reason: "verified", meta };
  } catch (e) {
    return { ok: false, reason: `stripe_error:${toStr(e.message)}` };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204 };

  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Método no permitido" });

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (toStr(event.headers["x-forwarded-for"]).split(",")[0] || "unknown");

  if (!hit(ip)) return json(429, { ok: false, error: "Rate limit" });

  // Parse body
  let payload = null;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "JSON inválido" });
  }

  const orderId = toStr(payload?.orderId);
  const eventId = toStr(payload?.eventId);

  if (!orderId) return json(400, { ok: false, error: "Falta orderId" });

  // Dedupe warm (extra)
  const warmKey = `${orderId}:${eventId || "noevent"}`;
  if (seen(warmKey)) return json(200, { ok: true, deduped: "warm" });
  remember(warmKey);

  // 1) Si hay secret y viene correcto, aceptamos directo
  const gotSecret = toStr(event.headers["x-internal-secret"] || "");
  const hasSecret = !!INTERNAL_WEBHOOK_SECRET;

  if (hasSecret) {
    if (gotSecret !== INTERNAL_WEBHOOK_SECRET) {
      // Si falla el secret, todavía podemos validar con Stripe (si está configurado)
      const v = await verifyWithStripe({ orderId, eventId });
      if (!v.ok) return json(401, { ok: false, error: "Unauthorized", reason: v.reason });

      if (v.dedupe) return json(200, { ok: true, deduped: "stripe_sent" });
      // ok verified
    }
  } else {
    // 2) Sin secret: debe pasar verificación Stripe sí o sí (para blindaje real)
    const v = await verifyWithStripe({ orderId, eventId });
    if (!v.ok) return json(401, { ok: false, error: "Unauthorized", reason: v.reason });

    if (v.dedupe) return json(200, { ok: true, deduped: "stripe_sent" });
  }

  // Validación mínima del payload para evitar basura
  const total = safeNum(payload?.total, 0);
  if (total <= 0) {
    // Si Stripe validó y el total llegó 0 por algún bug, no mandamos basura
    return json(200, { ok: true, skipped: "invalid_total" });
  }

  const msg = formatMessage(payload);

  await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);

  return json(200, { ok: true, sent: true });
};