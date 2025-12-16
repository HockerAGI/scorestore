/**
 * netlify/functions/envia_webhook.js
 * Receives Envia.com webhooks and sends notifications to Telegram/WhatsApp.
 *
 * Required:
 * - ENVIA_WEBHOOK_SECRET
 *
 * Optional Telegram:
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 *
 * Optional WhatsApp Cloud API:
 * - WHATSAPP_TOKEN
 * - WHATSAPP_PHONE_NUMBER_ID
 * - WHATSAPP_TO
 */

const crypto = require("crypto");

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function timingSafeEqualStr(a, b) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function getTokenFromRequest(event) {
  const h = event.headers || {};
  const tokenHeader =
    h["x-webhook-secret"] ||
    h["X-Webhook-Secret"] ||
    h["x-webhook-token"] ||
    h["X-Webhook-Token"] ||
    null;

  const auth = h["authorization"] || h["Authorization"] || "";
  const tokenBearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  const qs = event.queryStringParameters || {};
  const tokenQuery = qs.token || qs.secret || null;

  return tokenHeader || tokenBearer || tokenQuery || null;
}

function safeParse(event) {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { raw: event.body };
  }
}

function normalizeEvent(payload) {
  const tracking =
    payload?.tracking ||
    payload?.trackingNumber ||
    payload?.waybill ||
    payload?.guide ||
    payload?.guideNumber ||
    payload?.data?.tracking ||
    payload?.data?.trackingNumber ||
    payload?.data?.waybill ||
    payload?.data?.guide ||
    payload?.data?.guideNumber ||
    null;

  const status =
    payload?.status ||
    payload?.event ||
    payload?.state ||
    payload?.shipmentStatus ||
    payload?.data?.status ||
    payload?.data?.event ||
    payload?.data?.state ||
    payload?.data?.shipmentStatus ||
    null;

  const carrier =
    payload?.carrier ||
    payload?.provider ||
    payload?.company ||
    payload?.data?.carrier ||
    payload?.data?.provider ||
    payload?.data?.company ||
    null;

  const timestamp =
    payload?.timestamp ||
    payload?.updatedAt ||
    payload?.createdAt ||
    payload?.date ||
    payload?.data?.timestamp ||
    payload?.data?.updatedAt ||
    payload?.data?.createdAt ||
    payload?.data?.date ||
    new Date().toISOString();

  const reference =
    payload?.reference ||
    payload?.order ||
    payload?.orderId ||
    payload?.data?.reference ||
    payload?.data?.order ||
    payload?.data?.orderId ||
    null;

  return {
    tracking: tracking ? String(tracking) : null,
    status: status ? String(status) : "unknown",
    carrier: carrier ? String(carrier) : null,
    reference: reference ? String(reference) : null,
    timestamp: String(timestamp),
    raw: payload,
  };
}

function shouldNotify(status) {
  const s = String(status || "").toLowerCase();
  const important = [
    "created",
    "picked",
    "pickup",
    "collected",
    "in_transit",
    "in transit",
    "out_for_delivery",
    "out for delivery",
    "delivered",
    "exception",
    "failed",
    "cancel",
    "returned",
  ];
  return important.some((k) => s.includes(k));
}

function humanStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("delivered")) return "✅ ENTREGADO";
  if (s.includes("out_for_delivery") || s.includes("out for delivery")) return "🚚 EN RUTA (última milla)";
  if (s.includes("in_transit") || s.includes("in transit")) return "📦 EN TRÁNSITO";
  if (s.includes("pickup") || s.includes("picked") || s.includes("collected")) return "📍 RECOLECTADO";
  if (s.includes("created")) return "🧾 GUÍA CREADA";
  if (s.includes("exception") || s.includes("failed")) return "⚠️ INCIDENCIA";
  if (s.includes("returned")) return "↩️ DEVUELTO";
  if (s.includes("cancel")) return "⛔ CANCELADO";
  return `📌 ACTUALIZACIÓN: ${status}`;
}

function buildMessage(n) {
  const parts = [];
  parts.push(`SCORE STORE · Envia Update`);
  parts.push(`${humanStatus(n.status)}`);
  if (n.carrier) parts.push(`Paquetería: ${n.carrier}`);
  if (n.tracking) parts.push(`Guía: ${n.tracking}`);
  if (n.reference) parts.push(`Referencia: ${n.reference}`);
  parts.push(`Hora: ${n.timestamp}`);
  return parts.join("\n");
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
  return { ok: res.ok, channel: "telegram", status: res.status, data };
}

async function sendWhatsApp(text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_TO;
  if (!token || !phoneNumberId || !to) return { ok: false, skipped: true, channel: "whatsapp" };

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
  return { ok: res.ok, channel: "whatsapp", status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const expected = process.env.ENVIA_WEBHOOK_SECRET;
  if (!expected) return json(500, { error: "Missing ENVIA_WEBHOOK_SECRET env var" });

  const provided = getTokenFromRequest(event);
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return json(401, { error: "Unauthorized" });
  }

  const payload = safeParse(event);
  const normalized = normalizeEvent(payload);

  console.log("ENVIA_WEBHOOK_RECEIVED", {
    tracking: normalized.tracking,
    status: normalized.status,
    carrier: normalized.carrier,
    reference: normalized.reference,
    timestamp: normalized.timestamp,
  });

  const notify = shouldNotify(normalized.status);

  let telegramResult = { skipped: true };
  let whatsappResult = { skipped: true };

  if (notify) {
    const msg = buildMessage(normalized);

    const results = await Promise.allSettled([sendTelegram(msg), sendWhatsApp(msg)]);
    telegramResult = results[0].status === "fulfilled" ? results[0].value : { ok: false, error: String(results[0].reason) };
    whatsappResult = results[1].status === "fulfilled" ? results[1].value : { ok: false, error: String(results[1].reason) };
  }

  return json(200, {
    ok: true,
    received: true,
    notified: notify,
    channels: {
      telegram: telegramResult,
      whatsapp: whatsappResult,
    },
    normalized: {
      tracking: normalized.tracking,
      status: normalized.status,
      carrier: normalized.carrier,
      reference: normalized.reference,
      timestamp: normalized.timestamp,
    },
  });
};