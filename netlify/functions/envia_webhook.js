// netlify/functions/envia_webhook.js
// BLINDADO: rate-limit, dedupe, Stripe verify, Envia best-effort

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO = process.env.WHATSAPP_TO || "";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try { stripe = require("stripe")(STRIPE_SECRET_KEY); } catch { stripe = null; }
}

const ENVIA_BASE = "https://api.envia.com";

/* ---------- helpers ---------- */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body),
  };
}
function toStr(v) { return (v ?? "").toString().trim(); }
function safeNum(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

function formatMoneyMXN(v) {
  const n = safeNum(v, 0);
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

/* ---------- rate limit (warm) ---------- */
const WINDOW_MS = 60 * 1000;
const MAX_REQ = 25;
const rate = new Map();

function hit(ip) {
  const t = Date.now();
  const cur = rate.get(ip) || { ts: t, n: 0 };
  if (t - cur.ts > WINDOW_MS) { rate.set(ip, { ts: t, n: 1 }); return true; }
  if (cur.n >= MAX_REQ) return false;
  cur.n += 1; rate.set(ip, cur); return true;
}

/* ---------- dedupe (warm) ---------- */
const recent = new Map();
const RECENT_TTL_MS = 15 * 60 * 1000;

function remember(key) {
  const now = Date.now();
  recent.set(key, now);
  for (const [k, ts] of recent.entries()) if (now - ts > RECENT_TTL_MS) recent.delete(k);
}
function seen(key) {
  const ts = recent.get(key);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_TTL_MS) { recent.delete(key); return false; }
  return true;
}

/* ---------- notify ---------- */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: WHATSAPP_TO,
      type: "text",
      text: { body: text, preview_url: false },
    }),
  }).catch(() => {});
}

/* ---------- Stripe verify ---------- */
async function verifyPaid(orderId) {
  if (!stripe) return { ok: false, reason: "stripe_not_configured" };
  const session = await stripe.checkout.sessions.retrieve(orderId);
  const paid = session.payment_status === "paid" || session.status === "complete";
  return paid ? { ok: true, session } : { ok: false, reason: "not_paid" };
}

/* ---------- Envia ---------- */
const ORIGIN = {
  name: "SCORE Store",
  company: "ÚNICO UNIFORMES",
  email: "ventas.unicotextil@gmail.com",
  phone: "0000000000",
  street: "Av. Revolución",
  number: "123",
  district: "Zona Centro",
  city: "Tijuana",
  state: "BCN",
  country_code: "MX",
  postal_code: "22000",
};

async function tryCreateEnviaLabel({ orderId, shipping, items }) {
  if (!ENVIA_API_KEY || !shipping?.address?.postal_code) return { ok: false };

  const payload = {
    origin: ORIGIN,
    destination: {
      name: toStr(shipping.name) || "Cliente",
      street: toStr(shipping.address.line1),
      city: toStr(shipping.address.city),
      state: toStr(shipping.address.state),
      postal_code: toStr(shipping.address.postal_code),
      country_code: "MX",
    },
    packages: [{
      content: "Merch",
      amount: 1,
      type: "box",
      weight: Math.max(0.5, items.length * 0.5),
      length: 30,
      width: 25,
      height: 10,
    }]
  };

  const res = await fetch(`${ENVIA_BASE}/ship/generate/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIA_API_KEY}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!res || !res.ok) return { ok: false };
  return { ok: true };
}

/* ---------- handler ---------- */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Método no permitido" });
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (toStr(event.headers["x-forwarded-for"]).split(",")[0] || "unknown");

  if (!hit(ip)) return json(429, { ok: false, error: "Rate limit" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const orderId = toStr(payload.orderId);
  if (!orderId) return json(400, { ok: false, error: "Falta orderId" });

  const warmKey = `${orderId}:${toStr(payload.eventId || "noevent")}`;
  if (seen(warmKey)) return json(200, { ok: true, deduped: true });
  remember(warmKey);

  const v = await verifyPaid(orderId);
  if (!v.ok) return json(200, { ok: false, reason: v.reason });

  let enviaInfo = "Pickup: no aplica guía.";
  if (payload.shippingMode && payload.shippingMode !== "pickup") {
    const r = await tryCreateEnviaLabel({
      orderId,
      shipping: payload.shipping,
      items: payload.items || [],
    });
    enviaInfo = r.ok ? "Guía Envia creada automáticamente" : "Guía no creada (manual)";
  }

  const msg = [
    "✅ PAGO CONFIRMADO — SCORE STORE",
    `🧾 Orden: ${orderId}`,
    `💰 Total: ${formatMoneyMXN(payload.total)}`,
    enviaInfo,
    "",
    "🧾 Facturación:",
    "ventas.unicotextil@gmail.com"
  ].join("\n");

  await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);
  return json(200, { ok: true });
};