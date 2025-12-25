// netlify/functions/envia_webhook.js
// Node 18+ (fetch nativo) — PRODUCCIÓN

/* ===============================
   CONFIGURACIÓN
================================ */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO = process.env.WHATSAPP_TO || "";

const ALLOWED_ORIGINS = [
  (process.env.URL || "").replace(/\/+$/, ""),
  (process.env.DEPLOY_PRIME_URL || "").replace(/\/+$/, ""),
  (process.env.DEPLOY_URL || "").replace(/\/+$/, ""),
].filter(Boolean);

// rate limit simple (memoria caliente)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 30; // requests/min
const rateMap = new Map();

// idempotencia básica
const seenOrders = new Set();

/* ===============================
   HELPERS
================================ */
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

function now() {
  return Date.now();
}

/* ===============================
   SEGURIDAD
================================ */
function checkOrigin(event) {
  if (!ALLOWED_ORIGINS.length) return true; // fail-safe

  const origin =
    toStr(event.headers?.origin) ||
    toStr(event.headers?.referer).replace(/\/+$/, "");

  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

function checkRateLimit(ip) {
  const t = now();
  const slot = rateMap.get(ip) || { count: 0, ts: t };

  if (t - slot.ts > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, ts: t });
    return true;
  }

  if (slot.count >= RATE_LIMIT_MAX) return false;

  slot.count += 1;
  rateMap.set(ip, slot);
  return true;
}

function validatePayload(p) {
  if (!p || typeof p !== "object") return false;
  if (!p.orderId) return false;
  if (!p.total) return false;
  if (!Array.isArray(p.items)) return false;
  return true;
}

/* ===============================
   NOTIFICACIONES
================================ */
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

/* ===============================
   FORMATO MENSAJE
================================ */
function formatMessage(o) {
  const lines = [];
  lines.push("🚨 NUEVA VENTA CONFIRMADA");
  lines.push(`🧾 Orden: ${o.orderId}`);
  if (o.customerName) lines.push(`👤 ${o.customerName}`);
  if (o.email) lines.push(`📧 ${o.email}`);
  if (o.phone) lines.push(`📱 ${o.phone}`);
  lines.push(`💰 Total: $${Number(o.total).toFixed(2)} ${o.currency || "MXN"}`);

  if (o.shipping?.address?.line1) {
    const a = o.shipping.address;
    lines.push("🚚 Envío:");
    lines.push(`${a.line1}, ${a.city || ""} ${a.state || ""} ${a.postal_code || ""}`);
  }

  if (o.items.length) {
    lines.push("🛒 Items:");
    o.items.forEach(it => {
      lines.push(`• ${it.qty}x ${it.name}`);
    });
  }

  return lines.join("\n");
}

/* ===============================
   HANDLER
================================ */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  // Origin lock
  if (!checkOrigin(event)) {
    return json(403, { ok: false, error: "Forbidden origin" });
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"] ||
    "unknown";

  // Rate limit
  if (!checkRateLimit(ip)) {
    return json(429, { ok: false, error: "Rate limit exceeded" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  // Payload validation
  if (!validatePayload(body)) {
    return json(400, { ok: false, error: "Invalid payload" });
  }

  // Idempotencia (evita doble aviso)
  if (seenOrders.has(body.orderId)) {
    return json(200, { ok: true, duplicated: true });
  }
  seenOrders.add(body.orderId);

  const msg = formatMessage(body);

  await Promise.all([
    sendTelegram(msg),
    sendWhatsApp(msg),
  ]);

  return json(200, { ok: true });
};