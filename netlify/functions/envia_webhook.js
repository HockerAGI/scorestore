// netlify/functions/envia_webhook.js
// PRODUCCIÓN — Envíos + Notificaciones

const ENVIA_API_KEY = process.env.ENVIA_API_KEY;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TO = process.env.WHATSAPP_TO;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
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
  await fetch(
    `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
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
    }
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const lines = [];
  lines.push("✅ NUEVA ORDEN — SCORE STORE");
  lines.push(`🧾 Orden: ${payload.orderId}`);
  lines.push(`👤 Cliente: ${payload.customer?.name || "N/D"}`);
  if (payload.customer?.email) lines.push(`📧 ${payload.customer.email}`);
  if (payload.customer?.phone) lines.push(`📱 ${payload.customer.phone}`);
  lines.push(`💰 Total: $${payload.total} MXN`);
  lines.push("");
  lines.push("🛒 Items:");
  payload.items.forEach((i) =>
    lines.push(`• ${i.qty}x ${i.name}`)
  );

  if (payload.shipping?.address) {
    const a = payload.shipping.address;
    lines.push("");
    lines.push("📦 Envío:");
    lines.push(`${a.line1 || ""}, ${a.city || ""}, ${a.state || ""}, ${a.postal_code || ""}`);
  }

  lines.push("");
  lines.push("🧾 FACTURACIÓN:");
  lines.push("Enviar datos fiscales del cliente a:");
  lines.push("ventas.unicotextil@gmail.com");

  const message = lines.join("\n");

  await Promise.all([
    sendTelegram(message),
    sendWhatsApp(message),
  ]);

  return json(200, { ok: true });
};