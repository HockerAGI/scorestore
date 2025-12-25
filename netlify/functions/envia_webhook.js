// netlify/functions/envia_webhook.js
// Notificaciones — PRODUCCIÓN

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TO = process.env.WHATSAPP_TO;

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

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
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
      text: { body: text, preview_url: false },
    }),
  });
}

function format(o) {
  const lines = [];
  lines.push("🚨 NUEVA VENTA CONFIRMADA");
  lines.push(`🧾 Orden: ${o.orderId}`);
  if (o.customerName) lines.push(`👤 ${o.customerName}`);
  if (o.email) lines.push(`📧 ${o.email}`);
  if (o.phone) lines.push(`📱 ${o.phone}`);
  lines.push(`💰 Total: $${Number(o.total).toFixed(2)} ${o.currency || "MXN"}`);

  if (Array.isArray(o.items)) {
    lines.push("🛒 Items:");
    o.items.forEach((it) => lines.push(`• ${it.qty}x ${it.name}`));
  }

  return lines.join("\n");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  const body = JSON.parse(event.body || "{}");
  const msg = format(body);

  await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);
  return json(200, { ok: true });
};