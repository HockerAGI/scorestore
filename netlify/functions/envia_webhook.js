// netlify/functions/envia_webhook.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO = process.env.WHATSAPP_TO || "";

const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  stripe = require("stripe")(STRIPE_SECRET_KEY);
}

/* ---------- RESP ---------- */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-internal-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/* ---------- HELPERS ---------- */
const toStr = v => (v ?? "").toString().trim();
const upper = v => toStr(v).toUpperCase();
const safeNum = (v, f = 0) => Number.isFinite(+v) ? +v : f;

/* ---------- RATE LIMIT ---------- */
const rate = new Map();
const WINDOW_MS = 60_000;
const MAX_REQ = 25;

function hit(ip) {
  const now = Date.now();
  const r = rate.get(ip) || { ts: now, n: 0 };
  if (now - r.ts > WINDOW_MS) {
    rate.set(ip, { ts: now, n: 1 });
    return true;
  }
  if (r.n >= MAX_REQ) return false;
  r.n++;
  rate.set(ip, r);
  return true;
}

/* ---------- DEDUPE ---------- */
const recent = new Map();
const RECENT_TTL = 15 * 60_000;

function seen(k) {
  const t = recent.get(k);
  if (!t) return false;
  if (Date.now() - t > RECENT_TTL) {
    recent.delete(k);
    return false;
  }
  return true;
}

function remember(k) {
  const now = Date.now();
  recent.set(k, now);
  for (const [x, t] of recent) {
    if (now - t > RECENT_TTL) recent.delete(x);
  }
}

/* ---------- FORMAT ---------- */
function formatMoney(v) {
  return `$${safeNum(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

/* ---------- NOTIFY ---------- */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
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
      text: { body: text },
    }),
  });
}

/* ---------- VERIFY STRIPE ---------- */
async function verifyStripe(orderId) {
  if (!stripe) return { ok: false };
  const s = await stripe.checkout.sessions.retrieve(orderId);
  const paid = s.payment_status === "paid" || s.status === "complete";
  if (!paid) return { ok: false };
  return { ok: true, session: s };
}

/* ---------- HANDLER ---------- */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    toStr(event.headers["x-forwarded-for"]).split(",")[0] ||
    "unknown";

  if (!hit(ip)) return json(429, { error: "Rate limit" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const orderId = toStr(payload.orderId);
  if (!orderId) return json(400, { error: "Falta orderId" });

  const key = orderId;
  if (seen(key)) return json(200, { ok: true, deduped: true });
  remember(key);

  const secret = toStr(event.headers["x-internal-secret"]);
  if (INTERNAL_WEBHOOK_SECRET && secret !== INTERNAL_WEBHOOK_SECRET) {
    const v = await verifyStripe(orderId);
    if (!v.ok) return json(401, { error: "Unauthorized" });
  }

  const total = safeNum(payload.total);
  if (total <= 0) return json(200, { skipped: "invalid_total" });

  const msg = [
    "✅ PAGO CONFIRMADO — SCORE STORE",
    `🧾 Orden: ${orderId}`,
    `💰 Total: ${formatMoney(total)}`,
  ].join("\n");

  await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);

  // 🔐 Marca como enviado (dedupe persistente)
  if (stripe) {
    try {
      await stripe.checkout.sessions.update(orderId, {
        metadata: { notify_status: "sent" },
      });
    } catch {}
  }

  return json(200, { ok: true, sent: true });
};